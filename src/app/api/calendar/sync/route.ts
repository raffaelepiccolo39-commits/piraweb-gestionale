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

    // Delete orphaned events (removed from iCloud but still in local DB)
    const syncedUids = objects
      .map((obj) => obj.data?.match(/UID:(.*)/)?.[1]?.trim())
      .filter((uid): uid is string => !!uid);

    if (syncedUids.length > 0) {
      const { data: orphaned } = await supabase
        .from('calendar_events')
        .select('id, ical_uid')
        .not('ical_uid', 'is', null);

      if (orphaned) {
        const orphanedIds = orphaned
          .filter((e) => !syncedUids.includes(e.ical_uid))
          .map((e) => e.id);

        if (orphanedIds.length > 0) {
          await supabase.from('calendar_events').delete().in('id', orphanedIds);
        }
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

function getItalyOffsetForDate(dateStr: string): string {
  // Determine Italy offset for a specific date (handles CET/CEST)
  try {
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart) {
      const match = tzPart.value.match(/GMT([+-]\d+)/);
      if (match) {
        const offset = parseInt(match[1], 10);
        return `${offset >= 0 ? '+' : '-'}${String(Math.abs(offset)).padStart(2, '0')}:00`;
      }
    }
  } catch { /* fallback below */ }
  return '+01:00';
}

function parseICalDate(str: string): string {
  // Handle YYYYMMDD (all-day)
  if (str.length === 8) {
    const offset = getItalyOffsetForDate(str);
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T00:00:00${offset}`;
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
    const offset = getItalyOffsetForDate(`${match[1]}${match[2]}${match[3]}`);
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${offset}`;
  }
  return str;
}
