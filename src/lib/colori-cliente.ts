/**
 * Il colore con cui si riconosce un cliente a colpo d'occhio.
 *
 * Nella bacheca task ogni card porta il quadratino del cliente. Prima usava
 * il colore del PROGETTO, che ha un default mai cambiato: decine di clienti
 * diversi uscivano identici e si confondevano. Ora il colore sta sul
 * cliente, che è la cosa da riconoscere.
 *
 * `clients.color` può essere NULL — un cliente creato dopo la migration
 * nasce così. In quel caso il colore si ricava dal suo id: sempre lo stesso
 * per lo stesso cliente, diverso dal vicino. Il punto è che nessun cliente
 * resti indistinguibile aspettando che qualcuno gliene scelga uno a mano:
 * sarebbe il difetto di partenza, ricreato.
 */

/** Dodici colori distinguibili fra loro, gli stessi dei profili del team. */
export const PALETTE_CLIENTI = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
] as const;

/**
 * FNV-1a a 32 bit. Non serve a nascondere niente: serve a spargere.
 *
 * La prima versione sommava i caratteri, e su UUID che differiscono solo
 * nelle ultime cifre finiva per usare tre colori su dodici — cioè ricreava
 * il difetto che questa funzione esiste per evitare. Se ne è accorto il
 * test, non l'occhio.
 *
 * Deve restare deterministica: stesso id, stesso colore a ogni render,
 * altrimenti il cliente cambia colore mentre lo guardi.
 */
function posto(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % PALETTE_CLIENTI.length;
}

export function coloreCliente(
  cliente: { id?: string | null; color?: string | null } | null | undefined,
): string {
  if (cliente?.color) return cliente.color;
  if (cliente?.id) return PALETTE_CLIENTI[posto(cliente.id)];
  return PALETTE_CLIENTI[8];
}
