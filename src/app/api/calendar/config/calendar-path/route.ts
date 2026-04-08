export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PUT(request: NextRequest) {
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

  const { calendar_path } = body;

  const { error } = await supabase
    .from('calendar_sync_config')
    .update({ calendar_path: calendar_path || null })
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Errore nel salvataggio' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
