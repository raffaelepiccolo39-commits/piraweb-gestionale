import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Controlla se l'utente CORRENTE (dalla sessione, non da body) ha la 2FA attiva.
// Chiamato durante il login subito dopo signInWithPassword: a quel punto la
// sessione è già valida e prendiamo il userId da lì, non dal client.
// Senza questo check, l'endpoint era un info disclosure: chiunque poteva
// chiedere "questo userId ha 2FA?" enumerando UUID.
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() { /* read-only */ },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }

  const serviceClient = await createServiceRoleClient();
  const { data: totp } = await serviceClient
    .from('user_totp')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('enabled', true)
    .maybeSingle();

  return NextResponse.json({ enabled: !!totp });
}
