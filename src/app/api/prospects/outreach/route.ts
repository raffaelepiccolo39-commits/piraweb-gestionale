export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';

/**
 * Build score-based diagnostic lines.
 * Each line is a plain-language observation tied to a numeric threshold.
 */
function buildScoreDiagnostics(prospect: Record<string, unknown>): string[] {
  const diagnostics: string[] = [];

  const scoreWebsite = prospect.score_website as number;
  const scoreSocial = prospect.score_social as number;
  const scoreContent = prospect.score_content as number;
  const scoreAdvertising = prospect.score_advertising as number;
  const scoreSeo = prospect.score_seo as number;
  const scoreTotal = prospect.score_total as number;

  // Website
  if (scoreWebsite === 0) {
    diagnostics.push('Non avete un sito web: oggi il 70% dei clienti cerca online prima di visitare un\'attivita\'. Senza sito, siete invisibili.');
  } else if (scoreWebsite < 30) {
    diagnostics.push(`Il vostro sito ha bisogno di un aggiornamento urgente (punteggio: ${scoreWebsite}/100). Un sito lento o non ottimizzato per cellulari fa scappare i visitatori in meno di 3 secondi.`);
  } else if (scoreWebsite < 60) {
    diagnostics.push(`Il vostro sito funziona ma ha margini di miglioramento importanti (punteggio: ${scoreWebsite}/100). Piccoli interventi potrebbero raddoppiare le richieste di contatto.`);
  }

  // Social
  if (scoreSocial === 0) {
    diagnostics.push('Non avete profili social attivi: state perdendo la possibilita\' di raggiungere migliaia di potenziali clienti nella vostra zona ogni giorno, gratis.');
  } else if (scoreSocial < 30) {
    diagnostics.push(`La vostra presenza social e\' quasi inesistente (punteggio: ${scoreSocial}/100). Senza Instagram o Facebook attivi, state perdendo il 60% dei clienti sotto i 35 anni nella vostra zona.`);
  } else if (scoreSocial < 60) {
    diagnostics.push(`I vostri social ci sono ma non lavorano abbastanza per voi (punteggio: ${scoreSocial}/100). Con una strategia mirata potreste trasformare i follower in clienti reali.`);
  }

  // Content
  if (scoreContent < 20) {
    diagnostics.push('Non state producendo contenuti online: i vostri concorrenti che pubblicano regolarmente stanno prendendo i clienti che potrebbero essere vostri.');
  } else if (scoreContent < 50) {
    diagnostics.push(`I contenuti che pubblicate sono pochi o poco efficaci (punteggio: ${scoreContent}/100). Contenuti di qualita\' costruiscono fiducia e portano clienti senza spendere in pubblicita\'.`);
  }

  // Advertising
  if (scoreAdvertising === 0) {
    diagnostics.push('Non state facendo pubblicita\' online: i vostri concorrenti che investono anche solo 5-10 euro al giorno su Google o Instagram vi stanno rubando clienti ogni singolo giorno.');
  } else if (scoreAdvertising < 30) {
    diagnostics.push(`La vostra pubblicita\' online e\' minima (punteggio: ${scoreAdvertising}/100). Con un budget mirato potreste ottenere risultati molto migliori di quello che state spendendo ora.`);
  }

  // SEO
  if (scoreSeo < 20) {
    diagnostics.push('Non comparite su Google quando qualcuno cerca i vostri servizi: e\' come avere un negozio in una strada dove non passa nessuno.');
  } else if (scoreSeo < 40) {
    diagnostics.push(`La vostra visibilita\' su Google e\' molto bassa (punteggio: ${scoreSeo}/100). Quando qualcuno cerca "${prospect.sector || 'attivita\' come la vostra'}" nella vostra zona, trovano i concorrenti prima di voi.`);
  }

  // Overall
  if (scoreTotal < 25) {
    diagnostics.push(`Il punteggio digitale complessivo e\' ${scoreTotal}/100: ci sono opportunita\' enormi di crescita con interventi mirati.`);
  }

  return diagnostics;
}

/**
 * Pick the top 3 most critical issues, mixing score-based diagnostics
 * with specific analysis issues for maximum impact.
 */
function pickTopIssues(
  diagnostics: string[],
  analysisIssues: string[],
  maxCount = 3
): string[] {
  // Diagnostics (score-based) are already prioritised by severity.
  // Fill remaining slots with analysis-level detail issues.
  const picked = diagnostics.slice(0, maxCount);
  for (const issue of analysisIssues) {
    if (picked.length >= maxCount) break;
    // Avoid near-duplicates
    const dominated = picked.some(
      (p) => p.toLowerCase().includes(issue.substring(0, 20).toLowerCase())
    );
    if (!dominated) picked.push(issue);
  }
  return picked.slice(0, maxCount);
}

/**
 * Generate personalized outreach message for a prospect.
 * POST /api/prospects/outreach
 * Body: { prospect_id: "...", channel: "whatsapp" | "email" }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`outreach:${user.id}`, AI_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Troppe richieste. Riprova tra qualche minuto.' }, { status: 429 });
  }

  // ── Input validation ──
  const contentType = request.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type deve essere application/json' }, { status: 415 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non è JSON valido' }, { status: 400 });
  }

  const prospect_id = typeof body.prospect_id === 'string' ? body.prospect_id.trim() : '';
  const channel = typeof body.channel === 'string' ? body.channel.trim() : '';

  if (!prospect_id) return NextResponse.json({ error: 'prospect_id obbligatorio' }, { status: 400 });

  const VALID_CHANNELS = ['whatsapp', 'email'] as const;
  if (!VALID_CHANNELS.includes(channel as typeof VALID_CHANNELS[number])) {
    return NextResponse.json(
      { error: `channel deve essere uno tra: ${VALID_CHANNELS.join(', ')}` },
      { status: 400 },
    );
  }

  const { data: prospect } = await supabase.from('lead_prospects').select('*').eq('id', prospect_id).single();
  if (!prospect) return NextResponse.json({ error: 'Prospect non trovato' }, { status: 404 });

  // Gather analysis issues
  const notes = prospect.analysis_notes as Record<string, Record<string, unknown>>;
  const websiteIssues = (notes?.website?.issues as string[]) || [];
  const socialIssues = (notes?.social?.issues as string[]) || [];
  const seoIssues = (notes?.seo?.issues as string[]) || [];
  const allAnalysisIssues = [...websiteIssues, ...socialIssues, ...seoIssues];

  // Build score-based diagnostics and pick the top 3
  const scoreDiagnostics = buildScoreDiagnostics(prospect);
  const topIssues = pickTopIssues(scoreDiagnostics, allAnalysisIssues, 3);

  const isWhatsapp = channel === 'whatsapp';

  // Build a "something specific we noticed" opener hint for the AI
  let specificOpener = '';
  if (prospect.google_rating && (prospect.google_rating as number) >= 4) {
    specificOpener = `Hanno un'ottima valutazione Google di ${prospect.google_rating} stelle con ${prospect.google_reviews_count || 0} recensioni — usalo come complimento iniziale genuino e aggancio ("Ho visto che i vostri clienti vi adorano...").`;
  } else if (prospect.google_reviews_count && (prospect.google_reviews_count as number) > 0) {
    specificOpener = `Hanno ${prospect.google_reviews_count} recensioni su Google — menziona che hai guardato le loro recensioni e che i clienti apprezzano il loro lavoro.`;
  } else if (prospect.website) {
    specificOpener = `Hanno un sito web (${prospect.website}) — menziona che lo hai visitato e hai notato [qualcosa di positivo specifico del settore ${prospect.sector || ''}].`;
  } else {
    specificOpener = `Non hanno un sito web — apri facendo un complimento sulla loro attivita' che hai trovato su Google Maps e sulla reputazione nella zona.`;
  }

  const prompt = `Sei un consulente di marketing digitale italiano che lavora per PiraWeb, un'agenzia web locale. Scrivi come una persona vera che vuole genuinamente aiutare un'attivita' del proprio territorio, NON come un venditore.

FORMATO: ${isWhatsapp ? 'Messaggio WhatsApp — conversazionale, diretto, amichevole. Massimo 250 parole. Niente oggetto, niente firma formale. Usa un tono come se stessi scrivendo a un conoscente.' : 'Email professionale ma calda. Massimo 350 parole. INIZIA con "Oggetto: ..." su una riga separata. Firma come "Un saluto,\\nIl team PiraWeb". Struttura il testo con brevi paragrafi.'}

DATI DEL PROSPECT:
- Nome attivita': ${prospect.business_name}
- Citta': ${prospect.city || 'N/A'}
- Settore: ${prospect.sector || 'N/A'}
- Sito web: ${prospect.website || 'Nessuno'}
- Valutazione Google: ${prospect.google_rating || 'N/A'} (${prospect.google_reviews_count || 0} recensioni)
- Score digitale complessivo: ${prospect.score_total}/100

SCORES DETTAGLIATI:
- Sito web: ${prospect.score_website}/100
- Social media: ${prospect.score_social}/100
- Contenuti: ${prospect.score_content}/100
- Advertising: ${prospect.score_advertising}/100
- SEO/Google: ${prospect.score_seo}/100

APERTURA SPECIFICA (usa questa informazione per aprire il messaggio in modo personale):
${specificOpener}

I 3 PROBLEMI PIU' CRITICI CHE HAI TROVATO (usa ESATTAMENTE questi, riformulandoli in modo naturale):
${topIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

STRUTTURA DEL MESSAGGIO:
1. APERTURA PERSONALE: Inizia menzionando qualcosa di SPECIFICO che hai notato della loro attivita'. Deve sembrare che hai davvero dedicato tempo a guardarli, non un messaggio copia-incolla.

2. I 3 PROBLEMI CHIAVE: Presenta i problemi trovati in modo semplice e comprensibile per un imprenditore non tecnico. Per OGNI problema, spiega brevemente PERCHE' gli costa clienti o soldi (usa numeri e percentuali quando possibile, es: "Senza Instagram, stai perdendo il 60% dei clienti sotto i 35 anni nella tua zona"). Non usare gergo tecnico — parla come parleresti a un amico che ha un'attivita'.

3. PROPOSTA CONCRETA: Offri un AUDIT GRATUITO della loro presenza digitale oppure una chiamata di 15 minuti senza impegno dove mostri esattamente cosa migliorare e come. Deve essere chiaro che non costa nulla e non c'e' nessun obbligo.

4. URGENZA LEGGERA: Aggiungi un elemento di urgenza senza essere aggressivo. Ad esempio: "Ho solo 3 slot questa settimana per audit gratuiti" oppure "I vostri concorrenti nella zona stanno gia' investendo in questo". Mai frasi tipo "OFFERTA LIMITATA" o "SOLO OGGI".

REGOLE IMPORTANTI:
- Scrivi in italiano naturale, non tradotto
- NON usare parole come "digital transformation", "brand awareness", "engagement", "conversion rate" — usa equivalenti semplici
- NON fare liste puntate nei messaggi WhatsApp, scrivi in modo discorsivo
- Per le email puoi usare brevi elenchi ma mantieni un tono caldo
- Il messaggio deve far pensare "questa persona si e' davvero presa il tempo di guardare la mia attivita'" non "questo e' spam"
- Usa il "voi" come forma di cortesia, non il "tu" (a meno che non sia WhatsApp, dove puoi usare un tono piu' diretto con il "voi" informale)
- Non inventare dati che non hai — usa solo le informazioni fornite sopra

Scrivi SOLO il messaggio finale, niente altro.`;

  // Try Claude, then Gemini
  let message = '';

  const providers = [
    {
      name: 'claude',
      fn: async () => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
        });
        if (!res.ok) throw new Error('Claude error');
        const data = await res.json();
        return data.content[0].text;
      },
    },
    {
      name: 'gemini',
      fn: async () => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1000 } }),
        });
        if (!res.ok) throw new Error('Gemini error');
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      },
    },
  ];

  for (const provider of providers) {
    try {
      message = await provider.fn();
      if (message) break;
    } catch { continue; }
  }

  if (!message) {
    return NextResponse.json({ error: 'Errore nella generazione del messaggio' }, { status: 500 });
  }

  // Save to prospect
  await supabase.from('lead_prospects').update({
    outreach_message: message,
    outreach_channel: channel,
    outreach_status: 'to_contact',
  }).eq('id', prospect_id);

  return NextResponse.json({ message, channel });
}
