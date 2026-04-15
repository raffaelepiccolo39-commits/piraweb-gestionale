export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

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
    const { data: recurringCount } = await supabase.rpc('generate_recurring_tasks');
    results.recurring_tasks_generated = recurringCount ?? 0;
  } catch (err) {
    results.recurring_tasks_error = err instanceof Error ? err.message : 'unknown';
  }

  // 2. Generate deadline alerts
  try {
    const { data: alertCount } = await supabase.rpc('generate_deadline_alerts');
    results.deadline_alerts_generated = alertCount ?? 0;
  } catch (err) {
    results.deadline_alerts_error = err instanceof Error ? err.message : 'unknown';
  }

  // 3. Auto-archive done tasks older than 7 days
  try {
    const { data: archivedCount } = await supabase.rpc('archive_done_tasks');
    results.tasks_archived = archivedCount ?? 0;
  } catch (err) {
    results.tasks_archived_error = err instanceof Error ? err.message : 'unknown';
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...results,
  });
}
