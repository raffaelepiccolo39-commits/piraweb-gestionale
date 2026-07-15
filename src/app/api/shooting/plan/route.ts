export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SHOOTING_STEPS, offsetDate } from '@/lib/shooting-workflow';
import { logError } from '@/lib/logger';

interface ProposedTask {
  step_key: string;
  title: string;
  description: string;
  role: string;
  assigned_to: string | null;
  assignee_name: string | null;
  extra_assignees: { id: string; name: string }[];
  deadline: string;
  estimated_hours: number;
  priority: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Riservato agli amministratori' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }
  const { mode, calendar_event_id, tasks } = body ?? {};
  if (!calendar_event_id) {
    return NextResponse.json({ error: 'calendar_event_id obbligatorio' }, { status: 400 });
  }

  // L'evento è la fonte di verità per cliente e data di shooting.
  const { data: event, error: evErr } = await supabase
    .from('calendar_events')
    .select('id, client_id, start_time, event_type')
    .eq('id', calendar_event_id)
    .single();
  if (evErr || !event) {
    await logError({ error: evErr, route: '/api/shooting/plan', source: 'api', context: { op: 'shooting-plan-event-lookup' } });
    return NextResponse.json({ error: 'Evento non trovato' }, { status: 404 });
  }
  if (event.event_type !== 'shooting' || !event.client_id) {
    return NextResponse.json({ error: 'L\'evento non è uno shooting collegato a un cliente' }, { status: 400 });
  }

  // Task già generati per questo shooting (evita duplicati).
  const { data: existing } = await supabase
    .from('shooting_workflow_tasks')
    .select('id')
    .eq('calendar_event_id', calendar_event_id)
    .limit(1);
  const alreadyGenerated = (existing?.length ?? 0) > 0;

  // ── Anteprima ──
  if (mode === 'preview') {
    if (alreadyGenerated) {
      return NextResponse.json({ already_generated: true, tasks: [] });
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');
    const byRole = new Map<string, { id: string; full_name: string }>();
    for (const p of profiles ?? []) {
      if (!byRole.has(p.role)) byRole.set(p.role, { id: p.id, full_name: p.full_name });
    }

    const proposed: ProposedTask[] = [];
    for (const step of SHOOTING_STEPS) {
      const assignee = byRole.get(step.role) ?? null;
      const extra = (step.extraRoles ?? [])
        .map((r) => byRole.get(r))
        .filter((p): p is { id: string; full_name: string } => !!p && p.id !== assignee?.id)
        .map((p) => ({ id: p.id, name: p.full_name }));
      const { data: learned } = await supabase.rpc('shooting_learned_hours', {
        p_step_key: step.key,
        p_client_id: event.client_id,
        p_default: step.defaultHours,
      });
      proposed.push({
        step_key: step.key,
        title: step.title,
        description: step.description,
        role: step.role,
        assigned_to: assignee?.id ?? null,
        assignee_name: assignee?.full_name ?? null,
        extra_assignees: extra,
        deadline: offsetDate(event.start_time, step.offsetDays),
        estimated_hours: Number(learned) || step.defaultHours,
        priority: step.priority,
      });
    }
    return NextResponse.json({ already_generated: false, tasks: proposed });
  }

  // ── Conferma: crea i task ──
  if (mode === 'confirm') {
    if (alreadyGenerated) {
      return NextResponse.json({ error: 'I task per questo shooting sono già stati generati.' }, { status: 409 });
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'Nessun task da creare' }, { status: 400 });
    }

    // Progetto del cliente (creato al volo se manca).
    const { data: projectId, error: projErr } = await supabase.rpc('get_or_create_client_project', {
      p_client_id: event.client_id,
      p_created_by: user.id,
    });
    if (projErr || !projectId) {
      await logError({ error: projErr, route: '/api/shooting/plan', source: 'api', context: { op: 'shooting-plan-project' } });
      return NextResponse.json({ error: 'Impossibile risolvere il progetto del cliente' }, { status: 500 });
    }

    let created = 0;
    for (const t of tasks) {
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          title: t.title,
          description: t.description || null,
          project_id: projectId,
          assigned_to: t.assigned_to || null,
          priority: t.priority || 'medium',
          status: 'todo',
          deadline: t.deadline || null,
          estimated_hours: t.estimated_hours || null,
          ai_generated: true,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (taskErr || !task) continue;

      // Task condiviso: imposta l'elenco completo di assegnatari (principale + extra).
      const extraIds: string[] = Array.isArray(t.extra_assignees)
        ? t.extra_assignees.map((x: { id?: string } | string) => (typeof x === 'string' ? x : x?.id)).filter(Boolean)
        : [];
      if (extraIds.length && t.assigned_to) {
        const ids = Array.from(new Set([t.assigned_to, ...extraIds]));
        await supabase.rpc('set_task_assignees', { p_task_id: task.id, p_user_ids: ids });
      }

      await supabase.from('shooting_workflow_tasks').insert({
        calendar_event_id,
        client_id: event.client_id,
        step_key: t.step_key,
        task_id: task.id,
      });
      created += 1;
    }

    return NextResponse.json({ created });
  }

  return NextResponse.json({ error: 'mode non valido (preview|confirm)' }, { status: 400 });
}
