export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const { title, client_name } = body;
  if (!title) {
    return NextResponse.json({ error: 'Titolo obbligatorio' }, { status: 400 });
  }

  const systemPrompt = `Sei un project manager di un'agenzia creativa italiana.
Il tuo compito è scrivere descrizioni chiare e concise per le task operative.
Scrivi SOLO la descrizione, senza titoli, intestazioni o prefissi.
La descrizione deve essere pratica e orientata all'azione, in italiano.
Massimo 3-4 frasi. Non usare markdown.`;

  const prompt = `Scrivi una descrizione operativa per questa task:
Titolo: "${title}"${client_name ? `\nCliente: ${client_name}` : ''}

La descrizione deve spiegare brevemente cosa fare, come farlo e qual è il risultato atteso.`;

  try {
    // Try Claude first
    if (process.env.ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ description: data.content[0].text });
      }
    }

    // Fallback to OpenAI
    if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ description: data.choices[0].message.content });
      }
    }

    return NextResponse.json({ error: 'Nessun provider AI configurato' }, { status: 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
