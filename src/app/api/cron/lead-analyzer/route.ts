export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minuti max

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * LEAD ANALYZER AGENT
 * Prende i lead con status 'new' non ancora analizzati in profondita'
 * e li analizza: website scan, social detection, advertising, SEO, content.
 * Aggiorna scores e analysis_notes.
 *
 * Schedule: ogni 2 ore, h24
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();
  const runId = crypto.randomUUID();

  await supabase.from('agent_runs').insert({
    id: runId,
    agent: 'lead_analyzer',
    status: 'running',
  });

  try {
    // Prendi fino a 10 lead non ancora analizzati (analyzed_at IS NULL)
    // Use a "claim" pattern: fetch then immediately mark as processing to prevent
    // concurrent runs from picking up the same leads
    const { data: leads, error: fetchError } = await supabase
      .from('lead_prospects')
      .select('*')
      .is('analyzed_at', null)
      .eq('outreach_status', 'new')
      .order('created_at', { ascending: true })
      .limit(20); // Accelerato da 10 a 20 per run

    if (fetchError) throw new Error(`Errore fetch leads: ${fetchError.message}`);
    if (!leads || leads.length === 0) {
      await supabase.from('agent_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        leads_analyzed: 0,
        details: { message: 'Nessun lead da analizzare' },
      }).eq('id', runId);

      return NextResponse.json({ success: true, agent: 'lead_analyzer', analyzed: 0 });
    }

    // Claim leads immediately by setting a temporary analyzed_at to prevent concurrent runs
    const leadIds = leads.map(l => l.id);
    await supabase
      .from('lead_prospects')
      .update({ analyzed_at: new Date().toISOString() })
      .in('id', leadIds);

    let analyzed = 0;
    const results: Array<{ name: string; score: number }> = [];

    for (const lead of leads) {
      try {
        const analysis = await analyzeLeadDeep(lead);

        await supabase.from('lead_prospects').update({
          score_website: analysis.scoreWebsite,
          score_social: analysis.scoreSocial,
          score_advertising: analysis.scoreAdv,
          score_seo: analysis.scoreSeo,
          score_content: analysis.scoreContent,
          score_total: analysis.scoreTotal,
          analysis_notes: analysis.notes,
          instagram_url: analysis.instagram || lead.instagram_url,
          facebook_url: analysis.facebook || lead.facebook_url,
          tiktok_url: analysis.tiktok || lead.tiktok_url,
          linkedin_url: analysis.linkedin || lead.linkedin_url,
          email: analysis.email || lead.email,
          analyzed_at: new Date().toISOString(),
        }).eq('id', lead.id);

        analyzed++;
        results.push({ name: lead.business_name, score: analysis.scoreTotal });
      } catch (err) {
        // Segna come analizzato comunque per non riprovare all'infinito
        await supabase.from('lead_prospects').update({
          analyzed_at: new Date().toISOString(),
          analysis_notes: {
            error: err instanceof Error ? err.message : 'Errore analisi',
          },
        }).eq('id', lead.id);
      }
    }

    await supabase.from('agent_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      leads_analyzed: analyzed,
      details: { results },
    }).eq('id', runId);

    return NextResponse.json({
      success: true,
      agent: 'lead_analyzer',
      analyzed,
      results,
    });

  } catch (err) {
    await supabase.from('agent_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err instanceof Error ? err.message : 'Errore sconosciuto',
    }).eq('id', runId);

    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore sconosciuto',
      agent: 'lead_analyzer',
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Analisi profonda di un lead
// ═══════════════════════════════════════════════════════════════════════════════

interface DeepAnalysis {
  scoreWebsite: number;
  scoreSocial: number;
  scoreAdv: number;
  scoreSeo: number;
  scoreContent: number;
  scoreTotal: number;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  linkedin: string | null;
  email: string | null;
  notes: Record<string, unknown>;
}

async function analyzeLeadDeep(lead: Record<string, unknown>): Promise<DeepAnalysis> {
  const website = lead.website as string | null;
  const businessName = lead.business_name as string;

  const notes: Record<string, unknown> = {};
  let html = '';

  // ── 1. Website Analysis ──
  let scoreWebsite = 0;
  const websiteChecks: Record<string, boolean> = {};

  if (website) {
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;

      // SSRF protection
      const { isUrlSafeToFetch } = await import('@/lib/url-validator');
      if (!isUrlSafeToFetch(url)) throw new Error('URL non consentito');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const start = Date.now();

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'it-IT,it;q=0.9',
        },
        redirect: 'follow',
      });
      clearTimeout(timer);

      const elapsed = Date.now() - start;
      html = await res.text();
      const lower = html.toLowerCase();

      websiteChecks.ssl = url.startsWith('https') || res.url.startsWith('https');
      websiteChecks.mobile = lower.includes('viewport');
      websiteChecks.title = /<title[^>]*>.+<\/title>/i.test(html);
      websiteChecks.metaDescription = lower.includes('name="description"') || lower.includes("name='description'");
      websiteChecks.h1 = /<h1[\s>]/i.test(html);
      websiteChecks.ogTags = lower.includes('og:title') || lower.includes('og:image');
      websiteChecks.favicon = lower.includes('favicon') || lower.includes('rel="icon"');
      websiteChecks.analytics = lower.includes('google-analytics') || lower.includes('gtag(') || lower.includes('googletagmanager');
      websiteChecks.contactForm = lower.includes('type="email"') || lower.includes('contatt') || lower.includes('contact');
      websiteChecks.cookieBanner = lower.includes('cookie') || lower.includes('iubenda') || lower.includes('cookiebot') || lower.includes('gdpr');
      websiteChecks.structuredData = lower.includes('application/ld+json') || lower.includes('itemtype');
      websiteChecks.canonical = lower.includes('rel="canonical"');
      websiteChecks.fastResponse = elapsed < 3000;

      // Outdated signals
      const outdatedSignals: string[] = [];
      if (lower.includes('shockwave-flash') || lower.includes('.swf')) outdatedSignals.push('Flash');
      if (lower.includes('jquery-1.') || lower.includes('jquery/1.')) outdatedSignals.push('jQuery vecchio');
      if (lower.includes('<table') && (html.match(/<table/gi)?.length || 0) > 3) outdatedSignals.push('Layout a tabelle');
      if (lower.includes('frontpage') || lower.includes('dreamweaver')) outdatedSignals.push('Editor obsoleto');
      websiteChecks.modern = outdatedSignals.length === 0;

      // Score
      scoreWebsite = 15; // ha un sito
      if (websiteChecks.ssl) scoreWebsite += 10;
      if (websiteChecks.mobile) scoreWebsite += 15;
      if (websiteChecks.title) scoreWebsite += 5;
      if (websiteChecks.metaDescription) scoreWebsite += 5;
      if (websiteChecks.h1) scoreWebsite += 3;
      if (websiteChecks.ogTags) scoreWebsite += 5;
      if (websiteChecks.analytics) scoreWebsite += 10;
      if (websiteChecks.contactForm) scoreWebsite += 7;
      if (websiteChecks.cookieBanner) scoreWebsite += 5;
      if (websiteChecks.structuredData) scoreWebsite += 5;
      if (websiteChecks.fastResponse) scoreWebsite += 5;
      if (!websiteChecks.modern) scoreWebsite -= 10;
      scoreWebsite = Math.max(0, Math.min(100, scoreWebsite));

      notes.website = {
        checks: websiteChecks,
        responseTime: elapsed,
        outdatedSignals,
        statusCode: res.status,
      };
    } catch {
      scoreWebsite = 5;
      notes.website = { error: 'Sito non raggiungibile', checks: {} };
    }
  } else {
    notes.website = { error: 'Nessun sito web', checks: {} };
  }

  // ── 1b. Email Extraction ──
  let email: string | null = null;
  if (html) {
    // Cerca email nel codice HTML (mailto: links e pattern email)
    const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (mailtoMatch) {
      email = mailtoMatch[1].toLowerCase();
    } else {
      // Pattern email generico nel testo
      const emailMatch = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const found = emailMatch[0].toLowerCase();
        // Filtra email di servizio/framework (non sono contatti reali)
        const blacklist = ['example.com', 'test.com', 'wordpress', 'wix', 'sentry', 'google', 'facebook', 'jquery', 'bootstrap', 'schema.org'];
        if (!blacklist.some(b => found.includes(b))) {
          email = found;
        }
      }
    }
    // Fallback: prova info@dominio se ha un sito
    if (!email && website) {
      try {
        const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace('www.', '');
        email = `info@${domain}`;
      } catch {
        // URL non valido
      }
    }
    notes.email = { found: email, source: mailtoMatch ? 'mailto' : email?.startsWith('info@') ? 'fallback' : 'html' };
  }

  // ── 2. Social Media Analysis ──
  let scoreSocial = 0;
  let instagram = lead.instagram_url as string | null;
  let facebook = lead.facebook_url as string | null;
  let tiktok = lead.tiktok_url as string | null;
  let linkedin = lead.linkedin_url as string | null;

  // Cerca social dal codice HTML del sito
  if (html) {
    const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
    const tkMatch = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);
    const liMatch = html.match(/linkedin\.com\/(company|in)\/([a-zA-Z0-9_-]+)/);

    if (igMatch && !instagram) instagram = `https://instagram.com/${igMatch[1]}`;
    if (fbMatch && !facebook) facebook = `https://facebook.com/${fbMatch[1]}`;
    if (tkMatch && !tiktok) tiktok = `https://tiktok.com/@${tkMatch[1]}`;
    if (liMatch && !linkedin) linkedin = `https://linkedin.com/${liMatch[0]}`;
  }

  // Analisi Instagram
  const igData: Record<string, unknown> = {};
  if (instagram) {
    try {
      const igRes = await fetchWithTimeout(instagram, 6000);
      if (igRes) {
        const igHtml = await igRes.text();
        const followersMatch = igHtml.match(/content="([\d.,KkMm]+)\s*Follower/i)
          || igHtml.match(/og:description[^>]*content="[^"]*?([\d.,KkMm]+)\s*Follower/i);
        const postsMatch = igHtml.match(/([\d.,KkMm]+)\s*Post/i);

        if (followersMatch) igData.followers = parseCount(followersMatch[1]);
        if (postsMatch) igData.posts = parseCount(postsMatch[1]);

        if (igData.posts === 0) igData.verdict = 'Profilo vuoto';
        else if ((igData.posts as number) < 10) igData.verdict = 'Profilo quasi inattivo';
        else igData.verdict = 'Profilo con contenuti';
      }
    } catch {
      igData.error = 'Non accessibile';
    }
  }

  let socialCount = 0;
  if (instagram) socialCount++;
  if (facebook) socialCount++;
  if (tiktok) socialCount++;
  if (linkedin) socialCount++;

  if (socialCount >= 4) scoreSocial = 90;
  else if (socialCount >= 3) scoreSocial = 70;
  else if (socialCount === 2) scoreSocial = 50;
  else if (socialCount === 1) scoreSocial = 25;

  // Penalizza se IG e' inattivo
  if (instagram && igData.posts !== undefined && (igData.posts as number) < 10) {
    scoreSocial = Math.max(scoreSocial - 15, 5);
  }

  notes.social = {
    platforms: { instagram, facebook, tiktok, linkedin },
    count: socialCount,
    instagram: igData,
  };

  // ── 3. Advertising Analysis ──
  let scoreAdv = 0;
  const advChecks: Record<string, boolean> = {};

  if (html) {
    const lower = html.toLowerCase();
    advChecks.facebookPixel = lower.includes('fbq(') || lower.includes('fbevents.js') || lower.includes('facebook.com/tr');
    advChecks.googleAds = lower.includes('google_conversion') || lower.includes('googleads') || lower.includes('ads/ga-audiences');
    advChecks.tiktokPixel = lower.includes('ttq.load') || lower.includes('analytics.tiktok.com');
    advChecks.linkedinTag = lower.includes('snap.licdn.com') || lower.includes('linkedin.com/px');
    advChecks.retargeting = lower.includes('criteo') || lower.includes('adroll') || lower.includes('doubleclick');
    advChecks.hubspot = lower.includes('hubspot') || lower.includes('hs-script');
    advChecks.mailchimp = lower.includes('mailchimp') || lower.includes('chimpstatic');

    let advCount = 0;
    if (advChecks.facebookPixel) advCount++;
    if (advChecks.googleAds) advCount++;
    if (advChecks.tiktokPixel) advCount++;
    if (advChecks.linkedinTag) advCount++;
    if (advChecks.retargeting) advCount++;

    if (advCount >= 3) scoreAdv = 90;
    else if (advCount === 2) scoreAdv = 65;
    else if (advCount === 1) scoreAdv = 35;
  }

  // Check Meta Ad Library
  const adLibrary = await checkMetaAdLibrary(businessName, (lead.city as string) || '');
  if (adLibrary.hasAds && scoreAdv < 35) scoreAdv = 35;
  advChecks.metaAdsActive = adLibrary.hasAds;

  notes.advertising = { checks: advChecks, metaAds: adLibrary };

  // ── 4. SEO Analysis ──
  let scoreSeo = 10;
  const rating = lead.google_rating as number | null;
  const reviews = lead.google_reviews_count as number | null;

  if (rating && rating >= 4.5 && reviews && reviews > 50) scoreSeo = 90;
  else if (rating && rating >= 4.0 && reviews && reviews > 20) scoreSeo = 70;
  else if (rating && rating >= 3.5 && reviews && reviews > 10) scoreSeo = 50;
  else if (rating) scoreSeo = 30;

  // Bonus/malus dal sito
  if (websiteChecks.metaDescription) scoreSeo += 5;
  if (websiteChecks.structuredData) scoreSeo += 5;
  if (websiteChecks.canonical) scoreSeo += 5;
  scoreSeo = Math.min(100, scoreSeo);

  notes.seo = { rating, reviews, checks: { metaDescription: websiteChecks.metaDescription, structuredData: websiteChecks.structuredData, canonical: websiteChecks.canonical } };

  // ── 5. Content Analysis (semplificata, senza AI per risparmiare costi) ──
  let scoreContent = 0;
  if (html) {
    // Conta il testo effettivo (rimuovi tag)
    const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textOnly.split(' ').length;

    if (wordCount > 1000) scoreContent = 70;
    else if (wordCount > 500) scoreContent = 50;
    else if (wordCount > 200) scoreContent = 30;
    else if (wordCount > 50) scoreContent = 15;

    // Bonus per blog/news
    const lower = html.toLowerCase();
    if (lower.includes('/blog') || lower.includes('/news') || lower.includes('/articol')) scoreContent += 15;

    scoreContent = Math.min(100, scoreContent);
    notes.content = { wordCount, hasBlog: scoreContent > 50 };
  } else {
    notes.content = { wordCount: 0, nessunSito: true };
  }

  // ── Total Score ──
  const scoreTotal = Math.round(
    scoreWebsite * 0.25 +
    scoreSocial * 0.25 +
    scoreAdv * 0.20 +
    scoreSeo * 0.15 +
    scoreContent * 0.15
  );

  return {
    scoreWebsite,
    scoreSocial,
    scoreAdv,
    scoreSeo,
    scoreContent,
    scoreTotal,
    instagram,
    facebook,
    tiktok,
    linkedin,
    email,
    notes,
  };
}

// ═══════ Helpers ═══════

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
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

async function checkMetaAdLibrary(businessName: string, city: string): Promise<{ hasAds: boolean; adCount: number }> {
  const query = encodeURIComponent(`${businessName} ${city}`);
  try {
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
      const hasAds = text.includes('ad_archive_id') || text.includes('ad_snapshot_url');
      const adMatches = text.match(/ad_archive_id/g);
      return { hasAds, adCount: adMatches ? adMatches.length : 0 };
    }
  } catch {
    // Non critico
  }
  return { hasAds: false, adCount: 0 };
}
