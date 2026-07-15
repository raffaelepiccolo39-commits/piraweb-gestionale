export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncCalendarForConfig } from '@/lib/calendar-sync';
import { logError } from '@/lib/logger';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: config } = await supabase
    .from('calendar_sync_config')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!config || !config.caldav_username || !config.caldav_password) {
    return NextResponse.json({ error: 'Configurazione CalDAV non trovata. Configura le credenziali iCloud.' }, { status: 400 });
  }

  try {
    const result = await syncCalendarForConfig(supabase, config);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    await logError({ error: err, route: '/api/calendar/sync', source: 'api', context: { op: 'calendar-sync' } });
    const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
    return NextResponse.json({ error: `Errore CalDAV: ${errorMessage}` }, { status: 500 });
  }
}
