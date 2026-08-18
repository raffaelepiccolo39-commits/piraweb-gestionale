import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ruoloCrm, campiVietati, puoAssegnareStage, type RuoloCrm } from '@/lib/crm/permessi';
import { validaOpportunita, validaTransizione, CAMPI_CALCOLATI, type DatiOpportunita } from '@/lib/crm/regole';

/**
 * Scrittura delle opportunità commerciali.
 *
 * Tutte le modifiche passano da qui e non dal client direttamente: i permessi
 * della §9 e il divieto di scrivere lead_score (V8) sono controlli sul
 * chiamante, e un controllo sul chiamante non può stare nel chiamante.
 * Le regole di merito invece vivono nei trigger: se qui dimenticassimo un
 * caso, il database rifiuta comunque.
 */

/** Whitelist: qualunque altra chiave nel payload viene ignorata in silenzio. */
export const CAMPI_SCRIVIBILI = [
  'title', 'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'source', 'referrer', 'stage_id', 'owner_id', 'notes', 'services',
  'priority', 'tags', 'service_categories',
  'prossima_azione', 'data_prossima_azione',
  'q_problema_chiaro', 'q_urgenza', 'q_obiettivo_misurabile', 'q_budget_adeguato',
  'q_decision_maker', 'q_azienda_strutturata', 'q_necessita_social', 'q_necessita_web',
  'q_nessun_budget', 'q_solo_prezzo',
  'canone_proposto', 'una_tantum_proposto', 'durata_mesi',
  'disc_situazione', 'disc_problema', 'disc_impatto', 'disc_obiettivo',
  'disc_timing', 'disc_budget', 'disc_decision_maker',
  'esito', 'motivo_lost', 'data_ripresa',
  'expected_close_date',
] as const;

export interface EsitoScrittura {
  ok: boolean;
  status: number;
  errore?: string;
  /** V10: avviso non bloccante, con il link all'opportunità già aperta. */
  avviso?: { messaggio: string; deal_id: string };
  dati?: Record<string, unknown>;
}

/** Chi sta scrivendo e con quale ruolo CRM. */
export async function ruoloDellUtente(userId: string): Promise<{ ruolo: RuoloCrm; service: SupabaseClient }> {
  const service = await createServiceRoleClient();
  const { data } = await service.from('profiles').select('role').eq('id', userId).maybeSingle();
  return { ruolo: ruoloCrm(data?.role), service };
}

/**
 * Traduce l'errore del database in qualcosa da mostrare.
 * PT400 è il codice che i trigger della 20260818b usano per le violazioni di
 * regola: quelle hanno un messaggio già scritto in italiano e vanno rese
 * all'utente così come sono. Tutto il resto è un guasto e non si mostra.
 */
export function messaggioValidazione(errore: { code?: string; message?: string } | null): string | null {
  if (!errore) return null;
  if (errore.code === 'PT400') return errore.message ?? 'Dati non validi';
  // Il not-null su source è V1, ma arriva come errore di vincolo.
  if (errore.code === '23502' && errore.message?.includes('"source"')) {
    return 'Indica la provenienza del lead';
  }
  return null;
}

/** Toglie dal payload tutto ciò che questo ruolo non può scrivere. */
export function filtraPayload(
  input: Record<string, unknown>,
  ruolo: RuoloCrm,
): { dati: Record<string, unknown>; errore?: string } {
  // V8: il punteggio non si scrive, si calcola. Se arriva nel payload è un
  // bug del client o un tentativo: in entrambi i casi 400, non silenzio.
  for (const campo of CAMPI_CALCOLATI) {
    if (campo in input) {
      return { dati: {}, errore: `Il campo ${campo} è calcolato dal sistema e non può essere inviato` };
    }
  }

  const vietati = campiVietati(ruolo);
  const dati: Record<string, unknown> = {};

  for (const campo of CAMPI_SCRIVIBILI) {
    if (!(campo in input)) continue;
    if (vietati.includes(campo)) {
      return { dati: {}, errore: `Non hai i permessi per modificare il campo ${campo}` };
    }
    dati[campo] = input[campo];
  }

  return { dati };
}

/**
 * V10: alla creazione, se l'azienda ha già un'opportunità aperta lo si dice.
 * Avviso, non blocco: capita legittimamente di lavorare due trattative sulla
 * stessa azienda, e trasformarlo in un errore insegnerebbe solo a cambiare
 * la ragione sociale per aggirarlo.
 */
export async function duplicatoAperto(
  service: SupabaseClient,
  companyName: string | null | undefined,
  escludiId?: string,
): Promise<{ messaggio: string; deal_id: string } | null> {
  if (!companyName || !companyName.trim()) return null;

  let query = service
    .from('deals')
    .select('id, title')
    .ilike('company_name', companyName.trim())
    .is('esito', null)
    .lte('stage_id', 6)
    .limit(1);

  if (escludiId) query = query.neq('id', escludiId);

  const { data } = await query;
  if (!data?.length) return null;

  return {
    messaggio: `${companyName.trim()} ha già un'opportunità aperta: "${data[0].title}"`,
    deal_id: data[0].id as string,
  };
}

/** Creazione. */
export async function creaOpportunita(
  service: SupabaseClient,
  ruolo: RuoloCrm,
  userId: string,
  input: Record<string, unknown>,
): Promise<EsitoScrittura> {
  const { dati, errore } = filtraPayload(input, ruolo);
  if (errore) return { ok: false, status: 400, errore };

  const stage = Number(dati.stage_id ?? 0);
  if (!puoAssegnareStage(ruolo, stage)) {
    return { ok: false, status: 403, errore: 'Non hai i permessi per questo stage' };
  }

  const anticipato = validaOpportunita(dati as DatiOpportunita);
  if (anticipato) return { ok: false, status: 400, errore: anticipato };

  const avviso = await duplicatoAperto(service, dati.company_name as string);

  const { data, error } = await service
    .from('deals')
    .insert({ ...dati, owner_id: dati.owner_id ?? userId, created_by: userId })
    .select('*')
    .single();

  if (error) {
    const messaggio = messaggioValidazione(error);
    if (messaggio) return { ok: false, status: 400, errore: messaggio };
    return { ok: false, status: 500, errore: 'Salvataggio non riuscito' };
  }

  return { ok: true, status: 201, dati: data, avviso: avviso ?? undefined };
}

/** Modifica, compreso il cambio di stage (che è il drop del kanban). */
export async function aggiornaOpportunita(
  service: SupabaseClient,
  ruolo: RuoloCrm,
  id: string,
  input: Record<string, unknown>,
): Promise<EsitoScrittura> {
  const { dati, errore } = filtraPayload(input, ruolo);
  if (errore) return { ok: false, status: 400, errore };
  if (Object.keys(dati).length === 0) return { ok: false, status: 400, errore: 'Niente da salvare' };

  const { data: attuale, error: errLettura } = await service
    .from('deals').select('*').eq('id', id).maybeSingle();
  if (errLettura) return { ok: false, status: 500, errore: 'Lettura non riuscita' };
  if (!attuale) return { ok: false, status: 404, errore: 'Opportunità non trovata' };

  // Lo stato dopo la modifica: le regole si applicano al risultato, non al
  // frammento inviato. Senza questo, cambiare solo `esito` sfuggirebbe a V4.
  const dopo = { ...attuale, ...dati } as DatiOpportunita;

  if (dati.stage_id != null && Number(dati.stage_id) !== attuale.stage_id) {
    const nuovo = Number(dati.stage_id);
    if (!puoAssegnareStage(ruolo, nuovo)) {
      return { ok: false, status: 403, errore: 'Non hai i permessi per questo stage' };
    }
    const errTransizione = validaTransizione(attuale.stage_id, nuovo, attuale.esito);
    if (errTransizione) return { ok: false, status: 400, errore: errTransizione };

    // La riapertura del nurture azzera l'esito: lo fa anche il trigger, ma se
    // non lo facciamo anche qui la validazione qui sotto vedrebbe ancora
    // 'nurture' e chiederebbe una data di ripresa che non serve più.
    if (attuale.stage_id === 7 && nuovo < 7) {
      dopo.esito = null; dopo.motivo_lost = null; dopo.data_ripresa = null;
    }
  }

  const anticipato = validaOpportunita(dopo);
  if (anticipato) return { ok: false, status: 400, errore: anticipato };

  const { data, error } = await service
    .from('deals').update(dati).eq('id', id).select('*').single();

  if (error) {
    const messaggio = messaggioValidazione(error);
    if (messaggio) return { ok: false, status: 400, errore: messaggio };
    return { ok: false, status: 500, errore: 'Salvataggio non riuscito' };
  }

  return { ok: true, status: 200, dati: data };
}
