export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { password } = await request.json();

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'La password deve avere almeno 8 caratteri' }, { status: 400 });
  }

  // Usiamo updateUser sulla sessione corrente (NON admin.updateUserById) per
  // evitare che Supabase invalidi la sessione attiva, cosa che farebbe perdere
  // l'auth durante il wizard e bloccherebbe lo step 2FA successivo.
  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) {
    return NextResponse.json({ error: `Errore aggiornamento password: ${pwError.message}` }, { status: 400 });
  }

  const service = await createServiceRoleClient();
  const { error: profError } = await service
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id);
  if (profError) {
    return NextResponse.json({ error: `Password aggiornata ma errore profilo: ${profError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
