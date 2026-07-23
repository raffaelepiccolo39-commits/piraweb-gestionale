export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

/**
 * Conferma magic link / invite / recovery / signup generati lato admin via
 * auth.admin.generateLink → properties.hashed_token.
 *
 * URL atteso: /api/auth/confirm?token_hash=XXX&type=magiclink&next=/onboarding
 *
 * Critico: i cookie di sessione vanno scritti ESPLICITAMENTE sulla redirect
 * response, perché il cookieStore di next/headers in un route handler non
 * propaga automaticamente i cookie a una redirect creata in seguito.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  let next = url.searchParams.get('next') ?? '/dashboard';
  if (!next.startsWith('/') || next.startsWith('//')) {
    next = '/dashboard';
  }

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', url));
  }

  const response = NextResponse.redirect(new URL(next, url));
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

  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    // Un link scaduto o già usato è comportamento normale dell'utente, non un
    // guasto del sistema: NON lo registriamo affatto, così /log resta pulita e
    // mostra solo le cose davvero rotte. Al login mandiamo un codice stabile
    // (link_expired) invece del messaggio grezzo di Supabase, che è in inglese.
    // Registriamo solo gli errori di verifica reali (non scadenza/riuso link).
    const isExpiredLink = error.status === 401 || error.status === 403 || /expired|invalid/i.test(error.message);

    if (!isExpiredLink) {
      await logError({
        error,
        route: '/api/auth/confirm',
        source: 'api',
        level: 'error',
        context: { op: 'confirm', type },
      });
    }

    const reason = isExpiredLink ? 'link_expired' : encodeURIComponent(error.message);
    return NextResponse.redirect(new URL(`/login?error=${reason}`, url));
  }

  return response;
}
