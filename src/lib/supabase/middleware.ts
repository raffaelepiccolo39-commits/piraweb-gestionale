import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Client di servizio riusato tra le richieste che finiscono sullo stesso
 * isolate. Prima ne veniva costruito uno nuovo per ogni singolo controllo
 * (onboarding, 2FA, ruolo): tre client per navigazione, buttati subito dopo.
 */
let serviceClientSingleton: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (!serviceClientSingleton) {
    serviceClientSingleton = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return serviceClientSingleton;
}

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
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Short-circuit /api: ogni route handler ha già il proprio createServerClient
  // e gestisce l'auth in autonomia. Far passare TUTTE le /api da getUser() qui
  // aggiunge una RPC sincrona ad auth.supabase.co per ogni chiamata interna,
  // crea race nei refresh token e occasionalmente fa scattare redirect spurious.
  if (request.nextUrl.pathname.startsWith('/api')) {
    return supabaseResponse;
  }

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
  const isOnboardingPage = request.nextUrl.pathname.startsWith('/onboarding');

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

  const path = request.nextUrl.pathname;
  const isAdminRoute = ADMIN_ROUTES.some((r) => path === r || path.startsWith(r + '/'));
  const isGuardedPage = !!user && !isAuthPage && !isApiRoute && !isPublicPage;
  const needsOnboardingGate = isGuardedPage && !isOnboardingPage;

  // L'onboarding, una volta completato, non si "s-completa" più. Il cookie ci
  // risparmia una query al DB a OGNI navigazione, per sempre. Non è un confine
  // di sicurezza — è un wizard di benvenuto — quindi un cookie è adeguato.
  const onboardingAlreadyDone = !!user && request.cookies.get('onb')?.value === user.id;

  // UNA query per entrambi i controlli (onboarding + ruolo), e solo se serve.
  // Prima erano due query separate, ognuna con un client di servizio nuovo.
  const needsProfile = !!user
    && ((needsOnboardingGate && !onboardingAlreadyDone) || (isGuardedPage && isAdminRoute));

  let profileRow: { onboarded_at: string | null; role: string | null } | null = null;

  if (needsProfile && user) {
    try {
      const { data } = await getServiceClient()
        .from('profiles')
        .select('onboarded_at, role')
        .eq('id', user.id)
        .single();
      profileRow = data as { onboarded_at: string | null; role: string | null } | null;
    } catch {
      // Fail-open: se il profilo non è leggibile non blocchiamo l'app.
    }
  }

  // Onboarding gate: chi non ha finito il wizard viene forzato su /onboarding.
  // Prima di 2FA/admin guard, perché il wizard include lo step 2FA.
  if (needsOnboardingGate && profileRow && profileRow.onboarded_at === null) {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding';
    url.search = '';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // Onboarding fatto: da ora in poi salta la query.
  if (needsOnboardingGate && user && profileRow?.onboarded_at && !onboardingAlreadyDone) {
    supabaseResponse.cookies.set('onb', user.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // 2FA check: utente autenticato che cerca di accedere alla dashboard
  if (user && !isAuthPage && !isApiRoute && !isPublicPage && !isOnboardingPage) {
    const tfaCookie = request.cookies.get('2fa_verified');
    const isTfaVerified = tfaCookie?.value === user.id;

    if (!isTfaVerified) {
      // Controlla se l'utente ha la 2FA abilitata usando service role
      try {
        const { data: totp } = await getServiceClient()
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
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
          });
          return redirectResponse;
        }
      } catch {
        // Se la tabella non esiste ancora o errore, lascia passare
      }
    }
  }

  // ── Guard URL admin-only ──
  // I non-admin che aprono una pagina admin via URL diretto finiscono su
  // /dashboard. Il ruolo è già stato letto sopra, nella query unica: qui non
  // si tocca più il database.
  if (isGuardedPage && isAdminRoute && profileRow && profileRow.role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // Redirect authenticated users away from login (solo se non stanno verificando 2FA)
  if (user && isAuthPage) {
    const isVerifying2FA = request.nextUrl.searchParams.get('verify') === '2fa';
    if (!isVerifying2FA) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
    }
  }

  // L'utente è già stato validato qui sopra con getUser(). Lo passiamo alle
  // pagine in un header, così il layout della dashboard può caricare il profilo
  // lato server senza che il browser debba rifare getUser() + fetch del profilo
  // dopo aver scaricato tutto il bundle. Sono i due giri di rete che rendevano
  // lenta ogni apertura a freddo.
  if (user) {
    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);

    const finalResponse = NextResponse.next({ request: { headers } });
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return finalResponse;
  }

  return supabaseResponse;
}
