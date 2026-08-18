/**
 * Quali errori NON vanno nel registro.
 *
 * Il valore di /log è il silenzio: se contiene sempre qualcosa, smette di
 * essere letto, ed è così che un guasto vero passa inosservato. Qui stanno
 * i messaggi che sembrano errori ma non lo sono — nessuno ne risente,
 * l'operazione riesce lo stesso al tentativo dopo.
 *
 * Sta in un file suo, senza dipendenze, per due motivi: è una funzione pura
 * che si può provare con `node --test` senza tirarsi dietro mezzo Next, e
 * perché è già successo che un messaggio nuovo di Supabase sfuggisse al
 * filtro per una parola diversa. Un test che fissa il testo esatto costa
 * meno di 9 occorrenze di rumore in 28 giorni.
 */

/** Il lock della sessione Supabase: due schede aperte se lo contendono. */
const LOCK_SESSIONE = [
  // Supabase ha usato tre formulazioni diverse per la stessa cosa. Sono
  // tutte innocue: una scheda cede il rinnovo del token a un'altra.
  /lock broken by another request/i,
  /the 'steal' option/i,
  /released because another request stole it/i,
];

/** Rete che va e viene: il tentativo successivo riesce. */
const RETE_TRANSITORIA = [
  /load failed/i,
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
];

function messaggioDi(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return '';
}

export function isBenignTransientError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;

  const messaggio = messaggioDi(error);
  if (!messaggio) return false;

  return [...LOCK_SESSIONE, ...RETE_TRANSITORIA].some((r) => r.test(messaggio));
}
