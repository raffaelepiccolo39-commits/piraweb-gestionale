/**
 * Acconti (`client_installments`) nei conti dell'agenzia.
 *
 * Fino a qui vivevano in un registro isolato: nessuna pagina dei soldi li
 * leggeva, quindi un acconto incassato non risultava da nessuna parte. Questo
 * file è la lettura condivisa da tutte quelle pagine, così la regola di
 * conteggio è scritta una volta sola.
 *
 * REGOLA: l'acconto è un INCASSO, non fatturato in più. Quanto un cliente
 * deve resta il suo contratto; l'acconto lo scala. Per questo entra solo
 * nell'"incassato" e mai nell'"atteso": le rate del canone restano segnate da
 * incassare anche quando l'acconto le copre, quindi sommare l'acconto
 * all'atteso conterebbe gli stessi soldi due volte.
 *
 * Per lo stesso motivo un acconto non ancora incassato NON entra nei crediti
 * da recuperare: quella cifra è già lì sotto forma di rate non incassate.
 *
 * Nessuna migration: la RLS di `client_installments` ("Installments select
 * all") consente già la lettura a ogni utente autenticato, e le pagine che
 * usano questi conti sono comunque riservate agli admin.
 */

/** Colonne minime per i conti. Le pagine possono chiederne altre in aggiunta. */
export const COLONNE_ACCONTO = 'id, client_id, project_id, label, amount, due_date, paid_at, created_at';

/** Riga di `client_installments` ridotta a quel che serve per fare i conti. */
export interface AccontoContabile {
  id: string;
  client_id: string;
  project_id: string | null;
  label: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface TotaliAcconti {
  /**
   * Tutti gli acconti del periodo, incassati o no. Serve al box Acconti per
   * mostrare il quadro completo: NON va sommato all'atteso dell'agenzia.
   */
  expected: number;
  /** Solo quelli con una data di incasso: è questo che entra nei conti. */
  received: number;
  /** Registrati ma non ancora incassati. */
  pending: number;
}

/**
 * Data con cui l'acconto entra nei conti, in formato 'YYYY-MM-DD'.
 *
 * Se è stato incassato vale la data dell'incasso — i soldi contano nel mese in
 * cui sono arrivati davvero, non in quello in cui li aspettavamo. Altrimenti
 * vale la scadenza. Tenendo un'unica data per riga, mese per mese torna sempre
 * `atteso = incassato + da incassare` e il "da incassare" non va mai in
 * negativo (succederebbe con due date diverse per la stessa riga).
 *
 * Ultimo fallback la data di creazione: un acconto senza scadenza e non ancora
 * incassato non ha altra collocazione, e sparire dai conti sarebbe peggio.
 */
export function dataAcconto(a: AccontoContabile): string {
  return (a.paid_at ?? a.due_date ?? a.created_at).slice(0, 10);
}

/** True se l'acconto è incassato. */
export function accontoIncassato(a: AccontoContabile): boolean {
  return a.paid_at != null;
}

export function totaliAcconti(righe: AccontoContabile[]): TotaliAcconti {
  let expected = 0;
  let received = 0;
  for (const a of righe) {
    const importo = Number(a.amount) || 0;
    expected += importo;
    if (accontoIncassato(a)) received += importo;
  }
  return { expected, received, pending: expected - received };
}

/** Somma gli acconti per mese ('YYYY-MM'), pronti da fondere nel cashflow. */
export function accontiPerMese(righe: AccontoContabile[]): Map<string, TotaliAcconti> {
  const perMese = new Map<string, TotaliAcconti>();
  for (const a of righe) {
    const chiave = dataAcconto(a).slice(0, 7);
    const importo = Number(a.amount) || 0;
    const acc = perMese.get(chiave) ?? { expected: 0, received: 0, pending: 0 };
    acc.expected += importo;
    if (accontoIncassato(a)) acc.received += importo;
    else acc.pending += importo;
    perMese.set(chiave, acc);
  }
  return perMese;
}

/** Filtra le righe la cui data di riferimento cade nel periodo (estremi inclusi). */
export function accontiNelPeriodo<T extends AccontoContabile>(righe: T[], start: string, end: string): T[] {
  return righe.filter((a) => {
    const d = dataAcconto(a);
    return d >= start && d <= end;
  });
}
