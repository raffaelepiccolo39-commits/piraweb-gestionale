import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

// Pagine accessibili SOLO agli admin. I non-admin che provano questi URL
// vengono rimbalzati su /dashboard dal middleware.
const ADMIN_ROUTES: readonly string[] = [
  '/cashflow',
  '/crm',
  '/cfo',
  '/direzione',
  '/profitability',
  '/lead-finder',
  '/lead-ai',
  '/market-research',
  '/ai-content',
  '/freelancers',
  '/invoices',
  '/capacity',
  '/automations',
  '/analytics',
  '/gestione',
  '/settings',
  '/note-dev',
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isCallbackRoute = request.nextUrl.pathname.startsWith('/api/auth/callback');
  const isPublicPage = request.nextUrl.pathname.startsWith('/consulenza') || request.nextUrl.pathname.startsWith('/review');

  // Allow callback route
  if (isCallbackRoute) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login (except public pages)
  if (!user && !isAuthPage && !isApiRoute && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // CRITICO: copia i cookie CON LE LORO OPTIONS (httpOnly/secure/sameSite/
    // maxAge). Senza, il browser non riconosce i cookie auth refreshati da
    // Supabase e la sessione si invalida alla request successiva → kick a
    // /login a ogni navigazione. Vedi docs ufficiali Supabase SSR.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // 2FA check: utente autenticato che cerca di accedere alla dashboard
  if (user && !isAuthPage && !isApiRoute && !isPublicPage) {
    const tfaCookie = request.cookies.get('2fa_verified');
    const isTfaVerified = tfaCookie?.value === user.id;

    if (!isTfaVerified) {
      // Controlla se l'utente ha la 2FA abilitata usando service role
      try {
        const serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: totp } = await serviceClient
          .from('user_totp')
          .select('enabled')
          .eq('user_id', user.id)
          .eq('enabled', true)
          .single();

        if (totp) {
          // 2FA abilitata ma non verificata → redirect a login con parametro verify
          const url = request.nextUrl.clone();
          const originalPath = request.nextUrl.pathname + request.nextUrl.search;
          url.pathname = '/login';
          url.search = '';
          url.searchParams.set('verify', '2fa');
          if (originalPath && originalPath !== '/' && !originalPath.startsWith('/dashboard')) {
            url.searchParams.set('redirect', originalPath);
          }
          const redirectResponse = NextResponse.redirect(url);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value);
          });
          return redirectResponse;
        }
      } catch {
        // Se la tabella non esiste ancora o errore, lascia passare
      }
    }
  }

  // ── Guard URL admin-only ──
  // I non-admin che provano ad aprire una pagina admin via URL diretto
  // vengono rimbalzati su /dashboard. Eseguito solo se la rotta è davvero
  // admin (evita una query profiles inutile su ogni navigazione).
  if (user && !isAuthPage && !isApiRoute && !isPublicPage) {
    const path = request.nextUrl.pathname;
    const isAdminRoute = ADMIN_ROUTES.some(
      (r) => path === r || path.startsWith(r + '/')
    );
    if (isAdminRoute) {
      try {
        const serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: profileRow } = await serviceClient
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profileRow?.role !== 'admin') {
          const url = request.nextUrl.clone();
          url.pathname = '/dashboard';
          url.search = '';
          const redirectResponse = NextResponse.redirect(url);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value);
          });
          return redirectResponse;
        }
      } catch {
        // Se il profilo non è recuperabile non blocchiamo, log lato server
      }
    }
  }

  // Redirect authenticated users away from login (solo se non stanno verificando 2FA)
  if (user && isAuthPage) {
    const isVerifying2FA = request.nextUrl.searchParams.get('verify') === '2fa';
    if (!isVerifying2FA) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}
