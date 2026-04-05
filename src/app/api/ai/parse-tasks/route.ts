import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface ParsedTask {
  title: string;
  description: string;
  assigned_to_role: string;
  priority: string;
  estimated_hours: number | null;
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error('Claude API error');
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

  if (!response.ok) throw new Error('OpenAI API error');
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { input, project_id } = await request.json();

  if (!input || !project_id) {
    return NextResponse.json({ error: 'Input e project_id sono richiesti' }, { status: 400 });
  }

  // Get team members for context
  const { data: members } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('is_active', true);

  const teamContext = members
    ?.map((m) => `- ${m.full_name} (${m.role})`)
    .join('\n') || '';

  // Get client context from project
  let clientContext = '';
  const { data: project } = await supabase
    .from('projects')
    .select('client_id')
    .eq('id', project_id)
    .single();

  if (project?.client_id) {
    const [clientRes, kbRes] = await Promise.all([
      supabase.from('clients').select('name, company, website').eq('id', project.client_id).single(),
      supabase.from('client_knowledge_base').select('*').eq('client_id', project.client_id).maybeSingle(),
    ]);
    if (clientRes.data) {
      clientContext = `\nCliente: ${clientRes.data.company || clientRes.data.name} (${clientRes.data.website || 'N/A'})`;
    }
    if (kbRes.data) {
      const kb = kbRes.data;
      if (kb.strategy) clientContext += `\nStrategia: ${kb.strategy}`;
      if (kb.objectives) clientContext += `\nObiettivi: ${kb.objectives}`;
      if (kb.services) clientContext += `\nServizi: ${kb.services}`;
      if (kb.target_audience) clientContext += `\nTarget: ${kb.target_audience}`;
    }
  }

  const prompt = `Sei un project manager di un'agenzia web. Analizza questo input in linguaggio naturale e genera una lista di task strutturati.

Team disponibile:
${teamContext}

Ruoli e responsabilità:
- admin: gestione generale, decisioni strategiche
- social_media_manager: gestione social, pianificazione editoriale, analytics
- content_creator: copywriting, blog, newsletter, script video
- graphic_social: grafiche per social media, stories, reel
- graphic_brand: branding, loghi, materiale aziendale, packaging
${clientContext}

Input del PM: "${input}"

Rispondi ESCLUSIVAMENTE con un array JSON valido (senza markdown, senza backtick, solo JSON puro) con questa struttura:
[
  {
    "title": "titolo task chiaro e conciso",
    "description": "descrizione dettagliata di cosa fare",
    "assigned_to_role": "ruolo più adatto tra: admin, social_media_manager, content_creator, graphic_social, graphic_brand",
    "priority": "low|medium|high|urgent",
    "estimated_hours": numero_ore_stimate_o_null
  }
]

Genera task specifici, actionable. Se l'input menziona più attività, crea un task separato per ciascuna.`;

  let result: string;

  try {
    result = await callClaude(prompt);
  } catch {
    try {
      result = await callOpenAI(prompt);
    } catch {
      return NextResponse.json(
        { error: 'Errore nella generazione AI. Verifica le API key.' },
        { status: 500 }
      );
    }
  }

  try {
    // Clean potential markdown formatting
    let cleaned = result.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const parsedTasks: ParsedTask[] = JSON.parse(cleaned);

    // Map roles to actual team members
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('is_active', true);

    const roleToUserId = new Map<string, string>();
    profiles?.forEach((p) => {
      if (!roleToUserId.has(p.role)) {
        roleToUserId.set(p.role, p.id);
      }
    });

    const tasksWithAssignees = parsedTasks.map((task) => ({
      ...task,
      assigned_to: roleToUserId.get(task.assigned_to_role) || null,
    }));

    return NextResponse.json({ tasks: tasksWithAssignees });
  } catch {
    return NextResponse.json(
      { error: 'Errore nel parsing della risposta AI', raw: result },
      { status: 500 }
    );
  }
}
