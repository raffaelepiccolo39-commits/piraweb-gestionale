export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data } = await supabase
    .from('calendar_sync_config')
    .select('id, caldav_url, caldav_username, calendar_path, last_synced_at, sync_status, sync_error')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ config: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Check admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo gli admin possono configurare il CalDAV' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const { caldav_url, caldav_username, caldav_password, calendar_path } = body;

  // Upsert config
  const { data: existing } = await supabase
    .from('calendar_sync_config')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {
      caldav_url: caldav_url || 'https://caldav.icloud.com',
      sync_status: 'active',
      sync_error: null,
    };
    if (caldav_username) updates.caldav_username = caldav_username;
    if (caldav_password && caldav_password !== '_unchanged_') updates.caldav_password = caldav_password;
    if (calendar_path !== undefined) updates.calendar_path = calendar_path || null;
    await supabase.from('calendar_sync_config').update(updates).eq('id', existing.id);
  } else {
    if (!caldav_username || !caldav_password) {
      return NextResponse.json({ error: 'Username e password sono obbligatori' }, { status: 400 });
    }
    await supabase.from('calendar_sync_config').insert({
      user_id: user.id,
      caldav_url: caldav_url || 'https://caldav.icloud.com',
      caldav_username,
      caldav_password,
      calendar_path: calendar_path || null,
    });
  }

  return NextResponse.json({ success: true });
}
