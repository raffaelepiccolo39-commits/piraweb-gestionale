/**
 * Lavori extra (`client_extras`) nei conti dell'agenzia.
 *
 * Sono i lavori fatturati fuori dal canone: una landing in più, uno shooting
 * fuori pacchetto. Fanno il paio con gli acconti di [acconti.ts], ma nel verso
 * opposto:
 *
 *   ti deve = valore contratto + lavori extra
 *   ha pagato = rate segnate incassate + acconti incassati
 *
 * REGOLA: il lavoro extra entra solo nell'"atteso", mai nell'"incassato".
 * I soldi che arrivano si registrano come acconto, quindi contarlo anche fra
 * gli incassi lo conterebbe due volte.
 */

/** Colonne minime per i conti. Le pagine possono chiederne altre in aggiunta. */
export const COLONNE_EXTRA = 'id, client_id, project_id, label, amount, work_date, due_date';

/** Riga di `client_extras` ridotta a quel che serve per fare i conti. */
export interface ExtraContabile {
  id: string;
  client_id: string;
  label: string;
  amount: number;
  work_date: string;
  due_date: string | null;
}

/**
 * Data con cui il lavoro extra entra nei conti, in formato 'YYYY-MM-DD'.
 * La scadenza di pagamento se c'è, altrimenti il giorno del lavoro: è quando
 * quei soldi te li aspetti.
 */
export function dataExtra(e: ExtraContabile): string {
  return (e.due_date ?? e.work_date).slice(0, 10);
}

export function totaleExtra(righe: ExtraContabile[]): number {
  return righe.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

/** Somma i lavori extra per mese ('YYYY-MM'), pronti da fondere nel cashflow. */
export function extraPerMese(righe: ExtraContabile[]): Map<string, number> {
  const perMese = new Map<string, number>();
  for (const e of righe) {
    const chiave = dataExtra(e).slice(0, 7);
    perMese.set(chiave, (perMese.get(chiave) ?? 0) + (Number(e.amount) || 0));
  }
  return perMese;
}

/** Filtra le righe la cui data di riferimento cade nel periodo (estremi inclusi). */
export function extraNelPeriodo<T extends ExtraContabile>(righe: T[], start: string, end: string): T[] {
  return righe.filter((e) => {
    const d = dataExtra(e);
    return d >= start && d <= end;
  });
}
