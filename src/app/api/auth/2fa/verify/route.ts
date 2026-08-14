import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { verifyTOTPCode } from '@/lib/totp';
import { firmaProvaTfa, TFA_TTL_SEC } from '@/lib/tfa-cookie';
import { checkRateLimit } from '@/lib/rate-limit';
import { cookies } from 'next/headers';

// Verifica il codice TOTP durante il login
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // Freno ai tentativi: senza, un codice a 6 cifre e' provabile a tappeto.
  // Per utente (e' gia' autenticato con la password), 5 tentativi ogni 15 min.
  // Nota: il contatore e' in memoria e per-istanza su Vercel, quindi e' un
  // rallentamento, non un muro — ma alza di molto l'asticella del brute-force.
  const limite = checkRateLimit(`2fa-verify:${user.id}`, { maxRequests: 5, windowSeconds: 900 });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova tra qualche minuto.' },
      { status: 429 },
    );
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

  // Cookie di verifica 2FA: valore FIRMATO dal server (exp.hmac), non piu'
  // l'user.id in chiaro. Falsificarlo richiede la chiave segreta, e scade in
  // ~24h invece di un anno. Se un altro utente fa login sullo stesso browser,
  // la firma non combacia col suo id e la 2FA viene richiesta di nuovo.
  const cookieStore = await cookies();
  cookieStore.set('2fa_verified', await firmaProvaTfa(user.id, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: TFA_TTL_SEC,
  });

  return NextResponse.json({ success: true });
}
