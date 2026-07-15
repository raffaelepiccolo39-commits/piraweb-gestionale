/**
 * Invio errori dal browser a /api/logs.
 *
 * Regole: non deve mai far esplodere il chiamante, e non deve mai mostrare
 * nulla all'utente. Se il reporting fallisce, pazienza — l'utente ha già un
 * problema suo, non gliene aggiungiamo un secondo.
 */

interface ReportPayload {
  message: string;
  stack?: string | null;
  route?: string | null;
  source?: 'client' | 'boundary';
  context?: Record<string, unknown>;
}

/**
 * Evita di rimandare lo stesso errore in loop: un componente che crasha a
 * ripetizione genererebbe centinaia di righe identiche.
 */
const recentlySent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

function alreadySent(key: string): boolean {
  const now = Date.now();

  for (const [k, at] of recentlySent) {
    if (now - at > DEDUPE_WINDOW_MS) recentlySent.delete(k);
  }

  if (recentlySent.has(key)) return true;
  recentlySent.set(key, now);
  return false;
}

export function reportError(payload: ReportPayload): void {
  if (typeof window === 'undefined') return;

  try {
    const route = payload.route ?? window.location.pathname;
    const key = `${payload.source ?? 'client'}|${route}|${payload.message}`;
    if (alreadySent(key)) return;

    const body = JSON.stringify({
      message: payload.message,
      stack: payload.stack ?? null,
      route,
      source: payload.source ?? 'client',
      context: payload.context ?? {},
      buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    });

    void fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true, // sopravvive se l'utente cambia pagina subito dopo il crash
    }).catch(() => {
      // Silenzio voluto: il reporting non deve generare altri errori.
    });
  } catch {
    // Idem.
  }
}

/**
 * Errore Supabase (o PostgREST) inghiottito: lo manda al log SENZA cambiare la
 * UX. Da usare accanto al toast esistente, dove prima `error` finiva ignorato.
 *
 * ```ts
 * const { error } = await supabase.from('tasks').update(...);
 * if (error) { reportSupabaseError(error, 'aggiorna-task', { taskId }); toast.error('...'); return; }
 * ```
 */
export function reportSupabaseError(
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  op: string,
  context?: Record<string, unknown>,
): void {
  if (!error) return;
  reportError({
    message: `${op}: ${error.message ?? 'errore sconosciuto'}`,
    context: { op, code: error.code, details: error.details, hint: error.hint, ...context },
  });
}

/** Normalizza qualunque cosa arrivi da un handler globale. */
export function reportUnknown(
  error: unknown,
  source: 'client' | 'boundary' = 'client',
  context?: Record<string, unknown>,
): void {
  if (error instanceof Error) {
    reportError({
      message: error.message || error.name,
      stack: error.stack ?? null,
      source,
      context,
    });
    return;
  }

  let message: string;
  if (typeof error === 'string') {
    message = error;
  } else {
    try {
      message = JSON.stringify(error).slice(0, 500);
    } catch {
      message = String(error);
    }
  }

  reportError({ message, source, context });
}
