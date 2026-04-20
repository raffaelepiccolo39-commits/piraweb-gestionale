import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { verifyTOTPCode } from '@/lib/totp';
import { cookies } from 'next/headers';

// Verifica il codice TOTP durante il login
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

  const serviceClient = await createServiceRoleClient();
  const { data: totp } = await serviceClient
    .from('user_totp')
    .select('secret')
    .eq('user_id', user.id)
    .eq('enabled', true)
    .single();

  if (!totp) {
    return NextResponse.json({ error: '2FA non configurata' }, { status: 400 });
  }

  const isValid = verifyTOTPCode(totp.secret, code);

  if (!isValid) {
    return NextResponse.json({ error: 'Codice non valido. Riprova.' }, { status: 400 });
  }

  // Imposta cookie di verifica 2FA (httpOnly, secure, same-site)
  // Durata lunga: richiesta solo al primo accesso sul device, poi persiste finche'
  // l'utente non fa logout o cancella i cookie. Il cookie e' legato all'user_id:
  // se un altro utente fa login sullo stesso browser, la 2FA viene richiesta di nuovo.
  const cookieStore = await cookies();
  cookieStore.set('2fa_verified', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 anno
  });

  return NextResponse.json({ success: true });
}
