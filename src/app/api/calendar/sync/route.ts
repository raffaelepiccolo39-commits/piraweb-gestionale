export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDAVClient } from 'tsdav';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Get sync config
  const { data: config } = await supabase
    .from('calendar_sync_config')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!config || !config.caldav_username || !config.caldav_password) {
    return NextResponse.json({ error: 'Configurazione CalDAV non trovata. Configura le credenziali iCloud.' }, { status: 400 });
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
    if (calendars.length === 0) {
      return NextResponse.json({ error: 'Nessun calendario trovato' }, { status: 404 });
    }

    // Use first calendar or the one specified in config
    const targetCalendar = config.calendar_path
      ? calendars.find((c) => c.url === config.calendar_path) || calendars[0]
      : calendars[0];

    const objects = await client.fetchCalendarObjects({ calendar: targetCalendar });

    let imported = 0;
    let updated = 0;

    for (const obj of objects) {
      if (!obj.data) continue;

      // Parse basic iCal data
      const summary = obj.data.match(/SUMMARY:(.*)/)?.[1]?.trim() || 'Evento senza titolo';
      const dtstart = obj.data.match(/DTSTART[^:]*:(.*)/)?.[1]?.trim();
      const dtend = obj.data.match(/DTEND[^:]*:(.*)/)?.[1]?.trim();
      const description = obj.data.match(/DESCRIPTION:(.*)/)?.[1]?.trim() || null;
      const location = obj.data.match(/LOCATION:(.*)/)?.[1]?.trim() || null;
      const uid = obj.data.match(/UID:(.*)/)?.[1]?.trim();

      if (!dtstart || !uid) continue;

      const startTime = parseICalDate(dtstart);
      const endTime = dtend ? parseICalDate(dtend) : startTime;
      const allDay = dtstart.length === 8;

      // Upsert by ical_uid
      const { data: existing } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('ical_uid', uid)
        .maybeSingle();

      if (existing) {
        await supabase.from('calendar_events').update({
          title: summary,
          description,
          start_time: startTime,
          end_time: endTime,
          location,
          all_day: allDay,
        }).eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('calendar_events').insert({
          title: summary,
          description,
          start_time: startTime,
          end_time: endTime,
          location,
          all_day: allDay,
          ical_uid: uid,
          created_by: user.id,
        });
        imported++;
      }
    }

    // Update sync status
    await supabase.from('calendar_sync_config').update({
      last_synced_at: new Date().toISOString(),
      sync_status: 'active',
      sync_error: null,
    }).eq('id', config.id);

    return NextResponse.json({
      success: true,
      imported,
      updated,
      total: objects.length,
      calendar: targetCalendar.displayName || targetCalendar.url,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';

    await supabase.from('calendar_sync_config').update({
      sync_status: 'error',
      sync_error: errorMessage,
    }).eq('id', config.id);

    return NextResponse.json({ error: `Errore CalDAV: ${errorMessage}` }, { status: 500 });
  }
}

function parseICalDate(str: string): string {
  // Handle YYYYMMDD (all-day)
  if (str.length === 8) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T00:00:00+02:00`;
  }

  // If it ends with Z, it's already UTC - keep as-is
  if (str.endsWith('Z')) {
    const match = str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
    }
  }

  // No Z = local time (Europe/Rome for iCloud Italy)
  const match = str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+02:00`;
  }
  return str;
}
