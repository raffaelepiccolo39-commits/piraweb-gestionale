export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * LEAD OUTREACH AGENT
 * Prende i lead analizzati con score_total <= 50 (= hanno bisogno di servizi digital)
 * e genera messaggi WhatsApp + Email personalizzati usando AI.
 * Li mette in stato 'to_contact' pronti per l'invio manuale.
 *
 * Schedule: ogni 4 ore, h24
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
    agent: 'lead_outreach',
    status: 'running',
  });

  try {
    // Prendi lead analizzati (analyzed_at NOT NULL) con status 'new' e score basso
    // Score <= 50 = hanno bisogno di servizi digital = sono buoni prospect
    const { data: leads, error: fetchError } = await supabase
      .from('lead_prospects')
      .select('*')
      .not('analyzed_at', 'is', null)
      .eq('outreach_status', 'new')
      .lte('score_total', 50)
      .order('score_total', { ascending: true }) // Peggiori prima = migliori prospect
      .limit(5); // Max 5 per run per non esaurire token AI

    if (fetchError) throw new Error(`Errore fetch leads: ${fetchError.message}`);
    if (!leads || leads.length === 0) {
      await supabase.from('agent_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        leads_contacted: 0,
        details: { message: 'Nessun lead pronto per outreach' },
      }).eq('id', runId);

      return NextResponse.json({ success: true, agent: 'lead_outreach', contacted: 0 });
    }

    let contacted = 0;
    const results: Array<{ name: string; channel: string; score: number }> = [];

    for (const prospect of leads) {
      try {
        // Decidi il canale: se ha il telefono -> WhatsApp, altrimenti -> Email
        const channel = prospect.phone ? 'whatsapp' : 'email';

        // Genera il messaggio personalizzato
        const message = await generateOutreachMessage(prospect, channel);

        if (message) {
          await supabase.from('lead_prospects').update({
            outreach_message: message,
            outreach_channel: channel,
            outreach_status: 'to_contact',
          }).eq('id', prospect.id);

          contacted++;
          results.push({
            name: prospect.business_name,
            channel,
            score: prospect.score_total,
          });
        }
      } catch {
        // Skip questo lead, continua con gli altri
        continue;
      }
    }

    await supabase.from('agent_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      leads_contacted: contacted,
      details: { results },
    }).eq('id', runId);

    return NextResponse.json({
      success: true,
      agent: 'lead_outreach',
      contacted,
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
      agent: 'lead_outreach',
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

function buildScoreDiagnostics(prospect: Record<string, unknown>): string[] {
  const diagnostics: string[] = [];

  const scoreWebsite = prospect.score_website as number;
  const scoreSocial = prospect.score_social as number;
  const scoreContent = prospect.score_content as number ?? 0;
  const scoreAdvertising = prospect.score_advertising as number;
  const scoreSeo = prospect.score_seo as number;
  const scoreTotal = prospect.score_total as number;

  if (scoreWebsite === 0) {
    diagnostics.push('Non avete un sito web: oggi il 70% dei clienti cerca online prima di visitare un\'attivita\'. Senza sito, siete invisibili.');
  } else if (scoreWebsite < 30) {
    diagnostics.push(`Il vostro sito ha bisogno di un aggiornamento urgente (punteggio: ${scoreWebsite}/100). Un sito lento o non ottimizzato per cellulari fa scappare i visitatori.`);
  } else if (scoreWebsite < 60) {
    diagnostics.push(`Il vostro sito funziona ma ha margini di miglioramento importanti (punteggio: ${scoreWebsite}/100).`);
  }

  if (scoreSocial === 0) {
    diagnostics.push('Non avete profili social attivi: state perdendo migliaia di potenziali clienti nella vostra zona ogni giorno.');
  } else if (scoreSocial < 30) {
    diagnostics.push(`La vostra presenza social e\' quasi inesistente (punteggio: ${scoreSocial}/100). State perdendo il 60% dei clienti sotto i 35 anni.`);
  } else if (scoreSocial < 60) {
    diagnostics.push(`I vostri social ci sono ma non lavorano abbastanza per voi (punteggio: ${scoreSocial}/100).`);
  }

  if (scoreContent < 20) {
    diagnostics.push('Non state producendo contenuti online: i vostri concorrenti che pubblicano regolarmente stanno prendendo i clienti che potrebbero essere vostri.');
  }

  if (scoreAdvertising === 0) {
    diagnostics.push('Non state facendo pubblicita\' online: i concorrenti che investono anche solo 5-10 euro al giorno vi stanno rubando clienti ogni giorno.');
  } else if (scoreAdvertising < 30) {
    diagnostics.push(`La vostra pubblicita\' online e\' minima (punteggio: ${scoreAdvertising}/100).`);
  }

  if (scoreSeo < 20) {
    diagnostics.push('Non comparite su Google quando qualcuno cerca i vostri servizi.');
  } else if (scoreSeo < 40) {
    diagnostics.push(`La vostra visibilita\' su Google e\' molto bassa (punteggio: ${scoreSeo}/100).`);
  }

  if (scoreTotal < 25) {
    diagnostics.push(`Punteggio digitale complessivo: ${scoreTotal}/100 - ci sono opportunita\' enormi di crescita.`);
  }

  return diagnostics;
}

function pickTopIssues(diagnostics: string[], maxCount = 3): string[] {
  return diagnostics.slice(0, maxCount);
}

async function generateOutreachMessage(
  prospect: Record<string, unknown>,
  channel: 'whatsapp' | 'email'
): Promise<string | null> {
  const isWhatsapp = channel === 'whatsapp';
  const diagnostics = buildScoreDiagnostics(prospect);
  const topIssues = pickTopIssues(diagnostics, 3);

  // Specific opener
  let specificOpener = '';
  if (prospect.google_rating && (prospect.google_rating as number) >= 4) {
    specificOpener = `Hanno un'ottima valutazione Google di ${prospect.google_rating} stelle con ${prospect.google_reviews_count || 0} recensioni — usalo come complimento iniziale.`;
  } else if (prospect.google_reviews_count && (prospect.google_reviews_count as number) > 0) {
    specificOpener = `Hanno ${prospect.google_reviews_count} recensioni su Google — menziona che hai guardato le loro recensioni.`;
  } else if (prospect.website) {
    specificOpener = `Hanno un sito web (${prospect.website}) — menziona che lo hai visitato.`;
  } else {
    specificOpener = `Non hanno un sito web — apri con un complimento sulla loro attivita' trovata su Google Maps.`;
  }

  const prompt = `Sei un consulente di marketing digitale italiano che lavora per PiraWeb, un'agenzia web. Scrivi come una persona vera che vuole genuinamente aiutare un'attivita' del proprio territorio.

FORMATO: ${isWhatsapp ? 'Messaggio WhatsApp — conversazionale, diretto, amichevole. Massimo 250 parole. Niente oggetto, niente firma formale.' : 'Email professionale ma calda. Massimo 350 parole. INIZIA con "Oggetto: ..." su una riga separata. Firma come "Un saluto,\\nIl team PiraWeb".'}

DATI DEL PROSPECT:
- Nome attivita': ${prospect.business_name}
- Citta': ${prospect.city || 'N/A'}
- Settore: ${prospect.sector || 'N/A'}
- Sito web: ${prospect.website || 'Nessuno'}
- Valutazione Google: ${prospect.google_rating || 'N/A'} (${prospect.google_reviews_count || 0} recensioni)
- Score digitale: ${prospect.score_total}/100

SCORES:
- Sito web: ${prospect.score_website}/100
- Social: ${prospect.score_social}/100
- Advertising: ${prospect.score_advertising}/100
- SEO: ${prospect.score_seo}/100

APERTURA:
${specificOpener}

I 3 PROBLEMI CRITICI:
${topIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

STRUTTURA:
1. APERTURA PERSONALE: Menziona qualcosa di specifico della loro attivita'.
2. I 3 PROBLEMI: Presentali in modo semplice per un imprenditore non tecnico. Spiega perche' costa clienti.
3. PROPOSTA: Offri un AUDIT GRATUITO della presenza digitale o una chiamata di 15 minuti senza impegno.
4. URGENZA LEGGERA: "Ho solo 3 slot questa settimana" o simile. Mai aggressivo.

REGOLE:
- Italiano naturale, non tradotto
- NO parole come "digital transformation", "brand awareness", "engagement"
- NO liste puntate in WhatsApp
- Usa il "voi" come forma di cortesia
- Non inventare dati
- Scrivi SOLO il messaggio finale`;

  // Try Claude, then Gemini
  const providers = [
    {
      name: 'claude',
      fn: async () => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('No API key');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) throw new Error('Claude error');
        const data = await res.json();
        return data.content[0].text as string;
      },
    },
    {
      name: 'gemini',
      fn: async () => {
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) throw new Error('No API key');
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1000 },
            }),
          }
        );
        if (!res.ok) throw new Error('Gemini error');
        const data = await res.json();
        return (data.candidates?.[0]?.content?.parts?.[0]?.text as string) || '';
      },
    },
  ];

  for (const provider of providers) {
    try {
      const message = await provider.fn();
      if (message) return message;
    } catch {
      continue;
    }
  }

  return null;
}
