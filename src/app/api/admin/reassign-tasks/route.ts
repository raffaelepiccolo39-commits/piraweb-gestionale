export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Check admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo gli admin possono riassegnare task' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const { from_user_id, to_user_id } = body;
  if (!from_user_id || !to_user_id) {
    return NextResponse.json({ error: 'from_user_id e to_user_id sono obbligatori' }, { status: 400 });
  }

  // Reassign all non-completed tasks
  const { data, error } = await supabase
    .from('tasks')
    .update({ assigned_to: to_user_id })
    .eq('assigned_to', from_user_id)
    .neq('status', 'done')
    .neq('status', 'archived')
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, reassigned: data?.length || 0 });
}
