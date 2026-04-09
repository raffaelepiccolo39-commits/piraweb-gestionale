export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDAVClient } from 'tsdav';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const { title, description, start_time, end_time, location, all_day, color, assigned_to } = body;

  const { data, error } = await supabase
    .from('calendar_events')
    .update({
      title,
      description: description || null,
      start_time,
      end_time,
      location: location || null,
      all_day: all_day || false,
      color: color || '#c8f55a',
      assigned_to: assigned_to || [],
    })
    .eq('id', id)
    .select('*, creator:profiles!calendar_events_created_by_fkey(id, full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ event: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { id } = await params;

  // Get event to check for ical_uid before deleting
  const { data: event } = await supabase
    .from('calendar_events')
    .select('ical_uid')
    .eq('id', id)
    .single();

  // Delete from CalDAV if synced
  if (event?.ical_uid) {
    try {
      const { data: config } = await supabase
        .from('calendar_sync_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (config?.caldav_username && config?.caldav_password) {
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

        if (targetCalendar) {
          const objects = await client.fetchCalendarObjects({ calendar: targetCalendar });
          const match = objects.find((o) => o.data?.includes(event.ical_uid!));
          if (match) {
            await client.deleteCalendarObject({ calendarObject: { url: match.url, etag: match.etag || '' } });
          }
        }
      }
    } catch {
      // CalDAV delete failed silently - still delete locally
    }
  }

  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
