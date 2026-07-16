/**
 * Misura le durate lato browser e le spedisce in batch a /api/perf.
 *
 * Vincoli: non deve rallentare ciò che misura (sarebbe comico), non deve mai
 * far esplodere il chiamante, e non deve fare una POST per query — quelle si
 * accumulano e partono a gruppi.
 */

export interface Timing {
  kind: 'query' | 'route' | 'page';
  name: string;
  duration_ms: number;
  route?: string | null;
  status?: number | null;
  context?: Record<string, unknown>;
}

const buffer: Timing[] = [];

/** Oltre questa soglia si spedisce subito, senza aspettare il timer. */
const FLUSH_AT = 25;
const FLUSH_EVERY_MS = 10_000;
/** Tetto di sicurezza: se la rete è giù non accumuliamo all'infinito. */
const MAX_BUFFER = 200;

let timer: ReturnType<typeof setTimeout> | null = null;
let listenersReady = false;

function send(batch: Timing[]): void {
  if (batch.length === 0) return;

  const body = JSON.stringify({ timings: batch });

  try {
    // sendBeacon sopravvive alla chiusura della pagina: senza, le misure
    // dell'ultima schermata visitata andrebbero perse proprio quando serve.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/api/perf', new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }

    void fetch('/api/perf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Le metriche non sono mai abbastanza importanti da rompere qualcosa.
  }
}

export function flushTimings(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  send(buffer.splice(0, buffer.length));
}

function ensureListeners(): void {
  if (listenersReady || typeof window === 'undefined') return;
  listenersReady = true;

  // 'pagehide' è l'unico affidabile su Safari/iOS — 'beforeunload' no.
  window.addEventListener('pagehide', flushTimings);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTimings();
  });
}

export function recordTiming(timing: Timing): void {
  if (typeof window === 'undefined') return;

  try {
    ensureListeners();

    if (buffer.length >= MAX_BUFFER) return;
    buffer.push(timing);

    if (buffer.length >= FLUSH_AT) {
      flushTimings();
      return;
    }

    if (!timer) {
      timer = setTimeout(flushTimings, FLUSH_EVERY_MS);
    }
  } catch {
    // idem
  }
}

/**
 * Trasforma l'URL PostgREST in un nome leggibile e raggruppabile.
 *   /rest/v1/tasks?select=*&status=eq.done  →  GET tasks
 *   /rest/v1/rpc/generate_deadline_alerts   →  POST rpc.generate_deadline_alerts
 *   /auth/v1/user                           →  GET auth.user
 */
export function describeSupabaseCall(
  url: string,
  method: string,
): { name: string; context: Record<string, unknown> } | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    if (path.includes('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      return { name: `${method} rpc.${fn}`, context: {} };
    }

    if (path.includes('/rest/v1/')) {
      const table = path.split('/rest/v1/')[1]?.split('/')[0];
      if (!table) return null;

      // Solo i NOMI dei filtri e la select: mai i valori, che contengono
      // email, id cliente e altri dati personali.
      const filters: string[] = [];
      let select: string | null = null;

      parsed.searchParams.forEach((value, key) => {
        if (key === 'select') select = value.slice(0, 200);
        else if (key === 'order' || key === 'limit' || key === 'offset') filters.push(key);
        else filters.push(key);
      });

      return {
        name: `${method} ${table}`,
        context: {
          select,
          filters,
          // Il segnale d'oro: una select senza limit su una tabella che cresce
          // è la ricetta esatta della pagina che si impianta.
          unbounded: !parsed.searchParams.has('limit'),
          select_all: select === '*',
        },
      };
    }

    if (path.includes('/auth/v1/')) {
      const op = path.split('/auth/v1/')[1]?.split('?')[0] || 'auth';
      return { name: `${method} auth.${op}`, context: {} };
    }

    return null;
  } catch {
    return null;
  }
}
