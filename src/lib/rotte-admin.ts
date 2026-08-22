/**
 * Chi può aprire cosa.
 *
 * Sta qui, in un modulo senza dipendenze, perché serve in due posti che non
 * possono importarsi a vicenda: il middleware (che rimbalza chi non ha il
 * ruolo) e l'intestazione lato client (che non deve nemmeno nominarle nella
 * ricerca rapida). Il middleware tira dentro `next/server` e i client di
 * Supabase, quindi importarlo dal browser vorrebbe dire spedire codice
 * server dentro il pacchetto.
 *
 * Una lista sola: finché la ricerca legge di qui, non può proporre una
 * destinazione che il middleware poi respinge.
 */

export const ADMIN_ROUTES: readonly string[] = [
  '/cashflow',
  '/crm',
  '/cfo',
  '/direzione',
  '/profitability',
  '/lead-finder',
  '/lead-ai',
  '/market-research',
  '/ai-content',
  '/freelancers',
  '/invoices',
  '/capacity',
  '/automations',
  '/analytics',
  '/gestione',
  // '/gestione-siti' NON è coperta da '/gestione' (il confronto richiede la
  // barra), quindi va elencata a parte.
  '/gestione-siti',
  '/rendimento',
  '/log',
  '/settings',
  // Le ore del team: la RLS su time_entries limita già ciascuno alle proprie,
  // ma la pagina è un cruscotto di direzione e non deve aprirsi affatto.
  '/timesheet',
  // Rate e insoluti dei clienti. Era nascosta nel menu e basta: chi ne
  // conosceva l'indirizzo entrava. Aggiunta il 20/08/2026.
  '/crediti',
];

/**
 * Pagine riservate a un mestiere, non al grado.
 *
 * L'admin entra sempre e non va elencato. Serve perché "riservato" non
 * significa solo "da capo": le credenziali dei profili social le usa chi i
 * social li gestisce, e non c'è motivo che le veda il resto del team.
 */
export const ROTTE_PER_RUOLO: Readonly<Record<string, readonly string[]>> = {
  '/accessi': ['social_media_manager'],
};

/** true se il percorso è una pagina da amministratore (o una sua sottopagina). */
export function isRottaAdmin(path: string): boolean {
  return ADMIN_ROUTES.some((r) => path === r || path.startsWith(r + '/'));
}

/**
 * true se questo ruolo NON può aprire il percorso.
 *
 * È la domanda che si fanno in tre: il middleware per rimbalzare, il menu
 * per non mostrare la voce, la ricerca rapida per non proporla. Una
 * risposta sola, altrimenti si torna al caso di prima — il menu nascondeva
 * /accessi e /crediti, e il middleware li lasciava aperti a chi ne
 * conosceva l'indirizzo.
 *
 * Il confronto richiede la barra (`/gestione` non copre `/gestione-siti`),
 * quindi le sottosezioni vanno elencate a parte.
 */
/**
 * true se per questo percorso serve sapere che ruolo ha chi bussa.
 *
 * Serve al middleware per NON leggere il profilo dal database quando non
 * cambierebbe nulla: su /dashboard, /tasks, /calendario la risposta è la
 * stessa per tutti, e quella lettura costava un giro di rete a ogni clic.
 * Sulle pagine riservate invece si legge sempre, fresco: il permesso non si
 * mette in cache.
 */
export function rottaRiservata(path: string): boolean {
  if (isRottaAdmin(path)) return true;
  return Object.keys(ROTTE_PER_RUOLO).some((r) => path === r || path.startsWith(r + '/'));
}

export function accessoNegato(path: string, ruolo: string | null | undefined): boolean {
  if (ruolo === 'admin') return false;
  if (isRottaAdmin(path)) return true;
  const ammessi = Object.entries(ROTTE_PER_RUOLO)
    .find(([r]) => path === r || path.startsWith(r + '/'))?.[1];
  return ammessi !== undefined && !ammessi.includes(ruolo ?? '');
}
