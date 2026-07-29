/**
 * Cache in memoria per i dati già caricati, condivisa da tutta l'app.
 *
 * Il problema che risolve: ogni pagina del gestionale è un componente client
 * che al montaggio parte da zero — scheletro grigio, poi tutte le sue query.
 * Torni sulla Dashboard dopo dieci secondi e rifà le stesse identiche 12
 * chiamate, mostrandoti intanto un placeholder. È questo, più della latenza
 * del database (mediana 219ms, sana), che fa percepire l'app come lenta.
 *
 * Con la cache la pagina mostra SUBITO l'ultimo risultato conosciuto e
 * rinfresca in sottofondo (stale-while-revalidate): niente scheletro, niente
 * attesa, e i numeri si aggiornano da soli un attimo dopo.
 *
 * Volutamente in memoria e non su disco: sopravvive alla navigazione tra le
 * pagine, non a un reload completo. Dati finanziari e presenze in localStorage
 * sarebbero da gestire (scadenza, cambio utente, quota piena su iOS): qui il
 * guadagno sta tutto nel cambio pagina.
 */

interface Entry {
  data: unknown;
  at: number;
  /** Richiesta in volo: due componenti che chiedono la stessa cosa insieme la condividono. */
  inflight?: Promise<unknown>;
}

const store = new Map<string, Entry>();

/** Oltre questa soglia il dato non viene nemmeno mostrato: meglio lo scheletro. */
export const DEFAULT_MAX_AGE_MS = 5 * 60_000;

export function readCache<T>(key: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > maxAgeMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function writeCache(key: string, data: unknown): void {
  store.set(key, { data, at: Date.now() });
}

/**
 * Esegue il fetch condividendo le richieste in volo sulla stessa chiave.
 * Serve quando due componenti montano insieme e chiedono gli stessi dati.
 */
export async function fetchShared<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry?.inflight) return entry.inflight as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      writeCache(key, data);
      return data;
    })
    .finally(() => {
      const current = store.get(key);
      if (current) delete current.inflight;
    });

  store.set(key, { data: entry?.data, at: entry?.at ?? 0, inflight: promise });
  return promise;
}

/**
 * Butta via quello che è stato salvato. Senza argomenti svuota tutto (logout,
 * cambio utente); con un prefisso invalida una famiglia di chiavi dopo una
 * scrittura — es. invalidateCache('dashboard') dopo aver chiuso una task.
 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) { store.clear(); return; }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
