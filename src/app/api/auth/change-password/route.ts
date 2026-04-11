export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

  const { current_password, new_password } = body;

  if (!current_password) {
    return NextResponse.json({ error: 'La password attuale è obbligatoria' }, { status: 400 });
  }

  if (!new_password || new_password.length < 8) {
    return NextResponse.json({ error: 'La nuova password deve avere almeno 8 caratteri' }, { status: 400 });
  }

  // Verify current password by re-authenticating
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: current_password,
  });

  if (authError) {
    return NextResponse.json({ error: 'Password attuale non corretta' }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
