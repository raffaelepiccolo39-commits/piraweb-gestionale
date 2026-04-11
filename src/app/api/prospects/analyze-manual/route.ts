export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Analyze a business from manually provided data (website, social, etc.)
 * No Google Places dependency - works with any data you have.
 * POST /api/prospects/analyze-manual
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`analyze-manual:${user.id}`, { maxRequests: 20, windowSeconds: 3600 });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Troppe analisi. Riprova tra poco.' }, { status: 429 });

  const { business_name, website, instagram_url, facebook_url, phone, city, sector } = await request.json();
  if (!business_name) return NextResponse.json({ error: 'Nome attivita\' obbligatorio' }, { status: 400 });

  const result: Record<string, unknown> = {
    business_name,
    address: city || '',
    city: city || '',
    sector: sector || '',
    google_place_id: null,
    google_rating: null,
    google_reviews_count: null,
    google_maps_url: null,
    website: website || null,
    phone: phone || null,
    has_website: !!website,
    instagram_url: instagram_url || null,
    instagram_followers: null,
    instagram_posts: null,
    instagram_is_curated: null,
    instagram_verdict: '',
    facebook_url: facebook_url || null,
    tiktok_url: null,
    linkedin_url: null,
    youtube_url: null,
    has_ssl: false,
    has_mobile: false,
    has_analytics: false,
    has_facebook_pixel: false,
    has_google_ads: false,
    has_tiktok_pixel: false,
    has_contact_form: false,
    has_cookie_banner: false,
    has_meta_ads: false,
    meta_ads_count: 0,
    meta_ads_url: '',
    social_count: 0,
    adv_count: 0,
    website_issues: [] as string[],
    social_issues: [] as string[],
    adv_issues: [] as string[],
    score_website: 0,
    score_social: 0,
    score_advertising: 0,
    score_seo: 0,
    score_total: 0,
    response_time_ms: null,
  };

  // ═══════ Check Meta Ad Library ═══════
  try {
    const query = encodeURIComponent(`${business_name} ${city || ''}`);
    result.meta_ads_url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IT&q=${query}`;
    const adRes = await fetchWithTimeout(
      `https://www.facebook.com/ads/library/async/search_ads/?q=${query}&count=5&active_status=active&ad_type=all&country=IT`,
      5000
    );
    if (adRes) {
      const text = await adRes.text();
      const hasAds = text.includes('ad_archive_id') || text.includes('ad_snapshot_url');
      const adMatches = text.match(/ad_archive_id/g);
      result.has_meta_ads = hasAds;
      result.meta_ads_count = adMatches ? adMatches.length : 0;
    }
  } catch { /* skip */ }

  // ═══════ Analyze Instagram ═══════
  if (instagram_url) {
    try {
      const igRes = await fetchWithTimeout(instagram_url, 6000);
      if (igRes && igRes.ok) {
        const html = await igRes.text();

        let followers: number | null = null;
        let posts: number | null = null;

        // Extract from meta tags
        const metaDesc = html.match(/content="([\d.,KkMm]+)\s*Follower/i);
        if (metaDesc) followers = parseCount(metaDesc[1]);

        const postsMatch = html.match(/([\d.,KkMm]+)\s*Post/i);
        if (postsMatch) posts = parseCount(postsMatch[1]);

        // Fallback: og:description
        if (followers === null) {
          const ogDesc = html.match(/og:description[^>]*content="([^"]+)"/i);
          if (ogDesc) {
            const desc = ogDesc[1];
            const fMatch = desc.match(/([\d.,KkMm]+)\s*Follower/i);
            const pMatch = desc.match(/([\d.,KkMm]+)\s*Post/i);
            if (fMatch) followers = parseCount(fMatch[1]);
            if (pMatch) posts = parseCount(pMatch[1]);
          }
        }

        // Fallback: JSON data
        if (followers === null) {
          const jsonMatch = html.match(/"edge_followed_by":\s*\{"count":\s*(\d+)/);
          if (jsonMatch) followers = parseInt(jsonMatch[1]);
          const postsJson = html.match(/"edge_owner_to_timeline_media":\s*\{"count":\s*(\d+)/);
          if (postsJson) posts = parseInt(postsJson[1]);
        }

        result.instagram_followers = followers;
        result.instagram_posts = posts;

        // Determine curation
        if (posts !== null) {
          if (posts === 0) { result.instagram_is_curated = false; result.instagram_verdict = 'Profilo vuoto (0 post)'; }
          else if (posts < 10) { result.instagram_is_curated = false; result.instagram_verdict = `Solo ${posts} post - profilo abbandonato`; }
          else if (posts < 30) { result.instagram_is_curated = false; result.instagram_verdict = `${posts} post - pubblicazione poco frequente`; }
          else if (posts < 100) { result.instagram_is_curated = true; result.instagram_verdict = `${posts} post - profilo moderatamente attivo`; }
          else { result.instagram_is_curated = true; result.instagram_verdict = `${posts} post - profilo ben curato`; }
          if (followers !== null) result.instagram_verdict += `, ${followers} follower`;
        } else if (followers !== null) {
          result.instagram_verdict = `${followers} follower - verificare attivita' manualmente`;
        } else {
          result.instagram_verdict = 'Dati non disponibili - verificare manualmente';
        }

        // Also look for TikTok/LinkedIn from Instagram bio links
        const tkMatch = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);
        if (tkMatch) result.tiktok_url = `https://tiktok.com/@${tkMatch[1]}`;
      }
    } catch { /* skip */ }
  }

  // ═══════ Analyze Website ═══════
  if (website) {
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      const startTime = Date.now();
      const siteRes = await fetchWithTimeout(url, 8000);

      if (siteRes && siteRes.ok) {
        const elapsed = Date.now() - startTime;
        result.response_time_ms = elapsed;
        const html = await siteRes.text();
        const lower = html.toLowerCase();

        const hasSSL = url.startsWith('https') || siteRes.url.startsWith('https');
        const hasViewport = lower.includes('viewport');
        const hasAnalytics = lower.includes('google-analytics') || lower.includes('gtag(') || lower.includes('googletagmanager');
        const hasContactForm = lower.includes('type="email"') || lower.includes('contact') || lower.includes('contatt');
        const hasCookieBanner = lower.includes('cookie') || lower.includes('iubenda') || lower.includes('cookiebot') || lower.includes('gdpr');

        result.has_ssl = hasSSL;
        result.has_mobile = hasViewport;
        result.has_analytics = hasAnalytics;
        result.has_contact_form = hasContactForm;
        result.has_cookie_banner = hasCookieBanner;

        const wIssues: string[] = [];
        if (!hasSSL) wIssues.push('Manca HTTPS/SSL');
        if (!hasViewport) wIssues.push('Non ottimizzato per mobile');
        if (!hasAnalytics) wIssues.push('Nessun Analytics/tracking');
        if (!hasContactForm) wIssues.push('Nessun form di contatto');
        if (!hasCookieBanner) wIssues.push('Manca banner cookie/GDPR');
        if (elapsed > 3000) wIssues.push(`Sito lento (${elapsed}ms)`);
        result.website_issues = wIssues;

        let scoreW = 20;
        if (hasSSL) scoreW += 15;
        if (hasViewport) scoreW += 20;
        if (hasAnalytics) scoreW += 15;
        if (hasContactForm) scoreW += 10;
        if (hasCookieBanner) scoreW += 10;
        if (elapsed < 2000) scoreW += 10;
        result.score_website = Math.min(scoreW, 100);

        // Detect social from website if not already provided
        if (!result.instagram_url) {
          const igM = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
          if (igM) result.instagram_url = `https://instagram.com/${igM[1]}`;
        }
        if (!result.facebook_url) {
          const fbM = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
          if (fbM) result.facebook_url = `https://facebook.com/${fbM[1]}`;
        }
        if (!result.tiktok_url) {
          const tkM = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);
          if (tkM) result.tiktok_url = `https://tiktok.com/@${tkM[1]}`;
        }

        // ADV detection from website
        const hasFBPixel = lower.includes('fbq(') || lower.includes('fbevents.js') || lower.includes('facebook.com/tr');
        const hasGoogleAds = lower.includes('google_conversion') || lower.includes('googleads') || lower.includes('ads/ga-audiences');
        const hasTikTokPixel = lower.includes('ttq.load') || lower.includes('analytics.tiktok.com');
        result.has_facebook_pixel = hasFBPixel;
        result.has_google_ads = hasGoogleAds;
        result.has_tiktok_pixel = hasTikTokPixel;

        let advCount = 0;
        if (hasFBPixel) advCount++;
        if (hasGoogleAds) advCount++;
        if (hasTikTokPixel) advCount++;
        if (result.has_meta_ads) advCount++;
        result.adv_count = advCount;

        const aIssues: string[] = [];
        if (!hasFBPixel && !result.has_meta_ads) aIssues.push('Nessun Facebook Pixel e nessuna ADV su Meta');
        else if (!hasFBPixel && result.has_meta_ads) aIssues.push('Fanno ADV su Meta ma manca il Pixel sul sito');
        if (!hasGoogleAds) aIssues.push('Nessun Google Ads');
        if (advCount === 0) aIssues.push('Nessuna campagna ADV attiva');
        result.adv_issues = aIssues;

        result.score_advertising = advCount >= 3 ? 90 : advCount === 2 ? 65 : advCount === 1 ? 35 : 0;
      } else {
        result.website_issues = ['Sito non raggiungibile'];
        result.score_website = 5;
      }
    } catch {
      result.website_issues = ['Errore nell\'analisi del sito'];
      result.score_website = 5;
    }
  } else {
    result.website_issues = ['Nessun sito web'];
    const aIssues: string[] = [];
    if (!result.has_meta_ads) aIssues.push('Nessuna pubblicita\' attiva su Facebook/Instagram');
    result.adv_issues = aIssues;
    result.score_advertising = result.has_meta_ads ? 40 : 0;
  }

  // ═══════ Social score ═══════
  let socialCount = 0;
  const sIssues: string[] = [];
  if (result.instagram_url) socialCount++; else sIssues.push('Instagram non trovato');
  if (result.facebook_url) socialCount++; else sIssues.push('Facebook non trovato');
  if (result.tiktok_url) socialCount++; else sIssues.push('TikTok non trovato');
  result.social_count = socialCount;
  result.social_issues = sIssues;

  let scoreS = socialCount >= 3 ? 70 : socialCount === 2 ? 50 : socialCount === 1 ? 25 : 0;
  if (result.instagram_url && result.instagram_is_curated === false) scoreS = Math.max(scoreS - 20, 5);
  if (result.instagram_url && result.instagram_is_curated === true) scoreS = Math.min(scoreS + 15, 100);
  result.score_social = scoreS;

  // ═══════ SEO score (no Google data for manual) ═══════
  result.score_seo = result.has_website ? 40 : 10;

  // ═══════ Total ═══════
  result.score_total = Math.round(
    (result.score_website as number) * 0.3 +
    (result.score_social as number) * 0.25 +
    (result.score_advertising as number) * 0.25 +
    (result.score_seo as number) * 0.2
  );

  return NextResponse.json({ result });
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

function parseCount(str: string): number {
  const clean = str.replace(/[.,]/g, '').trim();
  if (clean.toLowerCase().endsWith('k')) return parseInt(clean) * 1000;
  if (clean.toLowerCase().endsWith('m')) return parseInt(clean) * 1000000;
  return parseInt(clean) || 0;
}
