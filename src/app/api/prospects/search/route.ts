export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Search businesses AND analyze their digital presence in one step.
 * Returns real data from Google Places + website scanning.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { query, city, sector } = await request.json();
  if (!query) return NextResponse.json({ error: 'Query obbligatoria' }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY non configurata' }, { status: 500 });

  // ═══════ Step 1: Search Google Places ═══════
  let places: Record<string, unknown>[] = [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'it', maxResultCount: 20 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: `Google API: ${(err as Record<string, Record<string, string>>)?.error?.message || res.statusText}` }, { status: 500 });
    }
    const data = await res.json();
    places = data.places || [];
  } catch {
    return NextResponse.json({ error: 'Errore nella connessione a Google Places' }, { status: 500 });
  }

  if (places.length === 0) {
    return NextResponse.json({ results: [], count: 0 });
  }

  // ═══════ Step 2: For each place, scan website for REAL analysis ═══════
  const results = await Promise.all(
    places.map(async (place) => {
      const name = (place.displayName as Record<string, string>)?.text || '';
      const website = (place.websiteUri as string) || null;
      const rating = (place.rating as number) || null;
      const reviews = (place.userRatingCount as number) || null;

      // Base result from Google
      const result: Record<string, unknown> = {
        business_name: name,
        address: (place.formattedAddress as string) || '',
        city: city || '',
        sector: sector || '',
        google_place_id: place.id,
        google_rating: rating,
        google_reviews_count: reviews,
        google_maps_url: (place.googleMapsUri as string) || null,
        website,
        phone: (place.nationalPhoneNumber as string) || null,
        // Analysis results
        has_website: !!website,
        instagram_url: null,
        facebook_url: null,
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

      // ═══════ Check Meta Ad Library (works for ALL businesses) ═══════
      const adLibraryResult = await checkMetaAdLibrary(name, city || '');
      result.has_meta_ads = adLibraryResult.hasAds;
      result.meta_ads_count = adLibraryResult.adCount;
      result.meta_ads_url = adLibraryResult.libraryUrl;

      // ═══════ Try to find social profiles via Google search ═══════
      const socialSearch = await findSocialProfiles(name, city || '', apiKey);
      if (socialSearch.instagram) result.instagram_url = socialSearch.instagram;
      if (socialSearch.facebook) result.facebook_url = socialSearch.facebook;
      if (socialSearch.tiktok) result.tiktok_url = socialSearch.tiktok;

      // No website = already a big finding
      if (!website) {
        result.website_issues = ['Nessun sito web'];

        // But we can still check social and ads
        let socialCount = 0;
        const socialIssues: string[] = [];
        if (result.instagram_url) socialCount++; else socialIssues.push('Instagram non trovato');
        if (result.facebook_url) socialCount++; else socialIssues.push('Facebook non trovato');
        if (result.tiktok_url) socialCount++; else socialIssues.push('TikTok non trovato');
        result.social_count = socialCount;
        result.social_issues = socialIssues;
        result.score_social = socialCount >= 3 ? 70 : socialCount === 2 ? 50 : socialCount === 1 ? 25 : 0;

        const advIssues: string[] = [];
        if (!adLibraryResult.hasAds) advIssues.push('Nessuna pubblicita\' attiva su Facebook/Instagram');
        result.adv_issues = advIssues;
        result.score_advertising = adLibraryResult.hasAds ? 40 : 0;
        if (adLibraryResult.hasAds) result.has_facebook_pixel = true; // they do ads at least

        result.score_seo = rating && rating >= 4 && reviews && reviews > 20 ? 60 : rating ? 30 : 10;
        result.score_total = Math.round(
          (result.score_social as number) * 0.3 +
          (result.score_advertising as number) * 0.3 +
          (result.score_seo as number) * 0.2 +
          0 * 0.2 // no website
        );
        return result;
      }

      // ═══════ Scan website ═══════
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const startTime = Date.now();

        const siteRes = await fetch(website, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PiraWebBot/1.0)' },
          redirect: 'follow',
        });
        clearTimeout(timer);

        const elapsed = Date.now() - startTime;
        result.response_time_ms = elapsed;

        const html = await siteRes.text();
        const lower = html.toLowerCase();

        // ── Website checks ──
        const hasSSL = website.startsWith('https') || siteRes.url.startsWith('https');
        const hasViewport = lower.includes('viewport');
        const hasAnalytics = lower.includes('google-analytics') || lower.includes('gtag(') || lower.includes('googletagmanager');
        const hasContactForm = lower.includes('type="email"') || lower.includes('type=\'email\'') || lower.includes('contact') || lower.includes('contatt');
        const hasCookieBanner = lower.includes('cookie') || lower.includes('iubenda') || lower.includes('cookiebot') || lower.includes('gdpr');

        result.has_ssl = hasSSL;
        result.has_mobile = hasViewport;
        result.has_analytics = hasAnalytics;
        result.has_contact_form = hasContactForm;
        result.has_cookie_banner = hasCookieBanner;

        const websiteIssues: string[] = [];
        if (!hasSSL) websiteIssues.push('Manca HTTPS/SSL');
        if (!hasViewport) websiteIssues.push('Non ottimizzato per mobile');
        if (!hasAnalytics) websiteIssues.push('Nessun Analytics/tracking');
        if (!hasContactForm) websiteIssues.push('Nessun form di contatto');
        if (!hasCookieBanner) websiteIssues.push('Manca banner cookie/GDPR');
        if (elapsed > 3000) websiteIssues.push(`Sito lento (${elapsed}ms)`);
        result.website_issues = websiteIssues;

        let scoreW = 20; // ha un sito
        if (hasSSL) scoreW += 15;
        if (hasViewport) scoreW += 20;
        if (hasAnalytics) scoreW += 15;
        if (hasContactForm) scoreW += 10;
        if (hasCookieBanner) scoreW += 10;
        if (elapsed < 2000) scoreW += 10;
        result.score_website = Math.min(scoreW, 100);

        // ── Social media detection from website HTML ──
        const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
        const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
        const tkMatch = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);
        const liMatch = html.match(/linkedin\.com\/(company|in)\/([a-zA-Z0-9_-]+)/);
        const ytMatch = html.match(/youtube\.com\/(channel|c|@)\/([a-zA-Z0-9_-]+)/);

        if (igMatch) result.instagram_url = `https://instagram.com/${igMatch[1]}`;
        if (fbMatch) result.facebook_url = `https://facebook.com/${fbMatch[1]}`;
        if (tkMatch) result.tiktok_url = `https://tiktok.com/@${tkMatch[1]}`;
        if (liMatch) result.linkedin_url = `https://linkedin.com/${liMatch[0]}`;
        if (ytMatch) result.youtube_url = `https://youtube.com/${ytMatch[0]}`;

        let socialCount = 0;
        if (igMatch) socialCount++;
        if (fbMatch) socialCount++;
        if (tkMatch) socialCount++;
        if (liMatch) socialCount++;
        if (ytMatch) socialCount++;
        result.social_count = socialCount;

        const socialIssues: string[] = [];
        if (!igMatch) socialIssues.push('Instagram non trovato');
        if (!fbMatch) socialIssues.push('Facebook non trovato');
        if (!tkMatch) socialIssues.push('TikTok non trovato');
        result.social_issues = socialIssues;

        let scoreS = 0;
        if (socialCount >= 4) scoreS = 90;
        else if (socialCount >= 3) scoreS = 70;
        else if (socialCount === 2) scoreS = 50;
        else if (socialCount === 1) scoreS = 25;
        result.score_social = scoreS;

        // ── Advertising detection ──
        const hasFBPixel = lower.includes('fbq(') || lower.includes('fbevents.js') || lower.includes('facebook.com/tr');
        const hasGoogleAds = lower.includes('google_conversion') || lower.includes('googleads') || lower.includes('ads/ga-audiences');
        const hasTikTokPixel = lower.includes('ttq.load') || lower.includes('analytics.tiktok.com');
        const hasLinkedInTag = lower.includes('snap.licdn.com') || lower.includes('linkedin.com/px');
        const hasAnyRetargeting = lower.includes('criteo') || lower.includes('adroll') || lower.includes('doubleclick');

        result.has_facebook_pixel = hasFBPixel;
        result.has_google_ads = hasGoogleAds;
        result.has_tiktok_pixel = hasTikTokPixel;

        let advCount = 0;
        if (hasFBPixel) advCount++;
        if (hasGoogleAds) advCount++;
        if (hasTikTokPixel) advCount++;
        if (hasLinkedInTag) advCount++;
        if (hasAnyRetargeting) advCount++;
        // Add Meta Ad Library result
        if (adLibraryResult.hasAds) advCount++;
        result.adv_count = advCount;

        const advIssues: string[] = [];
        if (!hasFBPixel && !adLibraryResult.hasAds) advIssues.push('Nessun Facebook/Meta Pixel e nessuna ADV attiva su Meta');
        else if (!hasFBPixel && adLibraryResult.hasAds) advIssues.push('Fanno ADV su Meta ma manca il Pixel sul sito (non tracciano conversioni!)');
        if (!hasGoogleAds) advIssues.push('Nessun Google Ads');
        if (!hasTikTokPixel) advIssues.push('Nessun TikTok Pixel');
        if (advCount === 0) advIssues.push('Nessuna campagna ADV attiva');
        result.adv_issues = advIssues;

        let scoreA = 0;
        if (advCount >= 3) scoreA = 90;
        else if (advCount === 2) scoreA = 65;
        else if (advCount === 1) scoreA = 35;
        result.score_advertising = scoreA;

      } catch {
        result.website_issues = ['Sito non raggiungibile o troppo lento'];
        result.score_website = 5;
      }

      // ── SEO score from Google data ──
      let scoreE = 10;
      if (rating && rating >= 4.5 && reviews && reviews > 50) scoreE = 90;
      else if (rating && rating >= 4.0 && reviews && reviews > 20) scoreE = 70;
      else if (rating && rating >= 3.5 && reviews && reviews > 10) scoreE = 50;
      else if (rating) scoreE = 30;
      result.score_seo = scoreE;

      // ── Total ──
      result.score_total = Math.round(
        (result.score_website as number) * 0.3 +
        (result.score_social as number) * 0.25 +
        (result.score_advertising as number) * 0.25 +
        (result.score_seo as number) * 0.2
      );

      return result;
    })
  );

  // Sort by score ascending (worst first = best leads)
  results.sort((a, b) => (a.score_total as number) - (b.score_total as number));

  return NextResponse.json({ results, count: results.length });
}

/**
 * Check Meta Ad Library for active ads.
 * Uses the public Facebook Ad Library search page.
 */
async function checkMetaAdLibrary(businessName: string, city: string): Promise<{ hasAds: boolean; adCount: number; libraryUrl: string }> {
  const query = encodeURIComponent(`${businessName} ${city}`);
  const libraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IT&q=${query}`;

  try {
    // Use Facebook Ad Library API (public, no auth needed for basic search)
    const res = await fetch(
      `https://www.facebook.com/ads/library/async/search_ads/?q=${query}&count=5&active_status=active&ad_type=all&country=IT&session_id=1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      }
    );

    if (res.ok) {
      const text = await res.text();
      // Check if there are ad results in the response
      const hasAds = text.includes('ad_archive_id') || text.includes('ad_snapshot_url') || text.includes('sponsor');
      // Try to count ads
      const adMatches = text.match(/ad_archive_id/g);
      const adCount = adMatches ? adMatches.length : 0;
      return { hasAds, adCount, libraryUrl };
    }
  } catch {
    // Ad Library check failed, not critical
  }

  return { hasAds: false, adCount: 0, libraryUrl };
}

/**
 * Find social profiles by searching Google Places for the business.
 * Uses textQuery to find associated social links.
 */
async function findSocialProfiles(businessName: string, city: string, apiKey: string): Promise<{ instagram: string | null; facebook: string | null; tiktok: string | null }> {
  const result = { instagram: null as string | null, facebook: null as string | null, tiktok: null as string | null };

  try {
    // Search for the business + "instagram" to find their profile
    const searches = [
      { platform: 'instagram', query: `${businessName} ${city} instagram` },
      { platform: 'facebook', query: `${businessName} ${city} facebook` },
    ];

    for (const search of searches) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.websiteUri',
          },
          body: JSON.stringify({ textQuery: search.query, languageCode: 'it', maxResultCount: 1 }),
        });

        if (res.ok) {
          const data = await res.json();
          const firstPlace = data.places?.[0];
          const uri = firstPlace?.websiteUri as string | undefined;
          if (uri) {
            if (search.platform === 'instagram' && uri.includes('instagram.com')) {
              result.instagram = uri;
            } else if (search.platform === 'facebook' && uri.includes('facebook.com')) {
              result.facebook = uri;
            }
          }
        }
      } catch {
        // Individual search failed, continue
      }
    }
  } catch {
    // Social search failed entirely
  }

  return result;
}
