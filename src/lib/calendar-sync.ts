import { createDAVClient } from 'tsdav';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CalDavConfig {
  id: string;
  user_id: string;
  caldav_url: string | null;
  caldav_username: string | null;
  caldav_password: string | null;
  calendar_path: string | null;
}

export interface CalDavSyncResult {
  imported: number;
  updated: number;
  deleted: number;
  total: number;
  calendar: string;
}

/**
 * Sincronizza il calendario CalDAV di UNA config (un utente) verso calendar_events.
 * Usata sia dalla route manuale (/api/calendar/sync, utente loggato) sia dal cron
 * di background (/api/cron/calendar-sync, tutti gli utenti via service role).
 *
 * Multi-utente safe: tutte le operazioni su calendar_events sono limitate a
 * created_by = config.user_id, così la sync di un utente non tocca gli eventi
 * di un altro (in particolare la cancellazione degli orfani).
 *
 * Aggiorna anche lo stato in calendar_sync_config. Rilancia in caso di errore
 * (dopo aver scritto sync_status='error'): il chiamante decide come gestirlo.
 */
export async function syncCalendarForConfig(
  supabase: SupabaseClient,
  config: CalDavConfig,
): Promise<CalDavSyncResult> {
  if (!config.caldav_username || !config.caldav_password) {
    throw new Error('Configurazione CalDAV incompleta');
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
      throw new Error('Nessun calendario trovato');
    }

    const targetCalendar = config.calendar_path
      ? calendars.find((c) => c.url === config.calendar_path) || calendars[0]
      : calendars[0];

    const objects = await client.fetchCalendarObjects({ calendar: targetCalendar });

    let imported = 0;
    let updated = 0;

    for (const obj of objects) {
      if (!obj.data) continue;

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

      // Upsert per (ical_uid, created_by): ogni utente possiede i propri eventi
      const { data: existing } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('ical_uid', uid)
        .eq('created_by', config.user_id)
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
          created_by: config.user_id,
        });
        imported++;
      }
    }

    // Cancella gli eventi orfani (rimossi dal calendario esterno) SOLO di questo utente
    const syncedUids = objects
      .map((obj) => obj.data?.match(/UID:(.*)/)?.[1]?.trim())
      .filter((u): u is string => !!u);

    let deleted = 0;
    const { data: orphanedCandidates } = await supabase
      .from('calendar_events')
      .select('id, ical_uid')
      .eq('created_by', config.user_id)
      .not('ical_uid', 'is', null);

    if (orphanedCandidates) {
      const orphanedIds = orphanedCandidates
        .filter((e: { ical_uid: string | null }) => e.ical_uid && !syncedUids.includes(e.ical_uid))
        .map((e: { id: string }) => e.id);
      if (orphanedIds.length > 0) {
        await supabase.from('calendar_events').delete().in('id', orphanedIds);
        deleted = orphanedIds.length;
      }
    }

    await supabase.from('calendar_sync_config').update({
      last_synced_at: new Date().toISOString(),
      sync_status: 'active',
      sync_error: null,
    }).eq('id', config.id);

    const calendarName = typeof targetCalendar.displayName === 'string'
      ? targetCalendar.displayName
      : (targetCalendar.url || '');

    return {
      imported,
      updated,
      deleted,
      total: objects.length,
      calendar: calendarName,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
    await supabase.from('calendar_sync_config').update({
      sync_status: 'error',
      sync_error: errorMessage,
    }).eq('id', config.id);
    throw err;
  }
}

function getItalyOffsetForDate(dateStr: string): string {
  // Offset Italia per una data specifica (gestisce CET/CEST)
  try {
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart) {
      const match = tzPart.value.match(/GMT([+-]\d+)/);
      if (match) {
        const offset = parseInt(match[1], 10);
        return `${offset >= 0 ? '+' : '-'}${String(Math.abs(offset)).padStart(2, '0')}:00`;
      }
    }
  } catch { /* fallback sotto */ }
  return '+01:00';
}

export function parseICalDate(str: string): string {
  // YYYYMMDD (all-day)
  if (str.length === 8) {
    const offset = getItalyOffsetForDate(str);
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T00:00:00${offset}`;
  }
  // Termina con Z = già UTC
  if (str.endsWith('Z')) {
    const match = str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
    }
  }
  // Senza Z = ora locale (Europe/Rome per iCloud Italia)
  const match = str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const offset = getItalyOffsetForDate(`${match[1]}${match[2]}${match[3]}`);
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${offset}`;
  }
  return str;
}
