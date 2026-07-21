export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * Il cliente del portale sceglie la propria password.
 *
 * Serve perché l'account nasce con una password casuale che nessuno
 * conosce: senza questo passaggio l'unico modo di entrare resta il link
 * dell'invito, che scade — ed è esattamente il problema segnalato.
 *
 * CRITICO (stessa trappola di /api/onboarding/set-password): updateUser
 * ruota i refresh token, quindi i cookie di sessione cambiano. Vanno
 * propagati sulla response, altrimenti il browser resta con i token vecchi,
 * ormai invalidi, e la chiamata successiva riceve 401 — cioè l'utente
 * imposta la password e viene sbattuto fuori.
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
  if (!user) return NextResponse.json({ error: 'Sessione scaduta, richiedi un nuovo invito' }, { status: 401 });

  // Solo per chi ha davvero un accesso al portale: un dipendente qui non
  // deve poter passare (per lui c'è il flusso di onboarding).
  const serviceClient = await createServiceRoleClient();
  const { data: portalUser } = await serviceClient
    .from('client_portal_users')
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!portalUser || !portalUser.is_active) {
    return NextResponse.json({ error: 'Questo account non ha un accesso attivo al portale' }, { status: 403 });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    await logError({ error, route: 'portal/set-password', source: 'api', context: { userId: user.id } });
    return NextResponse.json({ error: 'Non è stato possibile impostare la password' }, { status: 400 });
  }

  await serviceClient
    .from('client_portal_users')
    .update({ password_set_at: new Date().toISOString() })
    .eq('id', user.id);

  return response;
}
