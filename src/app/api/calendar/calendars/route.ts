export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDAVClient } from 'tsdav';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: config } = await supabase
    .from('calendar_sync_config')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!config || !config.caldav_username || !config.caldav_password) {
    return NextResponse.json({ error: 'Configurazione CalDAV non trovata' }, { status: 400 });
  }

  try {
    const client = await createDAVClient({
      serverUrl: config.caldav_url || 'https://caldav.icloud.com',
      credentials: {
        username: config.caldav_username,
        password: config.caldav_password,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();

    return NextResponse.json({
      calendars: calendars.map((c) => ({
        url: c.url,
        displayName: c.displayName || c.url,
      })),
      selected: config.calendar_path,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
    return NextResponse.json({ error: `Errore CalDAV: ${errorMessage}` }, { status: 500 });
  }
}
