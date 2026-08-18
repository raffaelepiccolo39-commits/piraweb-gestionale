/**
 * Regole del CRM commerciale (§4 e §6.2 della specifica).
 *
 * Modulo puro, senza dipendenze da server o database: lo usano sia la UI
 * (per anticipare il messaggio mentre si compila) sia le rotte API (per
 * rifiutare prima di scrivere).
 *
 * Attenzione: NON è qui che le regole vengono fatte rispettare. Il vincolo
 * vero sta nei trigger della migration 20260818b, che valgono anche per
 * l'import CSV, per i job e per chi apre l'SQL Editor. Questo file esiste
 * per dare un messaggio buono subito, non per essere l'ultima difesa.
 */

import { CAMPI_DISCOVERY } from '@/types/database';
import type { CrmPesoLeadScore } from '@/types/database';

/** Campi che il client non può mai mandare: li calcola il database. */
export const CAMPI_CALCOLATI = ['lead_score', 'valore_pipeline'] as const;

export interface DatiOpportunita {
  source?: string | null;
  referrer?: string | null;
  stage_id?: number | null;
  prossima_azione?: string | null;
  data_prossima_azione?: string | null;
  canone_proposto?: number | null;
  esito?: string | null;
  motivo_lost?: string | null;
  data_ripresa?: string | null;
  importato?: boolean;
  [k: string]: unknown;
}

const vuoto = (v: unknown) => typeof v !== 'string' || v.trim() === '';

/** Quali dei 7 campi discovery mancano ancora. Alimenta anche il "5/7" in UI. */
export function discoveryMancanti(dati: DatiOpportunita): string[] {
  return CAMPI_DISCOVERY.filter((c) => vuoto(dati[c.campo])).map((c) => c.etichetta);
}

export function discoveryCompletata(dati: DatiOpportunita): number {
  return CAMPI_DISCOVERY.length - discoveryMancanti(dati).length;
}

/** Gli stage con is_aperto = true sono 0..6 (§3.3). */
export function stageAperto(stage: number | null | undefined): boolean {
  return stage != null && stage >= 0 && stage <= 6;
}

/**
 * Prima validazione, quella che dà il messaggio all'utente.
 * Restituisce null se va bene, altrimenti il messaggio della specifica.
 */
export function validaOpportunita(dati: DatiOpportunita): string | null {
  // V1
  if (vuoto(dati.source)) return 'Indica la provenienza del lead';

  // V2
  if (dati.source === 'referral' && vuoto(dati.referrer)) {
    return 'Indica chi ha segnalato il contatto';
  }

  const stage = dati.stage_id ?? 0;

  // V3 — lo storico importato è esente: di una trattativa vecchia la
  // discovery non si ricostruisce.
  if ((stage === 5 || stage === 6) && !dati.importato) {
    const mancanti = discoveryMancanti(dati);
    if (mancanti.length > 0) {
      return `Completa la discovery prima di preparare la proposta: mancano ${mancanti.join(', ')}`;
    }
  }

  // V4
  if (dati.esito === 'lost' && !dati.motivo_lost) return 'Indica il motivo della perdita';

  // V5
  if (dati.esito === 'nurture') {
    if (!dati.data_ripresa) return 'Indica quando riprendere il contatto';
  }

  // V6
  if (stage >= 8 && dati.canone_proposto == null && !dati.importato) {
    return 'Indica il canone concordato';
  }

  // V7 — la regola che tiene pulita la pipeline.
  if (stageAperto(stage) && !dati.esito) {
    if (vuoto(dati.prossima_azione) || !dati.data_prossima_azione) {
      return 'Ogni opportunità aperta deve avere una prossima azione con data';
    }
  }

  return null;
}

/**
 * Transizioni consentite (§5): avanti di uno stage per volta, indietro
 * libero, salto diretto all'esito dalle fasi di trattativa, riapertura del
 * solo nurture verso Qualificato.
 */
export function validaTransizione(da: number, a: number, esito: string | null | undefined): string | null {
  if (da === a) return null;

  if (a > da && a !== da + 1 && !(a === 7 && da >= 2 && da <= 6)) {
    return `Si avanza di uno stage per volta: da ${da} non si salta a ${a}`;
  }

  if (da === 7 && a < 7) {
    if (esito !== 'nurture') return 'Si riaprono solo le opportunità in nurture';
    if (a !== 2) return 'Una opportunità riaperta torna allo stage Qualificato';
  }

  return null;
}

/**
 * Lead score (§6.2). I pesi arrivano dalla tabella crm_lead_score_pesi:
 * questa funzione serve a mostrarlo aggiornato mentre si spuntano i flag,
 * ma il valore che finisce a database lo ricalcola sempre il trigger.
 */
export function calcolaLeadScore(
  flag: Record<string, unknown>,
  pesi: Pick<CrmPesoLeadScore, 'campo' | 'peso'>[],
): number {
  return pesi.reduce((somma, p) => (flag[p.campo] === true ? somma + p.peso : somma), 0);
}
