export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Imposta la password dell'utente durante l'onboarding.
 *
 * Critico: auth.updateUser ruota i refresh token, quindi i cookie di
 * sessione cambiano. Vanno propagati esplicitamente sulla response,
 * altrimenti il browser resta coi vecchi token (invalidi) e le chiamate
 * API successive ricevono 401.
 */
export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'La password deve avere almeno 8 caratteri' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options); } catch { /* ignore */ }
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

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

  return response;
}
