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
    return NextResponse.json({ error: 'Inserisci il codice per confermare la disattivazione' }, { status: 400 });
  }

  const serviceClient = await createServiceRoleClient();
  const { data: totp } = await serviceClient
    .from('user_totp')
    .select('secret, enabled')
    .eq('user_id', user.id)
    .single();

  if (!totp || !totp.enabled) {
    return NextResponse.json({ error: '2FA non attiva' }, { status: 400 });
  }

  const isValid = verifyTOTPCode(totp.secret, code);

  if (!isValid) {
    return NextResponse.json({ error: 'Codice non valido' }, { status: 400 });
  }

  // Disabilita e rimuovi il secret
  await serviceClient
    .from('user_totp')
    .delete()
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
