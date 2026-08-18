import 'server-only';

/**
 * Permessi del CRM commerciale (§9 della specifica).
 *
 * La specifica prevede tre ruoli — CEO, Sales Ops, Team delivery — ma
 * l'enum `user_role` del gestionale ne ha altri: admin, social_media_manager,
 * content_creator, graphic_social, graphic_brand. Non c'è nessun ruolo
 * commerciale.
 *
 * Decisione del referente funzionale: il modulo nasce riservato al CEO. Le
 * regole di Sales Ops e delivery sono scritte qui sotto e funzionanti, ma
 * nessuno può ricadervi finché non si aggiunge il valore all'enum. Il giorno
 * che serve, si aggiunge 'sales_ops' a user_role e questo file è già pronto.
 */

export type RuoloCrm = 'ceo' | 'sales_ops' | 'delivery' | 'nessuno';

/** Campi economici: Sales Ops li vede ma non li tocca. */
export const CAMPI_PREZZO = ['canone_proposto', 'una_tantum_proposto', 'durata_mesi'] as const;

/** Stage che solo il CEO può assegnare: negoziazione, esito, contratto. */
export const STAGE_SOLO_CEO = [6, 7, 8] as const;

/** Gli unici campi che il team delivery può toccare, sulle opportunità vinte. */
export const CAMPI_ONBOARDING = ['prossima_azione', 'data_prossima_azione', 'notes'] as const;

export function ruoloCrm(role: string | null | undefined): RuoloCrm {
  if (role === 'admin') return 'ceo';
  if (role === 'sales_ops') return 'sales_ops';
  return 'nessuno';
}

export function puoLeggere(ruolo: RuoloCrm): boolean {
  return ruolo !== 'nessuno';
}

/**
 * Campi che questo ruolo NON può scrivere. Vuoto per il CEO.
 * Il controllo vive qui, nel service layer, non nel nascondere un input.
 */
export function campiVietati(ruolo: RuoloCrm): readonly string[] {
  if (ruolo === 'ceo') return [];
  if (ruolo === 'sales_ops') return CAMPI_PREZZO;
  return [];
}

/** true se il ruolo può portare l'opportunità a quello stage. */
export function puoAssegnareStage(ruolo: RuoloCrm, stage: number): boolean {
  if (ruolo === 'ceo') return true;
  if (ruolo === 'sales_ops') return !STAGE_SOLO_CEO.includes(stage as 6 | 7 | 8);
  if (ruolo === 'delivery') return stage === 9;
  return false;
}

/** Il team delivery vede solo le opportunità già vinte, in consegna. */
export function stageVisibili(ruolo: RuoloCrm): number[] | null {
  if (ruolo === 'delivery') return [8, 9];
  return null; // null = tutti
}
