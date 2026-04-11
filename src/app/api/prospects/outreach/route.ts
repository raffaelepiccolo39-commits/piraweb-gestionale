export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';

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

  const { prospect_id, channel } = await request.json();
  if (!prospect_id) return NextResponse.json({ error: 'prospect_id obbligatorio' }, { status: 400 });

  const { data: prospect } = await supabase.from('lead_prospects').select('*').eq('id', prospect_id).single();
  if (!prospect) return NextResponse.json({ error: 'Prospect non trovato' }, { status: 404 });

  const notes = prospect.analysis_notes as Record<string, Record<string, unknown>>;
  const websiteIssues = (notes?.website?.issues as string[]) || [];
  const socialIssues = (notes?.social?.issues as string[]) || [];
  const seoIssues = (notes?.seo?.issues as string[]) || [];
  const allIssues = [...websiteIssues, ...socialIssues, ...seoIssues];
  if (prospect.score_advertising < 20) allIssues.push('Nessuna campagna pubblicitaria online');

  const isWhatsapp = channel === 'whatsapp';

  const prompt = `Sei un consulente di marketing digitale italiano che lavora per PiraWeb, un'agenzia di comunicazione.

Devi scrivere un messaggio ${isWhatsapp ? 'WhatsApp (breve, diretto, informale ma professionale, max 300 parole)' : 'email (professionale ma cordiale, max 400 parole)'} per contattare un potenziale cliente.

DATI DEL PROSPECT:
- Nome attivita': ${prospect.business_name}
- Citta': ${prospect.city || 'N/A'}
- Settore: ${prospect.sector || 'N/A'}
- Sito web: ${prospect.website || 'Nessuno'}
- Valutazione Google: ${prospect.google_rating || 'N/A'} (${prospect.google_reviews_count || 0} recensioni)
- Score digitale totale: ${prospect.score_total}/100

PROBLEMI TROVATI NELLA LORO PRESENZA DIGITALE:
${allIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

SCORES:
- Sito web: ${prospect.score_website}/100
- Social media: ${prospect.score_social}/100
- Contenuti: ${prospect.score_content}/100
- Advertising: ${prospect.score_advertising}/100
- SEO/Google: ${prospect.score_seo}/100

ISTRUZIONI:
1. Inizia con un complimento genuino sulla loro attivita'
2. Menziona che hai notato alcune opportunita' di miglioramento nella loro presenza online (senza essere aggressivo)
3. Elenca 2-3 problemi specifici che hai trovato in modo costruttivo
4. Proponi brevemente come PiraWeb potrebbe aiutarli
5. Chiudi con una call-to-action morbida (es: "Ti andrebbe una chiacchierata di 15 minuti?")
${isWhatsapp ? '6. Non usare formattazione email (no oggetto, no firma formale). Scrivi come un messaggio WhatsApp naturale.' : '6. Includi un oggetto email accattivante all\'inizio (riga: Oggetto: ...). Firma come "Il team PiraWeb".'}

Scrivi SOLO il messaggio, niente altro.`;

  // Try Claude, then Gemini, then OpenAI
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
