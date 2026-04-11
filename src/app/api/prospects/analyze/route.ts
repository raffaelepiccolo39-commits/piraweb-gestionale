export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Analyze a business's digital presence.
 * POST /api/prospects/analyze
 * Body: { prospect_id: "..." } or { website: "...", business_name: "..." }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { prospect_id, website, business_name, instagram_url, facebook_url } = await request.json();

  let prospect: Record<string, unknown> | null = null;

  if (prospect_id) {
    const { data } = await supabase.from('lead_prospects').select('*').eq('id', prospect_id).single();
    prospect = data;
  }

  const siteUrl = website || (prospect as Record<string, unknown> | null)?.website;
  const name = business_name || (prospect as Record<string, unknown> | null)?.business_name || '';
  const instaUrl = instagram_url || (prospect as Record<string, unknown> | null)?.instagram_url;
  const fbUrl = facebook_url || (prospect as Record<string, unknown> | null)?.facebook_url;

  const analysis: Record<string, unknown> = {};
  let scoreWebsite = 0;
  let scoreSocial = 0;
  let scoreContent = 0;
  let scoreAdvertising = 0;
  let scoreSeo = 0;

  // ══════════ WEBSITE ANALYSIS ══════════
  if (siteUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(siteUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PiraWebAnalyzer/1.0)' },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      const html = await res.text();
      const hasSSL = siteUrl.startsWith('https');
      const hasViewport = html.includes('viewport');
      const hasOGTags = html.includes('og:title') || html.includes('og:description');
      const hasFavicon = html.includes('favicon') || html.includes('icon');
      const hasAnalytics = html.includes('google-analytics') || html.includes('gtag') || html.includes('fbq(') || html.includes('pixel');
      const hasContactForm = html.includes('type="email"') || html.includes('contact') || html.includes('contatt');
      const hasCookieBanner = html.includes('cookie') || html.includes('gdpr') || html.includes('consenso');

      // Detect social links on website
      const detectedInstagram = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/)?.[1];
      const detectedFacebook = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/)?.[1];
      const detectedTiktok = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/)?.[1];
      const detectedLinkedin = html.match(/linkedin\.com\/(company|in)\/([a-zA-Z0-9_-]+)/)?.[0];

      let websiteScore = 20; // Base: has website
      if (hasSSL) websiteScore += 15;
      if (hasViewport) websiteScore += 15; // mobile responsive
      if (hasOGTags) websiteScore += 10;
      if (hasFavicon) websiteScore += 5;
      if (hasContactForm) websiteScore += 10;
      if (hasCookieBanner) websiteScore += 5;
      if (res.status === 200) websiteScore += 10;
      // Cap at 100
      scoreWebsite = Math.min(websiteScore, 100);

      // Advertising detection
      if (hasAnalytics) scoreAdvertising += 30;
      if (html.includes('fbq(')) scoreAdvertising += 20; // Facebook Pixel
      if (html.includes('gtag')) scoreAdvertising += 15; // Google Ads
      if (html.includes('linkedin.com/px')) scoreAdvertising += 10;

      analysis.website = {
        exists: true,
        ssl: hasSSL,
        mobile_responsive: hasViewport,
        og_tags: hasOGTags,
        favicon: hasFavicon,
        analytics: hasAnalytics,
        contact_form: hasContactForm,
        cookie_banner: hasCookieBanner,
        status_code: res.status,
        issues: [
          ...(!hasSSL ? ['Manca certificato SSL (https)'] : []),
          ...(!hasViewport ? ['Non ottimizzato per mobile'] : []),
          ...(!hasOGTags ? ['Manca Open Graph per condivisione social'] : []),
          ...(!hasAnalytics ? ['Nessun tracking/analytics installato'] : []),
          ...(!hasContactForm ? ['Nessun form di contatto trovato'] : []),
          ...(!hasCookieBanner ? ['Manca banner cookie/GDPR'] : []),
        ],
      };

      analysis.detected_social = {
        instagram: detectedInstagram ? `https://instagram.com/${detectedInstagram}` : null,
        facebook: detectedFacebook ? `https://facebook.com/${detectedFacebook}` : null,
        tiktok: detectedTiktok ? `https://tiktok.com/@${detectedTiktok}` : null,
        linkedin: detectedLinkedin ? `https://linkedin.com/${detectedLinkedin}` : null,
      };
    } catch {
      scoreWebsite = 0;
      analysis.website = { exists: false, error: 'Sito non raggiungibile', issues: ['Sito web non funzionante o non raggiungibile'] };
    }
  } else {
    scoreWebsite = 0;
    analysis.website = { exists: false, issues: ['Nessun sito web trovato'] };
  }

  // ══════════ SOCIAL MEDIA ANALYSIS ══════════
  const socialPlatforms: string[] = [];
  if (instaUrl || (analysis.detected_social as Record<string, unknown>)?.instagram) socialPlatforms.push('instagram');
  if (fbUrl || (analysis.detected_social as Record<string, unknown>)?.facebook) socialPlatforms.push('facebook');
  if ((analysis.detected_social as Record<string, unknown>)?.tiktok) socialPlatforms.push('tiktok');
  if ((analysis.detected_social as Record<string, unknown>)?.linkedin) socialPlatforms.push('linkedin');

  if (socialPlatforms.length >= 3) scoreSocial = 80;
  else if (socialPlatforms.length === 2) scoreSocial = 55;
  else if (socialPlatforms.length === 1) scoreSocial = 30;
  else scoreSocial = 0;

  analysis.social = {
    platforms_found: socialPlatforms,
    count: socialPlatforms.length,
    issues: [
      ...(socialPlatforms.length === 0 ? ['Nessun profilo social trovato'] : []),
      ...(!socialPlatforms.includes('instagram') ? ['Manca profilo Instagram'] : []),
      ...(!socialPlatforms.includes('facebook') ? ['Manca pagina Facebook'] : []),
      ...(!socialPlatforms.includes('tiktok') ? ['Manca profilo TikTok'] : []),
    ],
  };

  // ══════════ SEO SCORE ══════════
  const googleRating = (prospect as Record<string, unknown> | null)?.google_rating as number || 0;
  const reviewCount = (prospect as Record<string, unknown> | null)?.google_reviews_count as number || 0;

  if (googleRating >= 4.5 && reviewCount > 50) scoreSeo = 90;
  else if (googleRating >= 4.0 && reviewCount > 20) scoreSeo = 70;
  else if (googleRating >= 3.5 && reviewCount > 10) scoreSeo = 50;
  else if (googleRating > 0) scoreSeo = 30;
  else scoreSeo = 10;

  analysis.seo = {
    google_rating: googleRating,
    review_count: reviewCount,
    issues: [
      ...(reviewCount < 10 ? ['Poche recensioni Google (< 10)'] : []),
      ...(googleRating < 4.0 ? ['Valutazione Google sotto 4.0'] : []),
      ...(reviewCount === 0 ? ['Nessuna recensione su Google'] : []),
    ],
  };

  // ══════════ CONTENT SCORE (estimated) ══════════
  // Without actual social API access, estimate based on other signals
  if (scoreSocial >= 55 && scoreWebsite >= 50) scoreContent = 50;
  else if (scoreSocial >= 30) scoreContent = 30;
  else scoreContent = 10;

  analysis.content = {
    estimated: true,
    issues: [
      ...(scoreContent < 50 ? ['Presenza online debole - probabile contenuto scarso o assente'] : []),
    ],
  };

  // ══════════ TOTAL SCORE ══════════
  const scoreTotal = Math.round(
    scoreWebsite * 0.25 +
    scoreSocial * 0.25 +
    scoreContent * 0.15 +
    scoreAdvertising * 0.15 +
    scoreSeo * 0.20
  );

  // ══════════ COLLECT ALL ISSUES ══════════
  const allIssues: string[] = [
    ...((analysis.website as Record<string, unknown>)?.issues as string[] || []),
    ...((analysis.social as Record<string, unknown>)?.issues as string[] || []),
    ...((analysis.seo as Record<string, unknown>)?.issues as string[] || []),
    ...((analysis.content as Record<string, unknown>)?.issues as string[] || []),
    ...(scoreAdvertising < 20 ? ['Nessuna campagna pubblicitaria rilevata'] : []),
  ];

  const result = {
    score_website: scoreWebsite,
    score_social: scoreSocial,
    score_content: scoreContent,
    score_advertising: scoreAdvertising,
    score_seo: scoreSeo,
    score_total: scoreTotal,
    analysis_notes: analysis,
    all_issues: allIssues,
    analyzed_at: new Date().toISOString(),
    // Social URLs found
    detected_instagram: (analysis.detected_social as Record<string, unknown>)?.instagram || null,
    detected_facebook: (analysis.detected_social as Record<string, unknown>)?.facebook || null,
    detected_tiktok: (analysis.detected_social as Record<string, unknown>)?.tiktok || null,
    detected_linkedin: (analysis.detected_social as Record<string, unknown>)?.linkedin || null,
  };

  // Update prospect if exists
  if (prospect_id) {
    await supabase.from('lead_prospects').update({
      score_website: scoreWebsite,
      score_social: scoreSocial,
      score_content: scoreContent,
      score_advertising: scoreAdvertising,
      score_seo: scoreSeo,
      score_total: scoreTotal,
      analysis_notes: analysis,
      analyzed_at: new Date().toISOString(),
      instagram_url: result.detected_instagram || instaUrl,
      facebook_url: result.detected_facebook || fbUrl,
    }).eq('id', prospect_id);
  }

  return NextResponse.json(result);
}
