export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

/**
 * Agente operativo: da un messaggio (o audio trascritto) capisce COSA fare e
 * propone una o più AZIONI — creare task, registrare un pagamento cliente,
 * segnare il rinnovo di un sito, o creare un promemoria. Non esegue nulla: le
 * azioni sui soldi le conferma sempre l'admin. Per pagamento e rinnovo il
 * server risolve la riga esatta (payment_id / renewal_id) da confermare.
 */

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.content[0].text;
}

async function callOpenAI(prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

function monthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: next };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`ai:capture:${user.id}`, AI_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Troppe richieste AI. Riprova tra qualche minuto.' }, { status: 429 });
  }

  const { message } = await request.json();
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Messaggio mancante' }, { status: 400 });
  }

  const [membersRes, clientsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role').eq('is_active', true),
    supabase.from('clients').select('id, name, company').eq('is_active', true).is('paused_at', null),
  ]);
  const members = membersRes.data ?? [];
  const clients = (clientsRes.data ?? []) as { id: string; name: string; company: string | null }[];
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (c.company || c.name) : '';
  };

  const teamContext = members.map((m) => `- ${m.full_name} (${m.role})`).join('\n');
  const clientList = clients.map((c) => `- ${c.id}: ${c.company || c.name}`).join('\n');
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Sei l'assistente operativo di un'agenzia web. L'admin ti inoltra un messaggio (spesso di un cliente, a volte trascritto da un audio). Capisci COSA vuole e traducilo in una o più AZIONI tra queste:
1. task — un lavoro da assegnare al team.
2. payment — un cliente ha pagato una mensilità (registrare l'incasso).
3. website_renewal — un cliente ha pagato il rinnovo annuale del sito.
4. reminder — un promemoria personale per l'admin (nessun assegnatario).

Oggi è ${today}.

Team disponibile:
${teamContext}

Ruoli: admin (gestione), social_media_manager (social, editoriale), content_creator (copy, blog, script, montaggio video), graphic_social (grafiche social), graphic_brand (branding, loghi, siti).

Clienti (id: nome):
${clientList || '(nessun cliente)'}

Messaggio ricevuto:
"""
${message}
"""

Rispondi ESCLUSIVAMENTE con JSON valido (niente markdown):
{
  "actions": [
    // task:
    { "type": "task", "title": "...", "description": "...", "assigned_to_role": "uno dei ruoli", "priority": "low|medium|high|urgent", "estimated_hours": num|null, "deadline": "YYYY-MM-DD"|null, "client_id": "id"|null },
    // pagamento cliente:
    { "type": "payment", "client_id": "id", "month": "YYYY-MM (il mese pagato)" },
    // rinnovo sito:
    { "type": "website_renewal", "client_id": "id" },
    // promemoria personale:
    { "type": "reminder", "title": "...", "date": "YYYY-MM-DD"|null }
  ]
}

Regole: usa solo client_id dalla lista. Per payment/website_renewal, se non riconosci il cliente ometti l'azione. Se il mese non è chiaro per un payment, usa il mese corrente. Più richieste nel messaggio → più azioni.`;

  let raw: string;
  try {
    raw = await callClaude(prompt);
  } catch (claudeErr) {
    await logError({ error: claudeErr, route: '/api/ai/capture-action', source: 'api', context: { op: 'capture-action' } });
    try {
      raw = await callOpenAI(prompt);
    } catch (openaiErr) {
      await logError({ error: openaiErr, route: '/api/ai/capture-action', source: 'api', context: { op: 'capture-action' } });
      return NextResponse.json({ error: 'Errore nella generazione AI. Verifica le API key.' }, { status: 500 });
    }
  }

  let parsed: { actions: Record<string, unknown>[] };
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    await logError({ error: e, route: '/api/ai/capture-action', source: 'api', context: { op: 'capture-action-parse' } });
    return NextResponse.json({ error: 'Errore nel parsing della risposta AI', raw }, { status: 500 });
  }

  const roleToUserId = new Map<string, string>();
  members.forEach((p) => { if (!roleToUserId.has(p.role)) roleToUserId.set(p.role, p.id); });
  const validClient = (id: unknown): id is string => typeof id === 'string' && clients.some((c) => c.id === id);

  const actions: Record<string, unknown>[] = [];

  for (const a of parsed.actions ?? []) {
    const type = a.type;

    if (type === 'task') {
      const role = String(a.assigned_to_role ?? '');
      actions.push({
        type: 'task',
        title: String(a.title ?? ''),
        description: String(a.description ?? ''),
        assigned_to_role: role,
        assigned_to: roleToUserId.get(role) ?? null,
        priority: ['low', 'medium', 'high', 'urgent'].includes(String(a.priority)) ? a.priority : 'medium',
        estimated_hours: typeof a.estimated_hours === 'number' ? a.estimated_hours : null,
        deadline: typeof a.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.deadline) ? a.deadline : null,
        client_id: validClient(a.client_id) ? a.client_id : null,
      });
    } else if (type === 'payment') {
      if (!validClient(a.client_id)) continue;
      const month = typeof a.month === 'string' && /^\d{4}-\d{2}$/.test(a.month) ? a.month : today.slice(0, 7);
      const bounds = monthBounds(month)!;
      // Risolvi la rata NON pagata di quel mese sui contratti attivi del cliente.
      const { data: contracts } = await supabase.from('client_contracts').select('id').eq('client_id', a.client_id).eq('status', 'active');
      const contractIds = (contracts ?? []).map((c) => c.id);
      let payment: { id: string; amount: number; due_date: string } | null = null;
      if (contractIds.length) {
        const { data: pays } = await supabase
          .from('client_payments')
          .select('id, amount, due_date, is_paid')
          .in('contract_id', contractIds)
          .eq('is_paid', false)
          .gte('due_date', bounds.start)
          .lt('due_date', bounds.end)
          .order('due_date')
          .limit(1);
        if (pays && pays.length) payment = { id: pays[0].id, amount: Number(pays[0].amount), due_date: pays[0].due_date };
      }
      actions.push({
        type: 'payment',
        client_id: a.client_id,
        client_name: clientName(a.client_id),
        month,
        payment_id: payment?.id ?? null,
        amount: payment?.amount ?? null,
        due_date: payment?.due_date ?? null,
        resolved: !!payment,
      });
    } else if (type === 'website_renewal') {
      if (!validClient(a.client_id)) continue;
      const { data: sites } = await supabase.from('website_managements').select('id').eq('client_id', a.client_id).limit(1);
      let renewal: { id: string; amount: number; due_date: string } | null = null;
      if (sites && sites.length) {
        const { data: rens } = await supabase
          .from('website_renewals')
          .select('id, amount, due_date, is_paid')
          .eq('website_id', sites[0].id)
          .eq('is_paid', false)
          .order('due_date')
          .limit(1);
        if (rens && rens.length) renewal = { id: rens[0].id, amount: Number(rens[0].amount), due_date: rens[0].due_date };
      }
      actions.push({
        type: 'website_renewal',
        client_id: a.client_id,
        client_name: clientName(a.client_id),
        renewal_id: renewal?.id ?? null,
        amount: renewal?.amount ?? null,
        due_date: renewal?.due_date ?? null,
        resolved: !!renewal,
      });
    } else if (type === 'reminder') {
      actions.push({
        type: 'reminder',
        title: String(a.title ?? ''),
        date: typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : null,
      });
    }
  }

  return NextResponse.json({ actions });
}
