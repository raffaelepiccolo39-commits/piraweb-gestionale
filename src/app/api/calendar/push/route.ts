export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDAVClient } from 'tsdav';
import { randomUUID } from 'crypto';

function toICalDate(isoStr: string, allDay: boolean): string {
  const d = new Date(isoStr);
  if (allDay) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildICalEvent(event: {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
}): string {
  const dtStartParam = event.all_day ? ';VALUE=DATE' : '';
  const dtEndParam = event.all_day ? ';VALUE=DATE' : '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PiraWeb Gestionale//IT',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTART${dtStartParam}:${toICalDate(event.start_time, event.all_day)}`,
    `DTEND${dtEndParam}:${toICalDate(event.end_time, event.all_day)}`,
    `SUMMARY:${event.title}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`);
  if (event.location) lines.push(`LOCATION:${event.location}`);
  lines.push(`DTSTAMP:${toICalDate(new Date().toISOString(), false)}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const { event_id } = body;
  if (!event_id) {
    return NextResponse.json({ error: 'event_id obbligatorio' }, { status: 400 });
  }

  // Get event
  const { data: event } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', event_id)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Evento non trovato' }, { status: 404 });
  }

  // Get CalDAV config
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
    const targetCalendar = config.calendar_path
      ? calendars.find((c) => c.url === config.calendar_path) || calendars[0]
      : calendars[0];

    if (!targetCalendar) {
      return NextResponse.json({ error: 'Nessun calendario trovato' }, { status: 404 });
    }

    // Generate UID if not present
    const uid = event.ical_uid || `${randomUUID()}@piraweb-gestionale`;

    const icalData = buildICalEvent({
      uid,
      title: event.title,
      description: event.description,
      location: event.location,
      start_time: event.start_time,
      end_time: event.end_time,
      all_day: event.all_day,
    });

    if (event.ical_uid) {
      // Update existing: build the calendarObject with the correct URL
      const objectUrl = targetCalendar.url.endsWith('/')
        ? `${targetCalendar.url}${event.ical_uid}.ics`
        : `${targetCalendar.url}/${event.ical_uid}.ics`;
      await client.updateCalendarObject({
        calendarObject: {
          url: objectUrl,
          data: icalData,
          etag: '',
        },
      });
    } else {
      await client.createCalendarObject({
        calendar: targetCalendar,
        filename: `${uid}.ics`,
        iCalString: icalData,
      });
    }

    // Update event with ical_uid
    if (!event.ical_uid) {
      await supabase
        .from('calendar_events')
        .update({ ical_uid: uid })
        .eq('id', event_id);
    }

    return NextResponse.json({ success: true, uid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return NextResponse.json({ error: `Errore CalDAV: ${msg}` }, { status: 500 });
  }
}
