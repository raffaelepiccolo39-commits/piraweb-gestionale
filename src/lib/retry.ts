/**
 * Esegue una funzione con retry e backoff esponenziale.
 *
 * - Default: 3 tentativi totali con base delay 500ms (500ms, 1000ms tra retry)
 * - Salta retry se shouldRetry ritorna false (es. errori 4xx permanenti)
 * - Restituisce il risultato del primo tentativo riuscito, oppure rilancia
 *   l'ultimo errore se tutti falliscono
 */
export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const more = attempt < attempts;
      const ok = opts.shouldRetry ? opts.shouldRetry(err, attempt) : true;
      if (!more || !ok) throw err;
      opts.onRetry?.(err, attempt);
      const delay = base * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Heuristic per decidere se un errore di invio email è transient (vale la pena
 * ritentare) o permanente (skip).
 *
 * Permanenti: EAUTH (credenziali sbagliate), EMESSAGE (contenuto invalido),
 * 5.x.x SMTP code per "user unknown" / "invalid recipient".
 * Transient: ETIMEDOUT, ECONNECTION, ESOCKET, ECONNRESET, 421/451/452, throttle.
 */
export function isTransientEmailError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return true;
  const e = err as { code?: string; responseCode?: number; message?: string };
  const permanent = ['EAUTH', 'EMESSAGE', 'EENVELOPE'];
  if (e.code && permanent.includes(e.code)) return false;
  if (typeof e.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600) {
    // 5xx SMTP = permanente
    return false;
  }
  return true;
}
