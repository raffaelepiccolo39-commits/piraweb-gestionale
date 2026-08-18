/**
 * Le pagine riservate agli amministratori.
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
];

/** true se il percorso è una pagina riservata (o una sua sottopagina). */
export function isRottaAdmin(path: string): boolean {
  return ADMIN_ROUTES.some((r) => path === r || path.startsWith(r + '/'));
}
