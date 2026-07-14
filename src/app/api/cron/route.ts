export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * Cron endpoint to run scheduled tasks:
 * - Generate recurring tasks
 * - Generate deadline alerts
 *
 * Call this via Vercel Cron or external scheduler every hour:
 * POST /api/cron with Authorization: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();

  const results: Record<string, unknown> = {};

  // 1. Generate recurring tasks
  try {
    const { data: recurringCount, error: rpcError } = await supabase.rpc('generate_recurring_tasks');
    // supabase.rpc non lancia: senza questo check un fallimento passava per
    // "0 elementi elaborati" e il cron rispondeva success: true.
    if (rpcError) throw new Error(`generate_recurring_tasks: ${rpcError.message}`);
    results.recurring_tasks_generated = recurringCount ?? 0;
  } catch (err) {
    await logError({ error: err, route: 'cron', source: 'cron', context: { stage: 'recurring_tasks' } });
    await logError({ error: err, route: 'cron:recurring_tasks', source: 'cron' });
    results.recurring_tasks_error = err instanceof Error ? err.message : 'unknown';
  }

  // 2. Generate deadline alerts
  try {
    const { data: alertCount, error: rpcError } = await supabase.rpc('generate_deadline_alerts');
    // supabase.rpc non lancia: senza questo check un fallimento passava per
    // "0 elementi elaborati" e il cron rispondeva success: true.
    if (rpcError) throw new Error(`generate_deadline_alerts: ${rpcError.message}`);
    results.deadline_alerts_generated = alertCount ?? 0;
  } catch (err) {
    await logError({ error: err, route: 'cron', source: 'cron', context: { stage: 'deadline_alerts' } });
    await logError({ error: err, route: 'cron:deadline_alerts', source: 'cron' });
    results.deadline_alerts_error = err instanceof Error ? err.message : 'unknown';
  }

  // 3. Auto-archive done tasks older than 7 days
  try {
    const { data: archivedCount, error: rpcError } = await supabase.rpc('archive_done_tasks');
    // supabase.rpc non lancia: senza questo check un fallimento passava per
    // "0 elementi elaborati" e il cron rispondeva success: true.
    if (rpcError) throw new Error(`archive_done_tasks: ${rpcError.message}`);
    results.tasks_archived = archivedCount ?? 0;
  } catch (err) {
    await logError({ error: err, route: 'cron', source: 'cron', context: { stage: 'archive_done' } });
    await logError({ error: err, route: 'cron:archive_done', source: 'cron' });
    results.tasks_archived_error = err instanceof Error ? err.message : 'unknown';
  }

  // 4. Chiude i timer lasciati aperti (anti-runaway, cap 8h)
  try {
    const { data: closedCount, error: rpcError } = await supabase.rpc('close_stale_time_entries');
    // supabase.rpc non lancia: senza questo check un fallimento passava per
    // "0 elementi elaborati" e il cron rispondeva success: true.
    if (rpcError) throw new Error(`close_stale_time_entries: ${rpcError.message}`);
    results.stale_timers_closed = closedCount ?? 0;
  } catch (err) {
    await logError({ error: err, route: 'cron', source: 'cron', context: { stage: 'close_stale_timers' } });
    await logError({ error: err, route: 'cron:close_stale_timers', source: 'cron' });
    results.stale_timers_error = err instanceof Error ? err.message : 'unknown';
  }

  // 5. Retention log errori: tiene 60 giorni, la tabella non deve gonfiarsi.
  try {
    const { data: purgedCount, error: rpcError } = await supabase.rpc('purge_old_error_logs');
    if (rpcError) throw new Error(`purge_old_error_logs: ${rpcError.message}`);
    results.error_logs_purged = purgedCount ?? 0;
  } catch (err) {
    await logError({ error: err, route: 'cron:purge_error_logs', source: 'cron' });
    results.error_logs_purge_error = err instanceof Error ? err.message : 'unknown';
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...results,
  });
}
