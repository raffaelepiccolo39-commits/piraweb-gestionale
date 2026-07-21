import 'server-only';
import { headers } from 'next/headers';

/**
 * L'indirizzo pubblico da cui l'utente sta effettivamente usando il gestionale.
 *
 * Nasce da un problema reale: il collegamento a Meta falliva con "il dominio
 * di questo URL non è incluso nei domini dell'app". Quell'errore compare sia
 * quando il dominio non è autorizzato lato Meta, sia quando siamo NOI a
 * mandare un indirizzo diverso da quello atteso — e distinguere i due casi
 * guardando lo schermo è impossibile.
 *
 * La causa possibile era NEXT_PUBLIC_APP_URL: una variabile che va tenuta
 * allineata a mano su ogni ambiente e che, se sbagliata, rompe l'OAuth senza
 * dare indizi utili. Ricavare l'origine dalla richiesta la rende
 * automaticamente giusta ovunque: produzione, anteprima, sviluppo locale.
 *
 * La variabile resta come ripiego, per i contesti senza richiesta HTTP
 * (cron, invio email).
 */
export async function getAppOrigin(): Promise<string> {
  try {
    const h = await headers();
    // Dietro il proxy di Vercel l'host reale è in x-forwarded-host.
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) return `${proto}://${host}`;
  } catch {
    // nessun contesto di richiesta: si usa il ripiego
  }
  return (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
}
