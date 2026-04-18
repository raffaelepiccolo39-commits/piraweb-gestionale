export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getRicercaDelGiorno } from '@/lib/lead-agents/config';
import { checkApiBudget, trackApiUsage } from '@/lib/lead-agents/api-budget';

/**
 * LEAD SCOUT AGENT
 * Cerca automaticamente PMI nella zona di Casapesenna e dintorni.
 * Ogni giorno esplora una zona diversa con 2 settori.
 * Parte dai paesi limitrofi e si espande progressivamente.
 *
 * Schedule: 1 volta al giorno
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

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY non configurata' }, { status: 500 });
  }

  const supabase = await createServiceRoleClient();
  const runId = crypto.randomUUID();

  // Check budget API Google Places (limite 100€/mese)
  try {
    const budget = await checkApiBudget(supabase);
    if (!budget.allowed) {
      return NextResponse.json({
        error: 'Budget API Google Places esaurito per questo mese',
        used: budget.used,
        limit: budget.limit,
        spentEur: budget.spentEur,
        budgetEur: budget.budgetEur,
      }, { status: 429 });
    }
  } catch {
    // Se la tabella api_usage non esiste ancora, procedi comunque
  }

  // Cosa cerchiamo oggi?
  const { zona, settori, zonaIndex } = getRicercaDelGiorno();

  await supabase.from('agent_runs').insert({
    id: runId,
    agent: 'lead_scout',
    status: 'running',
    search_params: { zona: zona.nome, comuni: zona.comuni, settori, zonaIndex },
  });

  try {
    // Trova l'admin user
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    const createdBy = adminUser?.id || '00000000-0000-0000-0000-000000000000';

    let totalFound = 0;
    let totalSkipped = 0;
    let apiCallsCount = 0;
    const allNewLeads: string[] = [];

    // Per ogni comune della zona, cerca i settori di oggi
    for (const comune of zona.comuni) {
      for (const settore of settori) {
        const query = `${settore} ${comune}`;

        // Cerca su Google Places
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

          if (res.ok) {
            const data = await res.json();
            places = data.places || [];
            apiCallsCount++;
          }
        } catch {
          continue;
        }

        for (const place of places) {
          const placeId = place.id as string;
          const name = (place.displayName as Record<string, string>)?.text || '';
          const website = (place.websiteUri as string) || null;
          const rating = (place.rating as number) || null;
          const reviews = (place.userRatingCount as number) || null;

          if (!name) continue;

          // Controlla duplicati
          const { data: existing } = await supabase
            .from('lead_prospects')
            .select('id')
            .eq('google_place_id', placeId)
            .limit(1);

          if (existing && existing.length > 0) {
            totalSkipped++;
            continue;
          }

          const { data: existingByName } = await supabase
            .from('lead_prospects')
            .select('id')
            .eq('business_name', name)
            .eq('city', comune)
            .limit(1);

          if (existingByName && existingByName.length > 0) {
            totalSkipped++;
            continue;
          }

          // Quick scan del sito
          const quickScore = await quickWebsiteScan(website);

          // Cerca social dal sito (reuse HTML from scan to avoid double fetch)
          const social = await extractSocialFromWebsite(website, quickScore?.html);

          // Score preliminare
          let scoreWebsite = quickScore?.score ?? 0;
          let scoreSocial = 0;
          let scoreAdv = 0;
          let scoreSeo = 10;

          let socialCount = 0;
          if (social.instagram) socialCount++;
          if (social.facebook) socialCount++;
          if (social.tiktok) socialCount++;
          if (socialCount >= 3) scoreSocial = 70;
          else if (socialCount === 2) scoreSocial = 50;
          else if (socialCount === 1) scoreSocial = 25;

          if (quickScore?.hasAds) scoreAdv = 35;

          if (rating && rating >= 4.0 && reviews && reviews > 20) scoreSeo = 70;
          else if (rating && rating >= 3.5) scoreSeo = 40;
          else if (rating) scoreSeo = 25;

          const scoreTotal = Math.round(
            scoreWebsite * 0.3 +
            scoreSocial * 0.25 +
            scoreAdv * 0.25 +
            scoreSeo * 0.2
          );

          const { error: insertError } = await supabase.from('lead_prospects').insert({
            business_name: name,
            address: (place.formattedAddress as string) || null,
            city: comune,
            sector: settore,
            phone: (place.nationalPhoneNumber as string) || null,
            website,
            google_maps_url: (place.googleMapsUri as string) || null,
            google_place_id: placeId,
            google_rating: rating,
            google_reviews_count: reviews,
            instagram_url: social.instagram,
            facebook_url: social.facebook,
            tiktok_url: social.tiktok,
            score_website: scoreWebsite,
            score_social: scoreSocial,
            score_advertising: scoreAdv,
            score_seo: scoreSeo,
            score_total: scoreTotal,
            outreach_status: 'new',
            search_query: query,
            created_by: createdBy,
          });

          if (!insertError) {
            totalFound++;
            allNewLeads.push(`${name} (${comune})`);
          }
        }
      }
    }

    // Track API usage per budget mensile
    if (apiCallsCount > 0) {
      try { await trackApiUsage(supabase, apiCallsCount); } catch { /* tabella potrebbe non esistere ancora */ }
    }

    await supabase.from('agent_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      leads_found: totalFound,
      leads_skipped: totalSkipped,
      details: {
        zona: zona.nome,
        comuni: zona.comuni,
        settori,
        new_leads: allNewLeads,
      },
    }).eq('id', runId);

    return NextResponse.json({
      success: true,
      agent: 'lead_scout',
      zona: zona.nome,
      leads_found: totalFound,
      leads_skipped: totalSkipped,
    });

  } catch (err) {
    await supabase.from('agent_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err instanceof Error ? err.message : 'Errore sconosciuto',
    }).eq('id', runId);

    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore sconosciuto',
      agent: 'lead_scout',
    }, { status: 500 });
  }
}

// ═══════ Helpers ═══════

async function quickWebsiteScan(website: string | null): Promise<{
  score: number;
  hasSSL: boolean;
  hasMobile: boolean;
  hasAnalytics: boolean;
  hasAds: boolean;
  html: string;
} | null> {
  if (!website) return null;

  try {
    const url = website.startsWith('http') ? website : `https://${website}`;

    // SSRF protection
    const { isUrlSafeToFetch } = await import('@/lib/url-validator');
    if (!isUrlSafeToFetch(url)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PiraWebBot/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timer);

    const html = await res.text();
    const lower = html.toLowerCase();

    const hasSSL = url.startsWith('https') || res.url.startsWith('https');
    const hasMobile = lower.includes('viewport');
    const hasAnalytics = lower.includes('google-analytics') || lower.includes('gtag(') || lower.includes('googletagmanager');
    const hasAds = lower.includes('fbq(') || lower.includes('google_conversion') || lower.includes('googleads');

    let score = 20;
    if (hasSSL) score += 15;
    if (hasMobile) score += 20;
    if (hasAnalytics) score += 15;
    if (hasAds) score += 15;

    return { score: Math.min(score, 100), hasSSL, hasMobile, hasAnalytics, hasAds, html };
  } catch {
    return { score: 5, hasSSL: false, hasMobile: false, hasAnalytics: false, hasAds: false, html: '' };
  }
}

async function extractSocialFromWebsite(website: string | null, prefetchedHtml?: string): Promise<{
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
}> {
  if (!website) return { instagram: null, facebook: null, tiktok: null };

  try {
    let html = prefetchedHtml;

    if (!html) {
      const url = website.startsWith('http') ? website : `https://${website}`;

      // SSRF protection
      const { isUrlSafeToFetch } = await import('@/lib/url-validator');
      if (!isUrlSafeToFetch(url)) return { instagram: null, facebook: null, tiktok: null };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PiraWebBot/1.0)' },
        redirect: 'follow',
      });
      clearTimeout(timer);

      html = await res.text();
    }

    const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
    const tkMatch = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/);

    return {
      instagram: igMatch ? `https://instagram.com/${igMatch[1]}` : null,
      facebook: fbMatch ? `https://facebook.com/${fbMatch[1]}` : null,
      tiktok: tkMatch ? `https://tiktok.com/@${tkMatch[1]}` : null,
    };
  } catch {
    return { instagram: null, facebook: null, tiktok: null };
  }
}
