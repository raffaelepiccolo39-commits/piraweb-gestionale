export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/require-admin';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  let query = supabase
    .from('calendar_events')
    .select('*, creator:profiles!calendar_events_created_by_fkey(id, full_name)')
    .order('start_time', { ascending: true });

  if (start) query = query.gte('start_time', start);
  if (end) query = query.lte('start_time', end);

  const { data, error } = await query;
  if (error) {
    await logError({ error, route: '/api/calendar/events', source: 'api', context: { op: 'calendar-events-list' } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Il calendario è interno. La policy INSERT chiede solo
  // created_by = auth.uid(), condizione che QUALUNQUE autenticato soddisfa
  // sulle proprie righe: da sola non distingue un dipendente da un cliente
  // del portale, che potrebbe creare impegni finti e assegnarli al team.
  // La policy è stata corretta con la 20260720f; questo è il secondo strato.
  if (!(await isStaff(supabase, user.id))) {
    return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const { title, description, start_time, end_time, location, all_day, color, assigned_to, client_id, event_type } = body;

  if (!title || !start_time || !end_time) {
    return NextResponse.json({ error: 'Titolo, data inizio e fine sono obbligatori' }, { status: 400 });
  }

  // Validazione color: solo formato esadecimale #RRGGBB o #RGB
  const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  const safeColor = typeof color === 'string' && HEX_COLOR_REGEX.test(color) ? color : '#FFD108';
  const safeType = event_type === 'shooting' ? 'shooting' : 'general';

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title,
      description: description || null,
      start_time,
      end_time,
      location: location || null,
      all_day: all_day || false,
      color: safeColor,
      assigned_to: assigned_to || [],
      client_id: client_id || null,
      event_type: safeType,
      created_by: user.id,
    })
    .select('*, creator:profiles!calendar_events_created_by_fkey(id, full_name)')
    .single();

  if (error) {
    await logError({ error, route: '/api/calendar/events', source: 'api', context: { op: 'calendar-event-create' } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event: data });
}
