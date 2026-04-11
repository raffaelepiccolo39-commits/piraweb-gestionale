export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * AI-powered lead search that finds potential clients by sector + location.
 * Uses Google Places for real data + AI for qualification scoring.
 * POST /api/prospects/ai-search
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`ai-search:${user.id}`, { maxRequests: 10, windowSeconds: 3600 });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Max 10 ricerche AI/ora. Riprova tra poco.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const sector = typeof body.sector === 'string' ? body.sector.trim() : '';
  const provincia = typeof body.provincia === 'string' ? body.provincia.trim() : '';
  const regione = typeof body.regione === 'string' ? body.regione.trim() : '';
  const budget = typeof body.budget === 'string' ? body.budget.trim() : 'medio';

  if (!sector) return NextResponse.json({ error: 'Settore obbligatorio' }, { status: 400 });
  if (!provincia && !regione) return NextResponse.json({ error: 'Inserisci almeno provincia o regione' }, { status: 400 });

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const location = provincia ? `${provincia}, ${regione || 'Italia'}` : `${regione}, Italia`;

  // ═══════ Step 1: Search businesses in multiple cities of the province/region ═══════
  const searchQueries: string[] = [];

  if (provincia) {
    // Search in the main city and surrounding areas
    searchQueries.push(`${sector} ${provincia}`);
    searchQueries.push(`${sector} provincia di ${provincia}`);
  } else {
    searchQueries.push(`${sector} ${regione}`);
  }

  let allBusinesses: Record<string, unknown>[] = [];

  if (placesKey) {
    for (const query of searchQueries) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': placesKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri',
          },
          body: JSON.stringify({ textQuery: query, languageCode: 'it', maxResultCount: 20 }),
        });
        if (res.ok) {
          const data = await res.json();
          const places = (data.places || []).map((p: Record<string, unknown>) => ({
            name: (p.displayName as Record<string, string>)?.text || '',
            address: (p.formattedAddress as string) || '',
            rating: (p.rating as number) || null,
            reviews: (p.userRatingCount as number) || null,
            website: (p.websiteUri as string) || null,
            phone: (p.nationalPhoneNumber as string) || null,
            mapsUrl: (p.googleMapsUri as string) || null,
            placeId: (p.id as string) || null,
          }));
          allBusinesses.push(...places);
        }
      } catch { /* continue */ }
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  allBusinesses = allBusinesses.filter((b) => {
    const key = (b.name as string).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ═══════ Step 2: Quick scan each business ═══════
  const analyzed = await Promise.all(
    allBusinesses.slice(0, 30).map(async (biz) => {
      const result: Record<string, unknown> = {
        ...biz,
        has_website: !!biz.website,
        has_ssl: false,
        has_mobile: false,
        has_social: false,
        has_instagram: false,
        has_facebook: false,
        has_analytics: false,
        has_ads: false,
        social_count: 0,
        score: 0,
        issues: [] as string[],
        opportunity: '' as string,
        priority: 'media' as string,
      };

      if (biz.website) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(biz.website as string, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PiraWebBot/1.0)' },
            redirect: 'follow',
          });
          clearTimeout(timer);

          if (res.ok) {
            const html = await res.text();
            const lower = html.toLowerCase();

            result.has_ssl = (biz.website as string).startsWith('https');
            result.has_mobile = lower.includes('viewport');
            result.has_analytics = lower.includes('gtag(') || lower.includes('google-analytics');
            result.has_ads = lower.includes('fbq(') || lower.includes('google_conversion');

            const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
            const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
            if (igMatch) { result.has_instagram = true; result.instagram_url = `https://instagram.com/${igMatch[1]}`; }
            if (fbMatch) { result.has_facebook = true; result.facebook_url = `https://facebook.com/${fbMatch[1]}`; }
            const sc = (igMatch ? 1 : 0) + (fbMatch ? 1 : 0);
            result.social_count = sc;
            result.has_social = sc > 0;
          }
        } catch { /* skip */ }
      }

      // Calculate issues and opportunity score
      const issues: string[] = [];
      if (!biz.website) issues.push('Nessun sito web');
      else {
        if (!result.has_ssl) issues.push('Sito senza HTTPS');
        if (!result.has_mobile) issues.push('Sito non mobile');
        if (!result.has_analytics) issues.push('No analytics');
      }
      if (!result.has_instagram) issues.push('No Instagram');
      if (!result.has_facebook) issues.push('No Facebook');
      if (!result.has_ads) issues.push('No advertising');
      result.issues = issues;

      // Score: more issues = better lead for us (inverted)
      const score = issues.length;
      result.score = score;
      result.priority = score >= 5 ? 'alta' : score >= 3 ? 'media' : 'bassa';

      return result;
    })
  );

  // Sort by score (most issues first = best leads)
  analyzed.sort((a, b) => (b.score as number) - (a.score as number));

  // ═══════ Step 3: AI qualification - generate insights ═══════
  let aiInsights = '';

  const topLeads = analyzed.filter((a) => (a.score as number) >= 3).slice(0, 10);
  const bottomLeads = analyzed.filter((a) => (a.score as number) < 3);

  const aiPrompt = `Sei un business developer di PiraWeb, un'agenzia di comunicazione digitale italiana.

Hai analizzato ${analyzed.length} attivita' nel settore "${sector}" in ${location}.

RISULTATI ANALISI:
- ${analyzed.filter((a) => !a.has_website).length} senza sito web
- ${analyzed.filter((a) => !a.has_instagram).length} senza Instagram
- ${analyzed.filter((a) => !a.has_facebook).length} senza Facebook
- ${analyzed.filter((a) => !a.has_ads).length} senza advertising
- ${analyzed.filter((a) => !a.has_analytics).length} senza analytics

TOP 10 LEAD PIU' PROMETTENTI (quelli con piu' carenze):
${topLeads.map((l, i) => `${i + 1}. ${l.name} (${l.address}) - ${(l.issues as string[]).join(', ')}`).join('\n')}

ATTIVITA' GIA' BEN GESTITE (${bottomLeads.length}):
${bottomLeads.slice(0, 5).map((l) => `- ${l.name}`).join('\n')}

Scrivi una breve analisi strategica (max 300 parole) in italiano che includa:
1. Panoramica del mercato ${sector} in ${location}
2. Quante attivita' sono potenziali clienti per PiraWeb
3. Quali servizi proporre prima (social, sito, ads)
4. Strategia di approccio consigliata
5. Stima del potenziale di fatturato (es: "${topLeads.length} clienti x €500/mese = €${topLeads.length * 500}/mese")

Sii concreto e pratico.`;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: aiPrompt }] }),
      });
      if (res.ok) { const data = await res.json(); aiInsights = data.content[0].text; }
    } catch { /* try next */ }
  }

  if (!aiInsights && process.env.GOOGLE_AI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }], generationConfig: { maxOutputTokens: 1500 } }),
      });
      if (res.ok) { const data = await res.json(); aiInsights = data.candidates?.[0]?.content?.parts?.[0]?.text || ''; }
    } catch { /* failed */ }
  }

  return NextResponse.json({
    sector,
    location,
    total: analyzed.length,
    highPriority: analyzed.filter((a) => a.priority === 'alta').length,
    mediumPriority: analyzed.filter((a) => a.priority === 'media').length,
    lowPriority: analyzed.filter((a) => a.priority === 'bassa').length,
    stats: {
      noWebsite: analyzed.filter((a) => !a.has_website).length,
      noInstagram: analyzed.filter((a) => !a.has_instagram).length,
      noFacebook: analyzed.filter((a) => !a.has_facebook).length,
      noAds: analyzed.filter((a) => !a.has_ads).length,
      noAnalytics: analyzed.filter((a) => !a.has_analytics).length,
    },
    leads: analyzed,
    aiInsights,
  });
}
