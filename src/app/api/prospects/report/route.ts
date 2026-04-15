export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';

/**
 * Generate a detailed marketing audit report for a prospect.
 * Uses AI to create a professional document showing what they're losing.
 * POST /api/prospects/report
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`report:${user.id}`, AI_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Troppe richieste. Riprova tra qualche minuto.' }, { status: 429 });
  }

  const { prospect_id } = await request.json();
  if (!prospect_id) return NextResponse.json({ error: 'prospect_id obbligatorio' }, { status: 400 });

  const { data: prospect } = await supabase.from('lead_prospects').select('*').eq('id', prospect_id).single();
  if (!prospect) return NextResponse.json({ error: 'Prospect non trovato' }, { status: 404 });

  const notes = prospect.analysis_notes as Record<string, Record<string, unknown>>;

  // Collect all issues
  const extractIssues = (data: unknown): string[] => {
    if (!Array.isArray(data)) return [];
    return data.map((item: unknown) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'detail' in item) return (item as { detail: string }).detail;
      return String(item);
    });
  };

  const websiteIssues = extractIssues(notes?.website?.issues);
  const socialIssues = extractIssues(notes?.social?.issues);
  const seoIssues = extractIssues(notes?.seo?.issues);
  const contentIssues = extractIssues(notes?.content?.issues);
  const allIssues = [...websiteIssues, ...socialIssues, ...seoIssues, ...contentIssues];
  if (prospect.score_advertising < 20) allIssues.push('Nessuna campagna pubblicitaria online attiva');

  const prompt = `Sei un consulente senior di marketing digitale italiano. Devi creare un REPORT DI AUDIT DIGITALE dettagliato e professionale per un'attivita' locale.

Il report deve essere scritto in modo che il proprietario dell'attivita' capisca ESATTAMENTE cosa sta perdendo e perche' ha bisogno di migliorare la sua presenza digitale. Deve essere persuasivo ma basato su DATI REALI.

═══════════════════════════════════════
DATI DELL'ATTIVITA' ANALIZZATA
═══════════════════════════════════════

Nome: ${prospect.business_name}
Citta': ${prospect.city || 'N/A'}
Settore: ${prospect.sector || 'N/A'}
Sito web: ${prospect.website || 'ASSENTE'}
Telefono: ${prospect.phone || 'N/A'}

PUNTEGGI ANALISI (su 100):
- Sito Web: ${prospect.score_website}/100
- Social Media: ${prospect.score_social}/100
- Advertising: ${prospect.score_advertising}/100
- SEO/Google: ${prospect.score_seo}/100
- Contenuti: ${prospect.score_content}/100
- TOTALE: ${prospect.score_total}/100

Google: ${prospect.google_rating ? `${prospect.google_rating} stelle, ${prospect.google_reviews_count} recensioni` : 'Non presente su Google Maps'}
Instagram: ${prospect.instagram_url || 'NON TROVATO'}
Facebook: ${prospect.facebook_url || 'NON TROVATO'}

PROBLEMI SPECIFICI TROVATI:
${allIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

═══════════════════════════════════════
ISTRUZIONI PER IL REPORT
═══════════════════════════════════════

Scrivi il report in formato Markdown con questa struttura ESATTA:

# Audit Digitale: ${prospect.business_name}

## Sommario Esecutivo
[2-3 frasi che riassumono la situazione. Usa numeri concreti. Es: "Il vostro punteggio digitale e' X/100, il che significa che state sfruttando solo il X% del vostro potenziale online."]

## 1. Analisi Sito Web (${prospect.score_website}/100)
[Analisi dettagliata basata sui dati reali. Per ogni problema trovato, spiega:
- Cosa non va
- Perche' e' un problema per il loro business
- Cosa stanno perdendo in termini concreti (clienti, fatturato)
- Cosa farebbero i competitor migliori]

## 2. Analisi Social Media (${prospect.score_social}/100)
[Per ogni piattaforma (Instagram, Facebook, TikTok):
- E' presente? E' attivo? E' curato?
- Quanti potenziali clienti nella zona usano quella piattaforma
- Cosa perdono non essendo presenti
- Esempi di competitor nel loro settore che lo fanno bene
- Se hanno Instagram, commenta sulla frequenza di pubblicazione e qualita']

## 3. Analisi Pubblicita' Online (${prospect.score_advertising}/100)
[Analizza:
- Fanno campagne Facebook/Instagram Ads?
- Fanno Google Ads?
- Hanno pixel di tracciamento installati?
- Quanto potrebbero guadagnare investendo anche solo 5-10€/giorno
- Esempio: "Con un budget di 300€/mese su Instagram Ads, un ${prospect.sector || 'attivita\''} a ${prospect.city || 'citta\''} puo' raggiungere X persone"]

## 4. Analisi SEO e Google (${prospect.score_seo}/100)
[Analizza:
- Sono su Google Maps? Scheda ottimizzata?
- Quante recensioni hanno? Come possono migliorare?
- Quando qualcuno cerca "${prospect.sector || 'il loro tipo di attivita\''}" a ${prospect.city || 'citta\''}, loro appaiono?
- Cosa perdono non essendo visibili su Google]

## 5. Cosa State Perdendo: I Numeri
[Sezione CRUCIALE. Stima concreta di cosa stanno perdendo:
- "Un ${prospect.sector || 'attivita\''} senza Instagram a ${prospect.city || 'citta\''} perde mediamente il X% dei clienti sotto i 35 anni"
- "Senza Google Ads, i vostri competitor stanno intercettando X ricerche al mese"
- "Un sito non ottimizzato per mobile perde il 60% dei visitatori"
- "Senza recensioni su Google, il 72% dei consumatori non vi considera"
Usa statistiche di marketing REALI e credibili.]

## 6. Piano d'Azione Consigliato
[Proponi 3 fasi concrete:
### Fase 1 - Urgente (Prime 2 settimane)
[Le cose da fare subito]

### Fase 2 - Crescita (Mese 1-2)
[Strategie a medio termine]

### Fase 3 - Dominio (Mese 3-6)
[Obiettivi a lungo termine]

Per ogni fase, indica cosa si farebbe e il risultato atteso.]

## 7. Perche' PiraWeb
[Breve paragrafo su come PiraWeb puo' aiutarli. Non troppo commerciale, ma concreto:
- Siamo un'agenzia locale che conosce il territorio
- Abbiamo esperienza nel settore ${prospect.sector || 'delle attivita\' locali'}
- Offriamo un primo incontro gratuito senza impegno]

---
*Report generato da PiraWeb - Agenzia di Comunicazione Digitale*
*Dati aggiornati al ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}*

REGOLE:
- Scrivi TUTTO in italiano
- Usa dati e statistiche credibili di marketing digitale
- Sii specifico per il settore "${prospect.sector || 'attivita\' locale'}" e la citta' "${prospect.city || ''}"
- Il tono deve essere professionale, autorevole ma accessibile
- Non inventare dati dell'attivita', usa solo quelli forniti
- Le statistiche di mercato devono essere credibili e basate su trend reali
- Il report deve essere lungo e dettagliato (almeno 800 parole)
- Formatta in Markdown pulito`;

  // Try Claude first, then Gemini
  let report = '';

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        report = data.content[0].text;
      }
    } catch { /* try next */ }
  }

  if (!report && process.env.GOOGLE_AI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        report = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } catch { /* failed */ }
  }

  if (!report) {
    return NextResponse.json({ error: 'Errore nella generazione del report' }, { status: 500 });
  }

  // Save report to prospect
  await supabase.from('lead_prospects').update({
    outreach_notes: report,
  }).eq('id', prospect_id);

  return NextResponse.json({ report });
}
