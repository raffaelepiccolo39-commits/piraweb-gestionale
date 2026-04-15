export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnalysisIssue {
  area: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
}

interface WebsiteAnalysis {
  exists: boolean;
  url: string | null;
  ssl: boolean;
  mobile_responsive: boolean;
  has_title: boolean;
  has_meta_description: boolean;
  has_h1: boolean;
  has_og_tags: boolean;
  has_favicon: boolean;
  has_analytics: boolean;
  has_contact_form: boolean;
  has_cookie_banner: boolean;
  has_structured_data: boolean;
  looks_outdated: boolean;
  outdated_signals: string[];
  response_time_ms: number | null;
  status_code: number | null;
  issues: AnalysisIssue[];
}

interface SocialMediaAnalysis {
  platforms_found: string[];
  platforms_missing: string[];
  detected_urls: Record<string, string | null>;
  instagram_meta: Record<string, string | null> | null;
  facebook_exists: boolean | null;
  issues: AnalysisIssue[];
}

interface AdvertisingAnalysis {
  facebook_pixel: boolean;
  google_ads: boolean;
  google_analytics: boolean;
  tiktok_pixel: boolean;
  linkedin_insight: boolean;
  other_retargeting: boolean;
  tracking_scripts_found: string[];
  issues: AnalysisIssue[];
}

interface SeoAnalysis {
  google_rating: number;
  review_count: number;
  has_meta_tags: boolean;
  has_structured_data: boolean;
  has_canonical: boolean;
  has_robots: boolean;
  has_sitemap_link: boolean;
  issues: AnalysisIssue[];
}

interface ContentAnalysis {
  ai_evaluated: boolean;
  ai_summary: string | null;
  ai_score: number | null;
  issues: AnalysisIssue[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<{ response: Response; elapsed: number }> {
  // SSRF protection: block internal/private URLs
  const { isUrlSafeToFetch } = await import('@/lib/url-validator');
  if (!isUrlSafeToFetch(url)) {
    throw new Error('URL non consentito');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    const elapsed = Date.now() - start;
    return { response, elapsed };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Website Analysis ────────────────────────────────────────────────────────

async function analyzeWebsite(siteUrl: string): Promise<{ html: string; score: number; analysis: WebsiteAnalysis }> {
  const url = normalizeUrl(siteUrl);
  const issues: AnalysisIssue[] = [];
  let html = '';

  try {
    const { response, elapsed } = await fetchWithTimeout(url);
    html = await response.text();
    const lower = html.toLowerCase();

    // SSL
    const hasSSL = url.startsWith('https') || response.url.startsWith('https');
    if (!hasSSL) issues.push({ area: 'website', detail: 'Il sito non usa HTTPS - manca certificato SSL. Rischio sicurezza e penalizzazione SEO.', severity: 'critical' });

    // Mobile responsive
    const hasViewport = lower.includes('name="viewport"') || lower.includes("name='viewport'") || lower.includes('name=viewport');
    if (!hasViewport) issues.push({ area: 'website', detail: 'Manca il meta viewport - il sito non e\' ottimizzato per dispositivi mobile.', severity: 'critical' });

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const hasTitle = !!(titleMatch && titleMatch[1].trim().length > 0);
    if (!hasTitle) issues.push({ area: 'website', detail: 'Manca il tag <title> - grave problema SEO e di usabilita\'.', severity: 'critical' });

    // Meta description
    const hasMetaDesc = lower.includes('name="description"') || lower.includes("name='description'");
    if (!hasMetaDesc) issues.push({ area: 'website', detail: 'Manca la meta description - riduce il CTR sui risultati Google.', severity: 'warning' });

    // H1
    const hasH1 = /<h1[\s>]/i.test(html);
    if (!hasH1) issues.push({ area: 'website', detail: 'Manca il tag H1 - importante per la struttura SEO della pagina.', severity: 'warning' });

    // OG tags
    const hasOGTags = lower.includes('og:title') || lower.includes('og:description') || lower.includes('og:image');
    if (!hasOGTags) issues.push({ area: 'website', detail: 'Mancano i tag Open Graph - le condivisioni social appariranno senza anteprima.', severity: 'warning' });

    // Favicon
    const hasFavicon = lower.includes('favicon') || lower.includes('rel="icon"') || lower.includes("rel='icon'") || lower.includes('rel="shortcut icon"');

    // Cookie / GDPR banner
    const hasCookieBanner =
      lower.includes('cookie') && (lower.includes('consent') || lower.includes('banner') || lower.includes('accett') || lower.includes('consenso')) ||
      lower.includes('gdpr') ||
      lower.includes('iubenda') ||
      lower.includes('cookiebot') ||
      lower.includes('onetrust') ||
      lower.includes('cookie-law') ||
      lower.includes('cookie-notice');
    if (!hasCookieBanner) issues.push({ area: 'website', detail: 'Non rilevato banner cookie/GDPR - possibile violazione normativa privacy europea.', severity: 'critical' });

    // Analytics
    const hasAnalytics =
      lower.includes('google-analytics.com') ||
      lower.includes('googletagmanager.com') ||
      lower.includes('gtag(') ||
      lower.includes('ga(') ||
      lower.includes('_gaq') ||
      lower.includes('analytics.js') ||
      lower.includes('gtm.js') ||
      lower.includes('matomo') ||
      lower.includes('hotjar');
    if (!hasAnalytics) issues.push({ area: 'website', detail: 'Nessun sistema di analytics rilevato - impossibile misurare il traffico del sito.', severity: 'warning' });

    // Contact form
    const hasContactForm =
      lower.includes('type="email"') || lower.includes("type='email'") ||
      lower.includes('type="tel"') || lower.includes("type='tel'") ||
      lower.includes('<form') && (lower.includes('contatt') || lower.includes('contact') || lower.includes('messag') || lower.includes('richiesta')) ||
      lower.includes('wpcf7') || lower.includes('wpforms') || lower.includes('gravity') || lower.includes('typeform');
    if (!hasContactForm) issues.push({ area: 'website', detail: 'Nessun form di contatto trovato - potenziali clienti non possono inviare richieste facilmente.', severity: 'warning' });

    // Structured data / JSON-LD
    const hasStructuredData = lower.includes('application/ld+json') || lower.includes('itemtype="http://schema.org') || lower.includes("itemtype='http://schema.org");

    // Outdated signals
    const outdatedSignals: string[] = [];
    if (lower.includes('jquery/1.') || lower.includes('jquery-1.') || lower.includes('jquery.min.js') && lower.includes('1.')) {
      // Check for very old jQuery (1.x)
      const jqMatch = html.match(/jquery[/-](1\.\d+)/i);
      if (jqMatch) outdatedSignals.push(`jQuery ${jqMatch[1]} obsoleta`);
    }
    if (lower.includes('shockwave-flash') || lower.includes('.swf') || lower.includes('flash')) {
      outdatedSignals.push('Contenuti Flash rilevati (tecnologia obsoleta)');
    }
    if (lower.includes('<table') && lower.includes('<td') && !lower.includes('data-table') && !lower.includes('datatable')) {
      // Check if tables are used for layout (multiple nested tables)
      const tableCount = (lower.match(/<table/g) || []).length;
      if (tableCount > 3) outdatedSignals.push('Possibile layout basato su tabelle (design obsoleto)');
    }
    if (lower.includes('<marquee') || lower.includes('<blink') || lower.includes('<center>')) {
      outdatedSignals.push('Tag HTML obsoleti rilevati (marquee/blink/center)');
    }
    if (lower.includes('frontpage') || lower.includes('dreamweaver')) {
      outdatedSignals.push('Generato con strumenti obsoleti (FrontPage/Dreamweaver)');
    }
    if (!lower.includes('<!doctype html>') && !lower.includes('<!doctype html >')) {
      // Missing HTML5 doctype could mean old HTML version
      if (!lower.startsWith('<!doctype')) {
        outdatedSignals.push('Manca DOCTYPE HTML5');
      }
    }

    const looksOutdated = outdatedSignals.length > 0;
    if (looksOutdated) {
      issues.push({ area: 'website', detail: `Il sito sembra datato: ${outdatedSignals.join('; ')}`, severity: 'warning' });
    }

    // Response time
    if (elapsed > 5000) {
      issues.push({ area: 'website', detail: `Il sito e\' molto lento: ${elapsed}ms di tempo di risposta (ideale < 2000ms).`, severity: 'critical' });
    } else if (elapsed > 2000) {
      issues.push({ area: 'website', detail: `Il sito e\' lento: ${elapsed}ms di tempo di risposta (ideale < 2000ms).`, severity: 'warning' });
    }

    // Score calculation
    let score = 10; // Base: site exists
    if (hasSSL) score += 12;
    if (hasViewport) score += 12;
    if (hasTitle) score += 8;
    if (hasMetaDesc) score += 8;
    if (hasH1) score += 5;
    if (hasOGTags) score += 7;
    if (hasFavicon) score += 3;
    if (hasCookieBanner) score += 8;
    if (hasAnalytics) score += 7;
    if (hasContactForm) score += 8;
    if (hasStructuredData) score += 5;
    if (response.status === 200) score += 5;
    if (elapsed < 2000) score += 7;
    else if (elapsed < 3000) score += 3;
    if (!looksOutdated) score += 5;

    return {
      html,
      score: clamp(score, 0, 100),
      analysis: {
        exists: true,
        url: response.url,
        ssl: hasSSL,
        mobile_responsive: hasViewport,
        has_title: hasTitle,
        has_meta_description: hasMetaDesc,
        has_h1: hasH1,
        has_og_tags: hasOGTags,
        has_favicon: hasFavicon,
        has_analytics: hasAnalytics,
        has_contact_form: hasContactForm,
        has_cookie_banner: hasCookieBanner,
        has_structured_data: hasStructuredData,
        looks_outdated: looksOutdated,
        outdated_signals: outdatedSignals,
        response_time_ms: elapsed,
        status_code: response.status,
        issues,
      },
    };
  } catch {
    issues.push({ area: 'website', detail: 'Sito web non raggiungibile o non funzionante.', severity: 'critical' });
    return {
      html: '',
      score: 0,
      analysis: {
        exists: false,
        url: url,
        ssl: false,
        mobile_responsive: false,
        has_title: false,
        has_meta_description: false,
        has_h1: false,
        has_og_tags: false,
        has_favicon: false,
        has_analytics: false,
        has_contact_form: false,
        has_cookie_banner: false,
        has_structured_data: false,
        looks_outdated: false,
        outdated_signals: [],
        response_time_ms: null,
        status_code: null,
        issues,
      },
    };
  }
}

// ─── Social Media Analysis ───────────────────────────────────────────────────

function extractSocialLinks(html: string): Record<string, string | null> {
  const lower = html.toLowerCase();
  const full = html; // Keep original case for URLs

  const extract = (pattern: RegExp): string | null => {
    const match = full.match(pattern);
    return match ? match[0] : null;
  };

  return {
    instagram: extract(/https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?/i),
    facebook: extract(/https?:\/\/(www\.)?(facebook|fb)\.com\/[a-zA-Z0-9_.%-]+\/?/i),
    tiktok: extract(/https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+\/?/i),
    linkedin: extract(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+\/?/i),
    youtube: extract(/https?:\/\/(www\.)?(youtube\.com\/(channel|c|@|user)\/[a-zA-Z0-9_-]+)\/?/i),
    twitter: lower.includes('twitter.com/') || lower.includes('x.com/')
      ? extract(/https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?/i)
      : null,
  };
}

async function checkInstagramProfile(url: string): Promise<Record<string, string | null> | null> {
  try {
    const { response } = await fetchWithTimeout(url, 8000);
    const html = await response.text();

    // Instagram public pages include meta tags with useful info
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
      || html.match(/<meta[^>]*content="([^"]+)"[^>]*name="description"/i);
    const description = descMatch?.[1] || null;

    // Try to extract follower/post counts from meta description
    // Typical format: "X Followers, Y Following, Z Posts - ..."
    let followers: string | null = null;
    let posts: string | null = null;
    if (description) {
      const followerMatch = description.match(/([\d,.]+[KMkm]?)\s*Follower/i);
      const postMatch = description.match(/([\d,.]+)\s*Post/i);
      followers = followerMatch?.[1] || null;
      posts = postMatch?.[1] || null;
    }

    return { description, followers, posts };
  } catch {
    return null;
  }
}

async function checkFacebookPageExists(url: string): Promise<boolean> {
  try {
    const { response } = await fetchWithTimeout(url, 8000);
    const html = await response.text();
    // If Facebook returns the page (not an error page)
    const isError = html.includes('page_not_found') || html.includes('This page isn') || html.includes('non disponibile') || response.status === 404;
    return !isError && response.status === 200;
  } catch {
    return false;
  }
}

async function analyzeSocialMedia(
  html: string,
  providedInstagram: string | null,
  providedFacebook: string | null,
): Promise<{ score: number; analysis: SocialMediaAnalysis; detectedUrls: Record<string, string | null> }> {
  const issues: AnalysisIssue[] = [];
  const detectedUrls = extractSocialLinks(html);

  // Merge provided URLs with detected
  const instagramUrl = providedInstagram || detectedUrls.instagram;
  const facebookUrl = providedFacebook || detectedUrls.facebook;
  const tiktokUrl = detectedUrls.tiktok;
  const linkedinUrl = detectedUrls.linkedin;
  const youtubeUrl = detectedUrls.youtube;

  const platformsFound: string[] = [];
  const platformsMissing: string[] = [];

  // Check each platform
  if (instagramUrl) platformsFound.push('instagram');
  else platformsMissing.push('instagram');

  if (facebookUrl) platformsFound.push('facebook');
  else platformsMissing.push('facebook');

  if (tiktokUrl) platformsFound.push('tiktok');
  else platformsMissing.push('tiktok');

  if (linkedinUrl) platformsFound.push('linkedin');
  else platformsMissing.push('linkedin');

  if (youtubeUrl) platformsFound.push('youtube');
  else platformsMissing.push('youtube');

  // Instagram deep check
  let instagramMeta: Record<string, string | null> | null = null;
  if (instagramUrl) {
    instagramMeta = await checkInstagramProfile(instagramUrl);
    if (instagramMeta?.posts === '0' || instagramMeta?.posts === null) {
      issues.push({ area: 'social', detail: 'Profilo Instagram presente ma sembra inattivo o con pochi contenuti.', severity: 'warning' });
    }
  }

  // Facebook check
  let facebookExists: boolean | null = null;
  if (facebookUrl) {
    facebookExists = await checkFacebookPageExists(facebookUrl);
    if (!facebookExists) {
      issues.push({ area: 'social', detail: 'Link Facebook trovato ma la pagina non sembra accessibile.', severity: 'warning' });
    }
  }

  // Issues for missing platforms
  if (platformsFound.length === 0) {
    issues.push({ area: 'social', detail: 'Nessuna presenza social media rilevata - completamente assente dai social.', severity: 'critical' });
  } else {
    if (!instagramUrl) issues.push({ area: 'social', detail: 'Manca profilo Instagram - piattaforma essenziale per la visibilita\' del brand.', severity: 'warning' });
    if (!facebookUrl) issues.push({ area: 'social', detail: 'Manca pagina Facebook - ancora importante per molte fasce demografiche.', severity: 'info' });
    if (!tiktokUrl) issues.push({ area: 'social', detail: 'Manca profilo TikTok - opportunita\' mancata per raggiungere pubblico giovane.', severity: 'info' });
    if (!linkedinUrl) issues.push({ area: 'social', detail: 'Manca profilo LinkedIn - utile per networking B2B e credibilita\' professionale.', severity: 'info' });
  }

  // Score: each platform adds points, with bonuses for activity
  let score = 0;
  const perPlatform = 18; // 5 platforms * 18 = 90, plus activity bonus up to 100
  score += platformsFound.length * perPlatform;

  // Activity bonus
  if (instagramMeta?.followers) score += 5;
  if (facebookExists) score += 5;

  score = clamp(score, 0, 100);

  return {
    score,
    analysis: {
      platforms_found: platformsFound,
      platforms_missing: platformsMissing,
      detected_urls: {
        instagram: instagramUrl,
        facebook: facebookUrl,
        tiktok: tiktokUrl,
        linkedin: linkedinUrl,
        youtube: youtubeUrl,
      },
      instagram_meta: instagramMeta,
      facebook_exists: facebookExists,
      issues,
    },
    detectedUrls: {
      instagram: instagramUrl,
      facebook: facebookUrl,
      tiktok: tiktokUrl,
      linkedin: linkedinUrl,
      youtube: youtubeUrl,
    },
  };
}

// ─── Advertising Analysis ────────────────────────────────────────────────────

function analyzeAdvertising(html: string): { score: number; analysis: AdvertisingAnalysis } {
  const lower = html.toLowerCase();
  const issues: AnalysisIssue[] = [];
  const trackingFound: string[] = [];

  // Facebook Pixel
  const hasFBPixel = lower.includes('fbq(') || lower.includes('facebook.com/tr') || lower.includes('fbevents.js') || lower.includes('connect.facebook.net') && lower.includes('fbq');
  if (hasFBPixel) trackingFound.push('Facebook Pixel');

  // Google Ads
  const hasGoogleAds =
    lower.includes('google_ads') ||
    lower.includes('googleads') ||
    lower.includes('conversion_id') ||
    lower.includes('google_conversion') ||
    lower.includes('aw-') && lower.includes('gtag') ||
    lower.includes('ads/ga-audiences');
  if (hasGoogleAds) trackingFound.push('Google Ads');

  // Google Analytics (not the same as Google Ads, but relevant)
  const hasGA =
    lower.includes('google-analytics.com') ||
    lower.includes('googletagmanager.com') ||
    lower.includes('gtag(') ||
    lower.includes('gtm.js') ||
    lower.includes('analytics.js');
  if (hasGA) trackingFound.push('Google Analytics/GTM');

  // TikTok Pixel
  const hasTikTokPixel = lower.includes('analytics.tiktok.com') || lower.includes('tiktok pixel') || lower.includes('ttq.load') || lower.includes('ttq.page');
  if (hasTikTokPixel) trackingFound.push('TikTok Pixel');

  // LinkedIn Insight Tag
  const hasLinkedInInsight = lower.includes('snap.licdn.com') || lower.includes('linkedin.com/px') || lower.includes('_linkedin_partner_id') || lower.includes('linkedin insight');
  if (hasLinkedInInsight) trackingFound.push('LinkedIn Insight Tag');

  // Other retargeting
  const hasRetargeting =
    lower.includes('criteo') ||
    lower.includes('adroll') ||
    lower.includes('doubleclick') ||
    lower.includes('taboola') ||
    lower.includes('outbrain') ||
    lower.includes('hotjar') ||
    lower.includes('mixpanel') ||
    lower.includes('hubspot') ||
    lower.includes('pardot') ||
    lower.includes('marketo') ||
    lower.includes('activecampaign') ||
    lower.includes('mailchimp');
  if (hasRetargeting) {
    const retargetingNames: string[] = [];
    if (lower.includes('criteo')) retargetingNames.push('Criteo');
    if (lower.includes('adroll')) retargetingNames.push('AdRoll');
    if (lower.includes('doubleclick')) retargetingNames.push('DoubleClick');
    if (lower.includes('taboola')) retargetingNames.push('Taboola');
    if (lower.includes('outbrain')) retargetingNames.push('Outbrain');
    if (lower.includes('hotjar')) retargetingNames.push('Hotjar');
    if (lower.includes('hubspot')) retargetingNames.push('HubSpot');
    if (lower.includes('mailchimp')) retargetingNames.push('Mailchimp');
    trackingFound.push(...retargetingNames);
  }

  // Score
  let score = 0;
  if (hasFBPixel) score += 25;
  if (hasGoogleAds) score += 25;
  if (hasGA) score += 15;
  if (hasTikTokPixel) score += 15;
  if (hasLinkedInInsight) score += 10;
  if (hasRetargeting) score += 10;

  score = clamp(score, 0, 100);

  // Issues
  if (trackingFound.length === 0) {
    issues.push({ area: 'advertising', detail: 'Nessun pixel o script di advertising rilevato - nessuna campagna pubblicitaria attiva.', severity: 'critical' });
  }
  if (!hasFBPixel) issues.push({ area: 'advertising', detail: 'Manca Facebook Pixel - impossibile fare retargeting su Facebook/Instagram.', severity: 'warning' });
  if (!hasGoogleAds) issues.push({ area: 'advertising', detail: 'Manca Google Ads tag - nessuna campagna Google Ads rilevata.', severity: 'info' });
  if (!hasGA) issues.push({ area: 'advertising', detail: 'Manca Google Analytics/Tag Manager - nessun tracciamento traffico.', severity: 'warning' });
  if (!hasTikTokPixel) issues.push({ area: 'advertising', detail: 'Manca TikTok Pixel - impossibile tracciare conversioni da TikTok.', severity: 'info' });
  if (!hasLinkedInInsight) issues.push({ area: 'advertising', detail: 'Manca LinkedIn Insight Tag.', severity: 'info' });

  return {
    score,
    analysis: {
      facebook_pixel: hasFBPixel,
      google_ads: hasGoogleAds,
      google_analytics: hasGA,
      tiktok_pixel: hasTikTokPixel,
      linkedin_insight: hasLinkedInInsight,
      other_retargeting: hasRetargeting,
      tracking_scripts_found: trackingFound,
      issues,
    },
  };
}

// ─── SEO / Google Presence Analysis ──────────────────────────────────────────

function analyzeSeo(
  html: string,
  googleRating: number,
  reviewCount: number,
): { score: number; analysis: SeoAnalysis } {
  const lower = html.toLowerCase();
  const issues: AnalysisIssue[] = [];

  const hasMetaTags =
    (lower.includes('name="description"') || lower.includes("name='description'")) &&
    (lower.includes('<title'));
  const hasStructuredData = lower.includes('application/ld+json') || lower.includes('itemtype="http://schema.org');
  const hasCanonical = lower.includes('rel="canonical"') || lower.includes("rel='canonical'");
  const hasRobots = lower.includes('name="robots"') || lower.includes("name='robots'");
  const hasSitemapLink = lower.includes('sitemap');

  let score = 0;

  // Google rating component (up to 40 points)
  if (googleRating >= 4.5 && reviewCount > 50) score += 40;
  else if (googleRating >= 4.5 && reviewCount > 20) score += 35;
  else if (googleRating >= 4.0 && reviewCount > 20) score += 30;
  else if (googleRating >= 4.0 && reviewCount > 10) score += 25;
  else if (googleRating >= 3.5 && reviewCount > 5) score += 18;
  else if (googleRating > 0) score += 10;
  else score += 0;

  // Technical SEO component (up to 60 points)
  if (hasMetaTags) score += 15;
  if (hasStructuredData) score += 15;
  if (hasCanonical) score += 10;
  if (hasRobots) score += 5;
  if (hasSitemapLink) score += 5;
  // Bonus for rich reviews
  if (reviewCount > 100) score += 10;
  else if (reviewCount > 50) score += 5;

  score = clamp(score, 0, 100);

  // Issues
  if (reviewCount === 0) {
    issues.push({ area: 'seo', detail: 'Nessuna recensione Google - il business non ha visibilita\' nelle ricerche locali.', severity: 'critical' });
  } else if (reviewCount < 10) {
    issues.push({ area: 'seo', detail: `Solo ${reviewCount} recensioni Google - serve una strategia per raccogliere piu\' recensioni.`, severity: 'warning' });
  }
  if (googleRating > 0 && googleRating < 4.0) {
    issues.push({ area: 'seo', detail: `Valutazione Google ${googleRating}/5 - sotto la soglia di fiducia per molti utenti.`, severity: 'warning' });
  }
  if (!hasMetaTags) {
    issues.push({ area: 'seo', detail: 'Meta tag SEO incompleti - title e/o description mancanti.', severity: 'warning' });
  }
  if (!hasStructuredData) {
    issues.push({ area: 'seo', detail: 'Mancano dati strutturati (JSON-LD/Schema.org) - il sito non apparira\' con rich snippets su Google.', severity: 'warning' });
  }
  if (!hasCanonical) {
    issues.push({ area: 'seo', detail: 'Manca il tag canonical - rischio contenuti duplicati.', severity: 'info' });
  }

  return {
    score,
    analysis: {
      google_rating: googleRating,
      review_count: reviewCount,
      has_meta_tags: hasMetaTags,
      has_structured_data: hasStructuredData,
      has_canonical: hasCanonical,
      has_robots: hasRobots,
      has_sitemap_link: hasSitemapLink,
      issues,
    },
  };
}

// ─── Content Quality via Gemini ──────────────────────────────────────────────

function extractContentSummary(html: string, maxLength = 4000): string {
  // Strip scripts and styles
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, maxLength);
}

async function analyzeContentWithAI(
  html: string,
  businessName: string,
): Promise<{ score: number; analysis: ContentAnalysis }> {
  const issues: AnalysisIssue[] = [];
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey || !html) {
    issues.push({ area: 'content', detail: 'Impossibile valutare la qualita\' dei contenuti (API AI non disponibile o sito non accessibile).', severity: 'info' });
    return {
      score: 0,
      analysis: {
        ai_evaluated: false,
        ai_summary: null,
        ai_score: null,
        issues,
      },
    };
  }

  const contentSummary = extractContentSummary(html);

  if (contentSummary.length < 100) {
    issues.push({ area: 'content', detail: 'Il sito ha pochissimo contenuto testuale - probabile sito placeholder o in costruzione.', severity: 'critical' });
    return {
      score: 5,
      analysis: {
        ai_evaluated: false,
        ai_summary: 'Contenuto insufficiente per la valutazione.',
        ai_score: 5,
        issues,
      },
    };
  }

  const prompt = `Sei un esperto di digital marketing e web design italiano. Analizza il seguente contenuto testuale estratto dal sito web dell'attivita\' "${businessName}".

Valuta questi aspetti:
1. QUALITA' del testo: e\' scritto bene? E\' professionale? Ha errori grammaticali?
2. COMPLETEZZA: ci sono informazioni utili per il cliente (servizi, orari, contatti, prezzi)?
3. CALL TO ACTION: ci sono inviti all'azione chiari?
4. FRESCHEZZA: sembra contenuto aggiornato o obsoleto?
5. TONE OF VOICE: e\' appropriato per il settore?

Rispondi SOLO con un JSON valido in questo formato esatto (nessun altro testo prima o dopo):
{
  "score": <numero da 0 a 100>,
  "summary": "<una frase di valutazione in italiano>",
  "issues": ["<problema specifico 1>", "<problema specifico 2>"]
}

Contenuto del sito:
${contentSummary}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
        }),
      },
    );

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

    const data = await res.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Gemini response');

    const parsed = JSON.parse(jsonMatch[0]) as { score: number; summary: string; issues: string[] };
    const aiScore = clamp(parsed.score || 0, 0, 100);

    if (parsed.issues && Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues) {
        issues.push({ area: 'content', detail: issue, severity: aiScore < 40 ? 'critical' : 'warning' });
      }
    }

    return {
      score: aiScore,
      analysis: {
        ai_evaluated: true,
        ai_summary: parsed.summary || null,
        ai_score: aiScore,
        issues,
      },
    };
  } catch {
    issues.push({ area: 'content', detail: 'Errore nella valutazione AI dei contenuti - analisi basata su euristica.', severity: 'info' });

    // Fallback heuristic
    const wordCount = contentSummary.split(/\s+/).length;
    let fallbackScore = 20;
    if (wordCount > 500) fallbackScore += 20;
    if (wordCount > 200) fallbackScore += 15;
    if (contentSummary.includes('tel:') || contentSummary.includes('mailto:')) fallbackScore += 10;
    if (contentSummary.includes('orari') || contentSummary.includes('servizi') || contentSummary.includes('chi siamo')) fallbackScore += 10;

    return {
      score: clamp(fallbackScore, 0, 100),
      analysis: {
        ai_evaluated: false,
        ai_summary: `Valutazione euristica: ${wordCount} parole trovate.`,
        ai_score: null,
        issues,
      },
    };
  }
}

// ─── Main POST Handler ──────────────────────────────────────────────────────

/**
 * Deep-analyze a business's digital presence.
 * POST /api/prospects/analyze
 * Body: { prospect_id: "..." } or { website: "...", business_name: "...", ... }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`analyze:${user.id}`, { maxRequests: 30, windowSeconds: 3600 });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Troppe analisi. Riprova tra poco.' }, { status: 429 });

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
  const googleRating = ((prospect as Record<string, unknown> | null)?.google_rating as number) || 0;
  const reviewCount = ((prospect as Record<string, unknown> | null)?.google_reviews_count as number) || 0;

  // ══════════ 1. WEBSITE ANALYSIS ══════════
  let websiteResult: { html: string; score: number; analysis: WebsiteAnalysis };
  if (siteUrl) {
    websiteResult = await analyzeWebsite(siteUrl as string);
  } else {
    websiteResult = {
      html: '',
      score: 0,
      analysis: {
        exists: false, url: null, ssl: false, mobile_responsive: false,
        has_title: false, has_meta_description: false, has_h1: false,
        has_og_tags: false, has_favicon: false, has_analytics: false,
        has_contact_form: false, has_cookie_banner: false,
        has_structured_data: false, looks_outdated: false, outdated_signals: [],
        response_time_ms: null, status_code: null,
        issues: [{ area: 'website', detail: 'Nessun sito web trovato per questa attivita\'.', severity: 'critical' }],
      },
    };
  }

  // ══════════ 2. SOCIAL MEDIA ANALYSIS ══════════
  const socialResult = await analyzeSocialMedia(
    websiteResult.html,
    (instaUrl as string) || null,
    (fbUrl as string) || null,
  );

  // ══════════ 3. ADVERTISING ANALYSIS ══════════
  const advertisingResult = websiteResult.html
    ? analyzeAdvertising(websiteResult.html)
    : {
        score: 0,
        analysis: {
          facebook_pixel: false, google_ads: false, google_analytics: false,
          tiktok_pixel: false, linkedin_insight: false, other_retargeting: false,
          tracking_scripts_found: [],
          issues: [{ area: 'advertising', detail: 'Impossibile analizzare advertising senza sito web.', severity: 'critical' }],
        } as AdvertisingAnalysis,
      };

  // ══════════ 4. SEO / GOOGLE PRESENCE ══════════
  const seoResult = analyzeSeo(websiteResult.html, googleRating, reviewCount);

  // ══════════ 5. CONTENT QUALITY (AI) ══════════
  const contentResult = await analyzeContentWithAI(websiteResult.html, name as string);

  // ══════════ WEIGHTED TOTAL SCORE ══════════
  const scoreTotal = Math.round(
    websiteResult.score * 0.25 +
    socialResult.score * 0.25 +
    advertisingResult.score * 0.20 +
    seoResult.score * 0.15 +
    contentResult.score * 0.15
  );

  // ══════════ COLLECT ALL ISSUES ══════════
  const allIssues: AnalysisIssue[] = [
    ...websiteResult.analysis.issues,
    ...socialResult.analysis.issues,
    ...advertisingResult.analysis.issues,
    ...seoResult.analysis.issues,
    ...contentResult.analysis.issues,
  ];

  const analysisNotes = {
    website: websiteResult.analysis,
    social: socialResult.analysis,
    advertising: advertisingResult.analysis,
    seo: seoResult.analysis,
    content: contentResult.analysis,
    detected_social: socialResult.detectedUrls,
  };

  const result = {
    score_website: websiteResult.score,
    score_social: socialResult.score,
    score_content: contentResult.score,
    score_advertising: advertisingResult.score,
    score_seo: seoResult.score,
    score_total: scoreTotal,
    analysis_notes: analysisNotes,
    all_issues: allIssues,
    analyzed_at: new Date().toISOString(),
    detected_instagram: socialResult.detectedUrls.instagram || null,
    detected_facebook: socialResult.detectedUrls.facebook || null,
    detected_tiktok: socialResult.detectedUrls.tiktok || null,
    detected_linkedin: socialResult.detectedUrls.linkedin || null,
    detected_youtube: socialResult.detectedUrls.youtube || null,
  };

  // Update prospect if exists
  if (prospect_id) {
    await supabase.from('lead_prospects').update({
      score_website: websiteResult.score,
      score_social: socialResult.score,
      score_content: contentResult.score,
      score_advertising: advertisingResult.score,
      score_seo: seoResult.score,
      score_total: scoreTotal,
      analysis_notes: analysisNotes,
      analyzed_at: new Date().toISOString(),
      instagram_url: socialResult.detectedUrls.instagram || instaUrl,
      facebook_url: socialResult.detectedUrls.facebook || fbUrl,
    }).eq('id', prospect_id);
  }

  return NextResponse.json(result);
}
