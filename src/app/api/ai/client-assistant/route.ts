export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';

// Schema dell'output: JSON garantito valido (structured outputs di Opus 4.8),
// indispensabile perché le "azioni proposte" vengono poi eseguite dalla UI.
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'risks', 'next_actions', 'proposed_actions', 'editorial_plan'],
  properties: {
    summary: { type: 'string' },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['bassa', 'media', 'alta'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    next_actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'priority'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['bassa', 'media', 'alta', 'urgente'] },
        },
      },
    },
    proposed_actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'title', 'description', 'priority', 'estimated_hours'],
        properties: {
          type: { type: 'string', enum: ['create_task'] },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          estimated_hours: { type: 'number' },
        },
      },
    },
    editorial_plan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'caption', 'platform', 'scheduled_date'],
        properties: {
          title: { type: 'string' },
          caption: { type: 'string' },
          platform: { type: 'string', enum: ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'pinterest', 'other'] },
          scheduled_date: { type: 'string', description: 'Data suggerita di pubblicazione, formato YYYY-MM-DD' },
        },
      },
    },
  },
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Solo l'admin può lanciare l'analisi di un cliente.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Riservato agli amministratori' }, { status: 403 });
  }

  const rateLimit = checkRateLimit(`ai:client-assistant:${user.id}`, AI_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Troppe richieste AI. Riprova tra qualche minuto.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }
  const { client_id } = body ?? {};
  if (!client_id) return NextResponse.json({ error: 'client_id obbligatorio' }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurata' }, { status: 500 });
  }

  // ── Raccolta dati del cliente ──
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('name, company, sector, service_types, notes, paused_at, is_active, relationship_start, needs_monthly_shooting')
    .eq('id', client_id)
    .single();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 });
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, deadline')
    .eq('client_id', client_id);
  const projectIds = (projects ?? []).map((p) => p.id);

  let tasks: unknown[] = [];
  if (projectIds.length) {
    const { data: t } = await supabase
      .from('tasks')
      .select('title, status, priority, deadline, estimated_hours, logged_hours')
      .in('project_id', projectIds)
      .is('archived_at', null)
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(80);
    tasks = t ?? [];
  }

  // Knowledge base (strategia, target, tono) per pianificare il piano editoriale.
  const { data: kb } = await supabase
    .from('client_knowledge_base')
    .select('strategy, objectives, target_audience, tone_of_voice, brand_guidelines, services, competitors, keywords, additional_notes')
    .eq('client_id', client_id)
    .maybeSingle();

  // Titoli dei post recenti: solo per NON duplicare i temi nel piano editoriale.
  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select('title, scheduled_at')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })
    .limit(15);

  const today = new Date().toISOString().slice(0, 10);

  const context = {
    oggi: today,
    cliente: client,
    knowledge_base: kb ?? null,
    progetti: projects ?? [],
    task: tasks,
    post_recenti_da_non_duplicare: (recentPosts ?? []).map((p) => p.title),
  };

  const systemPrompt = `Sei il direttore operativo di PiraWeb, un'agenzia creativa italiana.
Analizzi la situazione di UN cliente per aiutare il titolare a ottimizzare i processi di lavoro su quel cliente.
Ragiona sui dati forniti (progetti, task, scadenze, attività social, stato del rapporto) e produci un'analisi pratica e concreta, in italiano.
Regole:
- Il campo "cliente.paused_at" valorizzato significa che il rapporto è IN PAUSA.
- Segnala rischi reali e specifici (scadenze vicine o superate, task fermi da tempo, cliente inattivo, poca produzione di contenuti), con severità onesta.
- Le "prossime azioni" devono essere passi operativi concreti, non generici.
- Nelle "azioni proposte" suggerisci al massimo 3 task davvero utili da creare per questo cliente; ognuna con titolo, descrizione operativa, priorità e ore stimate realistiche.
- Nel "piano editoriale" proponi un calendario di post social per le prossime 3-4 settimane (di norma 6-10 post), coerente con il settore del cliente e con la knowledge base (strategia, target, tono di voce). Ogni post: titolo, bozza di caption pronta all'uso nel tono del brand, UNA piattaforma adatta, e una data di pubblicazione suggerita (formato YYYY-MM-DD, distribuita nel tempo). NON ripetere i temi già presenti in "post_recenti_da_non_duplicare".
- Non inventare dati che non ci sono. Se mancano strategia/target, proponi comunque un piano editoriale ragionevole per il settore, ma dillo nel riepilogo.`;

  const prompt = `Ecco i dati del cliente in formato JSON:

${JSON.stringify(context, null, 2)}

Analizza la situazione e restituisci l'esito nello schema richiesto.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Errore dal modello AI: ${errText.slice(0, 400)}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
    if (!textBlock?.text) {
      return NextResponse.json({ error: 'Risposta AI vuota' }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json({ error: 'Risposta AI non in formato valido' }, { status: 502 });
    }

    // Ogni azione/voce riceve un id stabile + stato per la conferma in UI.
    const proposedActions = (parsed.proposed_actions ?? []).map((a: Record<string, unknown>, i: number) => ({
      id: `a${i}`,
      status: 'pending',
      ...a,
    }));
    const editorialPlan = (parsed.editorial_plan ?? []).map((p: Record<string, unknown>, i: number) => ({
      id: `e${i}`,
      status: 'pending',
      ...p,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from('client_insights')
      .insert({
        client_id,
        summary: parsed.summary ?? null,
        risks: parsed.risks ?? [],
        next_actions: parsed.next_actions ?? [],
        proposed_actions: proposedActions,
        editorial_plan: editorialPlan,
        model: 'claude-opus-4-8',
        generated_by: user.id,
      })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json({ error: `Salvataggio non riuscito: ${insErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ insight: inserted });
  } catch (e) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || 'Errore imprevisto' },
      { status: 500 },
    );
  }
}
