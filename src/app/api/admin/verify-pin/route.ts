import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PIN_COOKIE_NAME = 'admin_pin_verified';
const PIN_COOKIE_MAX_AGE = 60 * 60 * 8; // 8 ore (giornata lavorativa)

// GET: controlla se la verifica PIN e' ancora valida per l'utente corrente
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  const pinCookie = cookieStore.get(PIN_COOKIE_NAME);
  const valid = pinCookie?.value === user.id;

  return NextResponse.json({ valid });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  const { pin } = await request.json();

  if (!pin || typeof pin !== 'string' || pin.length !== 6) {
    return NextResponse.json({ error: 'PIN non valido' }, { status: 400 });
  }

  const pinHash = createHash('sha256').update(pin).digest('hex');
  const storedHash = process.env.ADMIN_SECURITY_PIN_HASH;

  if (!storedHash) {
    return NextResponse.json({ error: 'PIN non configurato' }, { status: 500 });
  }

  if (pinHash !== storedHash) {
    return NextResponse.json({ valid: false, error: 'Codice errato' }, { status: 401 });
  }

  // Persisti la verifica in un cookie httpOnly legato all'user.id:
  // l'utente non si vede piu' richiedere il PIN finche' il cookie non scade.
  const cookieStore = await cookies();
  cookieStore.set(PIN_COOKIE_NAME, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PIN_COOKIE_MAX_AGE,
  });

  return NextResponse.json({ valid: true });
}
