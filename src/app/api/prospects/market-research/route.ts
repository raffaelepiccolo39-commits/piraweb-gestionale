export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';

/**
 * Market research: analyze an entire sector in a city.
 * Finds all competitors, analyzes their digital presence, generates insights.
 * POST /api/prospects/market-research
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`market:${user.id}`, { maxRequests: 5, windowSeconds: 3600 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Max 5 indagini all\'ora. Riprova tra poco.' }, { status: 429 });
  }

  const { sector, city } = await request.json();
  if (!sector || !city) return NextResponse.json({ error: 'Settore e citta\' obbligatori' }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Google API non configurata' }, { status: 500 });

  // ═══════ Step 1: Find all businesses in this sector + city ═══════
  let businesses: Record<string, unknown>[] = [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: `${sector} ${city}`, languageCode: 'it', maxResultCount: 20 }),
    });
    if (res.ok) {
      const data = await res.json();
      businesses = (data.places || []).map((p: Record<string, unknown>) => ({
        name: (p.displayName as Record<string, string>)?.text || '',
        address: p.formattedAddress || '',
        rating: (p.rating as number) || null,
        reviews: (p.userRatingCount as number) || null,
        website: (p.websiteUri as string) || null,
        phone: (p.nationalPhoneNumber as string) || null,
        mapsUrl: (p.googleMapsUri as string) || null,
      }));
    }
  } catch {
    return NextResponse.json({ error: 'Errore nella ricerca Google Places' }, { status: 500 });
  }

  if (businesses.length === 0) {
    return NextResponse.json({ error: 'Nessuna attivita\' trovata per questo settore e citta\'' }, { status: 404 });
  }

  // ═══════ Step 2: Quick analysis of each business ═══════
  const analyzed = await Promise.all(
    businesses.map(async (biz) => {
      const result: Record<string, unknown> = {
        ...biz,
        has_website: !!biz.website,
        has_ssl: false,
        has_mobile: false,
        has_social: false,
        social_count: 0,
        has_instagram: false,
        has_facebook: false,
        has_analytics: false,
        has_ads: false,
        instagram_url: null as string | null,
        facebook_url: null as string | null,
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
            result.has_ssl = (biz.website as string).startsWith('https') || res.url.startsWith('https');
            result.has_mobile = lower.includes('viewport');
            result.has_analytics = lower.includes('gtag(') || lower.includes('google-analytics') || lower.includes('googletagmanager');
            result.has_ads = lower.includes('fbq(') || lower.includes('google_conversion') || lower.includes('googleads');

            const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
            const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
            const tkMatch = html.match(/tiktok\.com\/@/);

            let sc = 0;
            if (igMatch) { sc++; result.has_instagram = true; result.instagram_url = `https://instagram.com/${igMatch[1]}`; }
            if (fbMatch) { sc++; result.has_facebook = true; result.facebook_url = `https://facebook.com/${fbMatch[1]}`; }
            if (tkMatch) sc++;
            result.social_count = sc;
            result.has_social = sc > 0;
          }
        } catch { /* skip */ }
      }

      return result;
    })
  );

  // ═══════ Step 3: Aggregate market statistics ═══════
  const total = analyzed.length;
  const withWebsite = analyzed.filter((b) => b.has_website).length;
  const withSSL = analyzed.filter((b) => b.has_ssl).length;
  const withMobile = analyzed.filter((b) => b.has_mobile).length;
  const withSocial = analyzed.filter((b) => b.has_social).length;
  const withInstagram = analyzed.filter((b) => b.has_instagram).length;
  const withFacebook = analyzed.filter((b) => b.has_facebook).length;
  const withAnalytics = analyzed.filter((b) => b.has_analytics).length;
  const withAds = analyzed.filter((b) => b.has_ads).length;

  const ratings = analyzed.filter((b) => b.rating).map((b) => b.rating as number);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null;
  const reviews = analyzed.filter((b) => b.reviews).map((b) => b.reviews as number);
  const avgReviews = reviews.length > 0 ? Math.round(reviews.reduce((s, r) => s + r, 0) / reviews.length) : null;
  const topRated = [...analyzed].sort((a, b) => ((b.rating as number) || 0) - ((a.rating as number) || 0)).slice(0, 3);
  const noWebsite = analyzed.filter((b) => !b.has_website);
  const noSocial = analyzed.filter((b) => !b.has_social);
  const noAds = analyzed.filter((b) => !b.has_ads);

  const stats = {
    total,
    withWebsite, withWebsitePct: Math.round((withWebsite / total) * 100),
    withSSL, withSSLPct: Math.round((withSSL / total) * 100),
    withMobile, withMobilePct: Math.round((withMobile / total) * 100),
    withSocial, withSocialPct: Math.round((withSocial / total) * 100),
    withInstagram, withInstagramPct: Math.round((withInstagram / total) * 100),
    withFacebook, withFacebookPct: Math.round((withFacebook / total) * 100),
    withAnalytics, withAnalyticsPct: Math.round((withAnalytics / total) * 100),
    withAds, withAdsPct: Math.round((withAds / total) * 100),
    avgRating, avgReviews,
  };

  // ═══════ Step 4: Generate AI insights ═══════
  let aiInsights = '';
  const aiPrompt = `Sei un analista di mercato esperto in marketing digitale per attivita' locali italiane.

Hai analizzato il settore "${sector}" nella citta' di "${city}". Ecco i dati REALI trovati:

STATISTICHE DEL MERCATO (${total} attivita' analizzate):
- Con sito web: ${withWebsite}/${total} (${stats.withWebsitePct}%)
- Con HTTPS: ${withSSL}/${total} (${stats.withSSLPct}%)
- Ottimizzati mobile: ${withMobile}/${total} (${stats.withMobilePct}%)
- Con almeno 1 social: ${withSocial}/${total} (${stats.withSocialPct}%)
- Con Instagram: ${withInstagram}/${total} (${stats.withInstagramPct}%)
- Con Facebook: ${withFacebook}/${total} (${stats.withFacebookPct}%)
- Con Google Analytics: ${withAnalytics}/${total} (${stats.withAnalyticsPct}%)
- Con advertising (pixel): ${withAds}/${total} (${stats.withAdsPct}%)
- Rating medio Google: ${avgRating || 'N/A'}
- Recensioni medie: ${avgReviews || 'N/A'}

TOP 3 per rating:
${topRated.map((b, i) => `${i + 1}. ${b.name} - ${b.rating} stelle (${b.reviews} recensioni) ${b.has_website ? '- ha sito' : '- NO sito'}`).join('\n')}

ATTIVITA' SENZA SITO WEB (${noWebsite.length}):
${noWebsite.slice(0, 5).map((b) => `- ${b.name}`).join('\n')}

ATTIVITA' SENZA SOCIAL (${noSocial.length}):
${noSocial.slice(0, 5).map((b) => `- ${b.name}`).join('\n')}

Scrivi un report di indagine di mercato in italiano con queste sezioni:

## Panoramica del Mercato
[Descrivi il settore ${sector} a ${city}: quante attivita', livello di digitalizzazione, maturita' del mercato]

## Livello di Digitalizzazione
[Analizza i dati reali: quanti hanno sito, social, ads. Confronta con la media nazionale del settore. Evidenzia le lacune]

## Analisi Competitiva
[Chi sono i leader? Cosa fanno bene? Dove c'e' spazio per differenziarsi?]

## Opportunita' di Mercato
[Basandoti sui dati, dove ci sono le maggiori opportunita'? Quante attivita' hanno bisogno urgente di servizi digitali? Stima il mercato potenziale]

## Raccomandazioni Strategiche
[Come PiraWeb dovrebbe approcciare questo mercato? Quali servizi proporre prima? A quali attivita' rivolgersi? Strategia di prezzo suggerita]

Usa SOLO i dati reali forniti. Sii specifico e concreto. Max 600 parole.`;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: aiPrompt }] }),
      });
      if (res.ok) { const data = await res.json(); aiInsights = data.content[0].text; }
    } catch { /* try next */ }
  }

  if (!aiInsights && process.env.GOOGLE_AI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }], generationConfig: { maxOutputTokens: 2000 } }),
      });
      if (res.ok) { const data = await res.json(); aiInsights = data.candidates?.[0]?.content?.parts?.[0]?.text || ''; }
    } catch { /* failed */ }
  }

  return NextResponse.json({
    sector,
    city,
    stats,
    businesses: analyzed,
    topRated,
    noWebsite,
    noSocial,
    noAds,
    aiInsights,
  });
}
