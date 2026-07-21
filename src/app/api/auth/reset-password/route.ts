export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * Salva la nuova password dopo aver seguito il link di recupero.
 *
 * Vale per il team e per i clienti del portale: chi arriva qui ha già una
 * sessione aperta dal link (type=recovery, validato da /api/auth/confirm),
 * quindi l'autorizzazione è la sessione stessa.
 *
 * CRITICO: updateUser ruota i refresh token. I cookie nuovi vanno propagati
 * sulla response, altrimenti il browser resta con quelli vecchi — ormai
 * invalidi — e l'utente si ritrova sloggato subito dopo aver reimpostato
 * la password. È la trappola che ha causato il blackout di luglio.
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
        getAll() { return cookieStore.getAll(); },
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
    return NextResponse.json(
      { error: 'Il link è scaduto o è già stato usato. Richiedine uno nuovo.' },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    await logError({ error, route: 'auth/reset-password', source: 'api', context: { userId: user.id } });
    return NextResponse.json({ error: 'Non è stato possibile salvare la password' }, { status: 400 });
  }

  // Aggiorna il segnaposto giusto a seconda di chi è: il team ha
  // profiles.must_change_password, i clienti client_portal_users.password_set_at.
  // Nessuno dei due è obbligatorio, quindi si tenta e basta.
  const serviceClient = await createServiceRoleClient();
  await serviceClient.from('profiles').update({ must_change_password: false }).eq('id', user.id);
  await serviceClient
    .from('client_portal_users')
    .update({ password_set_at: new Date().toISOString() })
    .eq('id', user.id);

  return response;
}
