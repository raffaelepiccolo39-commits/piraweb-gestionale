import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { verifyTOTPCode } from '@/lib/totp';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { code } = await request.json();

  if (!code || typeof code !== 'string' || code.length !== 6) {
    return NextResponse.json({ error: 'Inserisci un codice di 6 cifre' }, { status: 400 });
  }

  // Recupera il secret salvato durante il setup
  const serviceClient = await createServiceRoleClient();
  const { data: totp } = await serviceClient
    .from('user_totp')
    .select('secret')
    .eq('user_id', user.id)
    .single();

  if (!totp) {
    return NextResponse.json({ error: 'Nessun setup 2FA trovato. Riprova il setup.' }, { status: 400 });
  }

  // Verifica il codice
  const isValid = verifyTOTPCode(totp.secret, code);

  if (!isValid) {
    return NextResponse.json({ error: 'Codice non valido. Riprova.' }, { status: 400 });
  }

  // Abilita la 2FA
  await serviceClient
    .from('user_totp')
    .update({ enabled: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
