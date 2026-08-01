import { createBrowserClient } from '@supabase/ssr';
import { recordTiming, describeSupabaseCall } from '@/lib/perf';
import { isPackagedApp } from '@/lib/api-origin';

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Dove vive la sessione dentro il pacchetto iOS/Android.
 *
 * Sul sito la sessione sta nei cookie: e' quello che serve, perche' il proxy
 * lato server li deve poter leggere a ogni richiesta. Nel pacchetto pero' le
 * pagine non stanno su https ma su `capacitor://localhost`, e su uno schema
 * inventato WebKit i cookie scritti da JavaScript non sopravvivono. Risultato
 * visto sull'app: l'accesso riesce, la navigazione porta a /dashboard, ma un
 * istante dopo la sessione non c'e' piu' — "non mi fa accedere".
 *
 * `localStorage` invece funziona senza riserve. Qui si da' a Supabase un
 * finto barattolo di cookie che scrive li' dentro: la libreria continua a
 * ragionare per cookie (compreso lo spezzettamento dei token lunghi), noi li
 * conserviamo altrove. Nel browser questa funzione non viene mai usata.
 */
const CHIAVE_SESSIONE = 'pw-sessione';

function barattoloSuLocalStorage() {
  const leggi = (): Record<string, string> => {
    try {
      return JSON.parse(window.localStorage.getItem(CHIAVE_SESSIONE) || '{}');
    } catch {
      return {};
    }
  };

  return {
    getAll: () => Object.entries(leggi()).map(([name, value]) => ({ name, value })),
    setAll: (cookies: { name: string; value: string }[]) => {
      const salvati = leggi();
      for (const { name, value } of cookies) {
        // Valore vuoto = cancellazione (e' cosi' che Supabase fa il logout).
        if (value) salvati[name] = value;
        else delete salvati[name];
      }
      try {
        window.localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(salvati));
      } catch {
        // Spazio finito o storage negato: meglio una sessione persa che un crash.
      }
    },
  };
}

/**
 * fetch strumentato: cronometra ogni chiamata che il client Supabase fa.
 *
 * Tutte le pagine della dashboard sono 'use client' e interrogano Supabase dal
 * browser, quindi questo singolo punto vede praticamente tutto il traffico dati
 * del gestionale — senza toccare una riga delle 45 pagine.
 */
const timedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();

  try {
    const response = await fetch(input, init);
    measure(input, init, started, response.status);
    return response;
  } catch (err) {
    // Anche una chiamata fallita ha impiegato tempo: spesso è un timeout, ed
    // è proprio il caso in cui l'utente dice "si è piantato".
    measure(input, init, started, 0);
    throw err;
  }
};

function measure(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  started: number,
  status: number,
): void {
  try {
    const duration = Math.round(performance.now() - started);

    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    const method = init?.method
      || (typeof input === 'object' && 'method' in input ? input.method : 'GET')
      || 'GET';

    const described = describeSupabaseCall(url, method.toUpperCase());
    if (!described) return;

    recordTiming({
      kind: 'query',
      name: described.name,
      duration_ms: duration,
      route: window.location.pathname,
      status,
      context: described.context,
    });
  } catch {
    // Misurare non deve mai rompere la chiamata misurata.
  }
}

export function createClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL and Anon Key are required.');
  }
  client = createBrowserClient(url, key, {
    global: { fetch: timedFetch },
    // Solo nel pacchetto: sul sito i cookie servono al proxy e restano cookie.
    ...(isPackagedApp() ? { cookies: barattoloSuLocalStorage() } : {}),
  });
  return client;
}
