export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

/**
 * Aiuta il cliente a mettere giù un'idea, come la cattura rapida fa con noi.
 *
 * Stesso meccanismo: si scrive alla buona, l'AI PROPONE una versione ordinata,
 * la persona guarda e conferma. Non salva niente da sé — l'idea entra nel
 * diario solo quando il cliente preme Salva, e resta modificabile fino a
 * quel momento.
 *
 * Perché serve: un'idea arriva quasi sempre come mezza frase ("una cosa tipo
 * il dietro le quinte del laboratorio"). Se resta così, chi la rilegge fra
 * due mesi non sa più cosa intendesse. Qui viene ordinata mentre il cliente
 * ce l'ha ancora in testa.
 *
 * L'AI NON inventa: se il testo non basta, restituisce quello che c'è.
 */

async function chiediAClaude(prompt: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const dati = await r.json();
  return dati.content?.[0]?.text ?? '';
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Riservato ai clienti del portale: il team ha già la cattura rapida.
  const service = await createServiceRoleClient();
  const { data: portale } = await service
    .from('client_portal_users')
    .select('client_id, client:clients(name, company)')
    .eq('id', user.id)
    .maybeSingle();

  if (!portale) return NextResponse.json({ error: 'Riservato ai clienti' }, { status: 403 });

  // Stesso tetto delle altre chiamate AI: è una spesa nostra a ogni tocco.
  const limite = checkRateLimit(`ai:idea:${user.id}`, AI_RATE_LIMIT);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: 'Hai sistemato molte idee di fila. Riprova fra qualche minuto.' },
      { status: 429 },
    );
  }

  const { testo } = await request.json();
  const grezzo = String(testo ?? '').trim();
  if (grezzo.length < 3) {
    return NextResponse.json({ error: 'Scrivi prima qualcosa' }, { status: 400 });
  }
  if (grezzo.length > 4000) {
    return NextResponse.json({ error: 'Testo troppo lungo' }, { status: 400 });
  }

  const cliente = portale.client as unknown as { name: string | null; company: string | null } | null;

  const prompt = `Sei l'assistente di un'agenzia di comunicazione. Un cliente (${cliente?.company || cliente?.name || 'un cliente'}) ha buttato giù un'idea per i suoi contenuti social, spesso di fretta e in poche parole.

Riscrivila in modo che fra due mesi si capisca ancora cosa intendeva, restando FEDELE a quello che ha scritto.

REGOLE FERREE:
- Non inventare dettagli che non ha dato: niente location, prodotti, persone o numeri che non ha nominato.
- Non aggiungere consigli, complimenti o valutazioni sull'idea.
- Resta nella sua lingua e nel suo tono. Dagli del tu.
- Se l'idea è già chiara, lasciala quasi identica.
- Se è troppo vaga per essere riscritta, restituiscila com'è e metti "vaga": true.

Idea del cliente:
"""
${grezzo}
"""

Rispondi SOLO con JSON, senza altro testo:
{"titolo": "massimo 6 parole, il succo dell'idea", "testo": "l'idea riscritta, 1-3 frasi", "formato": "reel|post|carosello|storia|non chiaro", "vaga": false}`;

  try {
    const risposta = await chiediAClaude(prompt);
    // Il modello a volte incornicia il JSON: si prende dalla prima graffa.
    const inizio = risposta.indexOf('{');
    const fine = risposta.lastIndexOf('}');
    if (inizio === -1 || fine === -1) throw new Error('risposta senza JSON');

    const proposta = JSON.parse(risposta.slice(inizio, fine + 1));
    return NextResponse.json({
      titolo: String(proposta.titolo ?? '').slice(0, 120),
      testo: String(proposta.testo ?? grezzo).slice(0, 2000),
      formato: String(proposta.formato ?? 'non chiaro'),
      vaga: !!proposta.vaga,
    });
  } catch (error) {
    logError({
      error,
      route: '/api/portal/idea-assist',
      context: { clientId: portale.client_id, lunghezza: grezzo.length },
    });
    // Il cliente non deve restare bloccato: l'aiuto è un di più, l'idea si
    // salva comunque a mano.
    return NextResponse.json({ error: 'Non sono riuscito a sistemarla, salvala pure così' }, { status: 502 });
  }
}
