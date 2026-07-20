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
  // Fallimenti di rete transitori (fetch annullata, offline): non sono bug,
  // niente rumore nel log. Gli errori DB veri hanno un `code` e passano.
  if (!error.code && isBenignTransientError(error)) return;
  reportError({
    message: `${op}: ${error.message ?? 'errore sconosciuto'}`,
    context: { op, code: error.code, details: error.details, hint: error.hint, ...context },
  });
}

/**
 * Riconosce un "chunk load error": il browser prova a caricare un pezzo di JS
 * che non esiste più sul server. Quasi sempre è una scheda rimasta aperta con
 * un build vecchio dopo un deploy — non un bug del codice. Predicato puro,
 * senza effetti collaterali (serve anche a scegliere il messaggio da mostrare).
 */
export function isLikelyChunkError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? (error.message || '') : String(error ?? '');
  return (
    name === 'ChunkLoadError' ||
    /loading chunk [\w-]+ failed|failed to load chunk|error loading dynamically imported module|importing a module script failed/i.test(message)
  );
}

/**
 * Se l'errore è un chunk mancante da deploy, ricarica la pagina una volta per
 * prendere il build nuovo, e ritorna true (il chiamante deve saltare il log e
 * la schermata di crash). Guardia anti-loop in sessionStorage: se ricapita
 * subito dopo un reload, lascia che l'errore segua il flusso normale — a quel
 * punto è un problema vero, non una scheda stale.
 */
export function recoverFromChunkError(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (!isLikelyChunkError(error)) return false;

  try {
    const KEY = 'pw-chunk-reload-at';
    const last = Number(sessionStorage.getItem(KEY) || '0');
    if (Date.now() - last < 20_000) return false; // già ricaricato da poco: non insistere
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/**
 * Riconosce un errore transitorio/benigno che NON è un bug del codice e non va
 * a finire nel log: (1) l'AbortError del lock di sessione di Supabase — "Lock
 * broken by another request with the 'steal' option", normale quando due
 * richieste auth si accavallano (cambio scheda, refresh); (2) i fallimenti di
 * rete a basso livello ("Load failed" su Safari, "Failed to fetch" su Chrome,
 * "NetworkError" su Firefox), tipici di una fetch annullata perché l'utente ha
 * lasciato la pagina mentre caricava. Predicato puro. Gli errori DB veri
 * arrivano con un `code` Postgres e passano comunque il filtro.
 */
export function isBenignTransientError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  let message = '';
  if (error instanceof Error) message = error.message || '';
  else if (typeof error === 'string') message = error;
  else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as { message?: unknown }).message ?? '');
  }
  return (
    name === 'AbortError' ||
    /lock broken by another request|the 'steal' option/i.test(message) ||
    /load failed|failed to fetch|networkerror|network request failed/i.test(message)
  );
}

/** Normalizza qualunque cosa arrivi da un handler globale. */
export function reportUnknown(
  error: unknown,
  source: 'client' | 'boundary' = 'client',
  context?: Record<string, unknown>,
): void {
  // Lock 'steal' di Supabase e fallimenti di rete transitori: benigni, fuori dal log.
  if (isBenignTransientError(error)) return;
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
