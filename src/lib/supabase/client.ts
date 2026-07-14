import { createBrowserClient } from '@supabase/ssr';
import { recordTiming, describeSupabaseCall } from '@/lib/perf';

let client: ReturnType<typeof createBrowserClient> | null = null;

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
  });
  return client;
}
