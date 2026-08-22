import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { accessoNegato, rottaRiservata } from '@/lib/rotte-admin';


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
  const isPublicPage = request.nextUrl.pathname.startsWith('/consulenza')
    || request.nextUrl.pathname.startsWith('/review')
    || request.nextUrl.pathname.startsWith('/password-dimenticata')
    // La privacy DEVE essere pubblica: Apple e Google la controllano senza
    // login, ed e' linkata dalla schermata di cancellazione account.
    || request.nextUrl.pathname.startsWith('/privacy');
  const isOnboardingPage = request.nextUrl.pathname.startsWith('/onboarding');
  // Il portale clienti è un'altra app: chi entra lì non ha un profilo del team,
  // quindi onboarding, 2FA e guardia admin non lo riguardano. Tenerlo fuori da
  // "inApp" evita anche una lettura profiles inutile a ogni sua navigazione, e
  // soprattutto lo rende indipendente dal middleware: serve per impacchettarlo
  // come app (Capacitor), dove il middleware non esiste. La guardia vera è
  // lato client (PortalGate) + le policy RLS su current_client_id().
  const isPortal = request.nextUrl.pathname.startsWith('/portale');
  // Il recupero password apre una sessione col solo scopo di cambiare la
  // password: onboarding, 2FA e guardia admin qui non c'entrano e
  // impedirebbero di completarlo (un utente con 2FA verrebbe rimbalzato al
  // login proprio mentre sta reimpostando le credenziali).
  const isRecupero = request.nextUrl.pathname.startsWith('/reimposta-password');

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

  // Contesto "app interna": utente loggato su pagina non login/api/pubblica.
  const inApp = user && !isAuthPage && !isApiRoute && !isPublicPage && !isPortal && !isRecupero;

  // Una SOLA lettura del profilo (role + onboarded_at) e un SOLO client
  // service-role, riusati sia dall'onboarding-gate sia dall'admin-guard: prima
  // erano due query profiles separate a ogni navigazione admin. La 2FA sta su
  // un'altra tabella e resta una query a parte (condizionata al cookie).
  let serviceClient: ReturnType<typeof createClient> | null = null;
  let profileRole: string | null = null;
  let onboardedAt: string | null = null;
  let profileLoaded = false;

  // Quando NON serve leggere il profilo.
  //
  // Prima si leggeva a ogni navigazione, e la lettura serve a due cose sole:
  // sapere se l'onboarding è finito, e sapere il ruolo sulle pagine
  // riservate. Su /dashboard, /tasks, /calendario la risposta è la stessa
  // per tutti — quella query era un giro di rete regalato a ogni clic, su
  // ogni pagina, per tutta la giornata di tutto il team.
  //
  // L'onboarding, una volta finito, non torna indietro: lo si ricorda in un
  // cookie. Non è una guardia di sicurezza e non deve esserlo — chi lo
  // falsificasse salterebbe una procedura guidata, non un permesso. I
  // permessi restano dove sono sempre stati: la riga qui sotto per le
  // pagine riservate (sempre fresca, mai in cache) e la RLS per i dati.
  // Il cookie porta l'id di CHI ha finito l'onboarding, non un semplice "1":
  // sullo stesso browser può entrare un'altra persona, e un valore generico
  // le farebbe saltare la procedura guidata che invece deve fare.
  const onboardingFatto = !!user && request.cookies.get('pw-onb')?.value === user.id;
  const serveIlProfilo = rottaRiservata(request.nextUrl.pathname) || !onboardingFatto;

  if (inApp && !isOnboardingPage && serveIlProfilo) {
    try {
      serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data } = await serviceClient
        .from('profiles')
        .select('role, onboarded_at')
        .eq('id', user.id)
        .single();
      const prof = data as { role: string | null; onboarded_at: string | null } | null;
      if (prof) {
        profileRole = prof.role ?? null;
        onboardedAt = prof.onboarded_at ?? null;
        profileLoaded = true;
      }
    } catch {
      // fail-open: se la lettura fallisce non blocchiamo i gate
    }
  }

  // Ricorda che l'onboarding è concluso, così alle prossime navigazioni la
  // lettura qui sopra si può saltare del tutto.
  if (profileLoaded && onboardedAt !== null && !onboardingFatto) {
    supabaseResponse.cookies.set('pw-onb', user!.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  // Onboarding gate: chi non ha completato il wizard va su /onboarding. Va
  // prima di 2FA/admin perché il wizard include lo step 2FA.
  if (profileLoaded && onboardedAt === null) {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding';
    url.search = '';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // 2FA: il gate è passato al MFA NATIVO di Supabase. La challenge avviene al
  // login (login/page.tsx eleva la sessione ad aal2) e la protezione vera è
  // nelle RLS delle tabelle sensibili, che pretendono aal2 anche via PostgREST
  // — cosa che il vecchio gate a cookie non poteva fare. Qui non serve più un
  // controllo di pagina: un utente aal1 vede il guscio, non i dati.

  // ── Guard URL delle pagine riservate ──
  // Usa il ruolo GIÀ letto sopra (nessuna seconda query). Se la lettura del
  // profilo è fallita (profileLoaded=false) restiamo fail-open come prima.
  //
  // Prima conosceva solo admin/non-admin, e le pagine riservate a un mestiere
  // restavano aperte a chiunque ne sapesse l'indirizzo: /accessi (credenziali
  // social) e /crediti (rate e insoluti) erano nascoste nel menu e basta.
  // Nascondere una voce non protegge nulla — la porta è qui.
  if (inApp) {
    const path = request.nextUrl.pathname;
    if (profileLoaded && accessoNegato(path, profileRole)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
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
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}
