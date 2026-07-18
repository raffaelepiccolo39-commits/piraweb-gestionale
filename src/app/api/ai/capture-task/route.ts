export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

/**
 * Cattura rapida: da un messaggio in linguaggio naturale (es. inoltrato da un
 * cliente su WhatsApp) l'AI propone una o più task, indovina il CLIENTE a cui
 * si riferisce e suggerisce il ruolo a cui assegnarle. Non crea nulla: torna
 * una proposta che l'admin conferma o corregge nell'interfaccia.
 */

interface ParsedTask {
  title: string;
  description: string;
  assigned_to_role: string;
  priority: string;
  estimated_hours: number | null;
  deadline: string | null;
}

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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
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
  const clients = clientsRes.data ?? [];

  const teamContext = members.map((m) => `- ${m.full_name} (${m.role})`).join('\n');
  const clientList = clients.map((c) => `- ${c.id}: ${c.company || c.name}`).join('\n');
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Sei l'assistente operativo di un'agenzia web. L'admin ti inoltra un messaggio (spesso scritto da un cliente). Capisci cosa va fatto e trasformalo in task per il team.

Oggi è ${today}.

Team disponibile:
${teamContext}

Ruoli e responsabilità:
- admin: gestione generale, decisioni strategiche
- social_media_manager: gestione social, pianificazione editoriale, analytics
- content_creator: copywriting, blog, newsletter, script video, montaggio video
- graphic_social: grafiche per social media, stories, reel
- graphic_brand: branding, loghi, materiale aziendale, packaging, siti

Clienti (id: nome):
${clientList || '(nessun cliente)'}

Messaggio ricevuto:
"""
${message}
"""

Rispondi ESCLUSIVAMENTE con JSON valido (niente markdown, niente backtick):
{
  "client_id": "l'id del cliente della lista a cui si riferisce il messaggio, oppure null se non è chiaro",
  "tasks": [
    {
      "title": "titolo chiaro e azionabile",
      "description": "cosa fare, con i dettagli utili dal messaggio",
      "assigned_to_role": "uno tra: admin, social_media_manager, content_creator, graphic_social, graphic_brand",
      "priority": "low|medium|high|urgent",
      "estimated_hours": numero_o_null,
      "deadline": "YYYY-MM-DD se il messaggio indica una scadenza, altrimenti null"
    }
  ]
}

Regole: se il messaggio contiene più richieste, crea un task per ciascuna. Titoli concreti. Non inventare clienti non in lista.`;

  let result: string;
  try {
    result = await callClaude(prompt);
  } catch (claudeErr) {
    await logError({ error: claudeErr, route: '/api/ai/capture-task', source: 'api', context: { op: 'capture-task' } });
    try {
      result = await callOpenAI(prompt);
    } catch (openaiErr) {
      await logError({ error: openaiErr, route: '/api/ai/capture-task', source: 'api', context: { op: 'capture-task' } });
      return NextResponse.json({ error: 'Errore nella generazione AI. Verifica le API key.' }, { status: 500 });
    }
  }

  try {
    let cleaned = result.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    const parsed = JSON.parse(cleaned) as { client_id: string | null; tasks: ParsedTask[] };

    // Mappa ruolo → primo membro attivo con quel ruolo.
    const roleToUserId = new Map<string, string>();
    members.forEach((p) => { if (!roleToUserId.has(p.role)) roleToUserId.set(p.role, p.id); });

    // Valida il client_id contro la lista reale (l'AI potrebbe inventarlo).
    const validClientId = parsed.client_id && clients.some((c) => c.id === parsed.client_id)
      ? parsed.client_id
      : null;

    const tasks = (parsed.tasks ?? []).map((t) => ({
      title: t.title,
      description: t.description,
      assigned_to_role: t.assigned_to_role,
      assigned_to: roleToUserId.get(t.assigned_to_role) ?? null,
      priority: ['low', 'medium', 'high', 'urgent'].includes(t.priority) ? t.priority : 'medium',
      estimated_hours: typeof t.estimated_hours === 'number' ? t.estimated_hours : null,
      deadline: t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? t.deadline : null,
    }));

    return NextResponse.json({ client_id: validClientId, tasks });
  } catch (e) {
    await logError({ error: e, route: '/api/ai/capture-task', source: 'api', context: { op: 'capture-task-parse' } });
    return NextResponse.json({ error: 'Errore nel parsing della risposta AI', raw: result }, { status: 500 });
  }
}
