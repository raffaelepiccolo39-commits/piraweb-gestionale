export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { syncCalendarForConfig, type CalDavConfig } from '@/lib/calendar-sync';

/**
 * Cron di background: sincronizza il calendario CalDAV di TUTTI gli utenti che
 * hanno una config valida. Senza questo, la sync avviene solo manualmente o
 * all'apertura della pagina calendario. Schedulato in vercel.json.
 *
 * Auth: Authorization: Bearer CRON_SECRET (Vercel Cron lo invia in automatico).
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();

  const { data: configs } = await supabase
    .from('calendar_sync_config')
    .select('id, user_id, caldav_url, caldav_username, caldav_password, calendar_path')
    .not('caldav_username', 'is', null)
    .not('caldav_password', 'is', null);

  let synced = 0;
  let imported = 0;
  let updated = 0;
  let deleted = 0;
  let failed = 0;

  for (const config of (configs as CalDavConfig[]) || []) {
    try {
      const r = await syncCalendarForConfig(supabase, config);
      synced++;
      imported += r.imported;
      updated += r.updated;
      deleted += r.deleted;
    } catch (err) {
      // Un fallimento di un utente non deve bloccare gli altri. Lo stato d'errore
      // è già scritto su calendar_sync_config dalla funzione condivisa.
      failed++;
      Sentry.captureException(err, {
        tags: { route: 'cron/calendar-sync', stage: 'sync_user' },
        extra: { userId: config.user_id },
      });
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    configs: (configs || []).length,
    synced,
    failed,
    imported,
    updated,
    deleted,
  });
}
