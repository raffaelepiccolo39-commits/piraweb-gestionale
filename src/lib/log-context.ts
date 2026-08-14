/**
 * Mette un tetto al campo `context` che browser e app allegano ai log
 * diagnostici (/api/perf, /api/logs).
 *
 * Quei campi finiscono in perf_logs/error_logs via service role (RLS
 * scavalcata) e venivano scritti verbatim, senza limite di dimensione: un
 * utente autenticato — cliente del portale compreso — poteva gonfiarli per
 * riempire la tabella e seppellire le metriche vere. Il rate limit frena il
 * NUMERO di richieste; questo frena la DIMENSIONE di ciascuna.
 *
 * Non e' un confine di sicurezza forte (chi chiama e' comunque autenticato):
 * e' un limite d'abuso, quindi la soglia e' volutamente generosa — un context
 * legittimo sta in poche centinaia di byte.
 */

const MAX_CONTEXT_BYTES = 2048;

export function limitaContext(grezzo: unknown): Record<string, unknown> {
  if (!grezzo || typeof grezzo !== 'object' || Array.isArray(grezzo)) return {};
  let serializzato: string;
  try {
    serializzato = JSON.stringify(grezzo);
  } catch {
    return {}; // riferimenti circolari o valori non serializzabili
  }
  if (serializzato.length > MAX_CONTEXT_BYTES) {
    return { troncato: true, dimensione_originale: serializzato.length };
  }
  return grezzo as Record<string, unknown>;
}
