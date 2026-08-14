/**
 * Tipi delle righe delle tabelle AI Act (migration 20260814d) per le pagine
 * di consultazione. Speculari alle colonne Postgres.
 */
import type { RuoloAi, ClassificazioneRischio, TipoOutput, EsitoEtichetta, TipoDocumentoAi, StatoFormazione } from './tipi';

export interface AiSystemRow {
  id: string;
  nome: string;
  fornitore: string;
  versione: string | null;
  finalita: string;
  descrizione_uso: string;
  ruolo_pira_web: RuoloAi;
  classif_rischio: ClassificazioneRischio;
  motivazione_rischio: string | null;
  dati_personali: boolean;
  categorie_dati: string | null;
  dati_art9: boolean;
  base_giuridica: string | null;
  output_pubblicato: boolean;
  richiede_disclosure: boolean;
  responsabile_id: string;
  url_doc_fornitore: string | null;
  url_dpa: string | null;
  training_opt_out: boolean;
  attivo: boolean;
  data_attivazione: string;
  data_dismissione: string | null;
  data_ultima_revisione: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiGenerationRow {
  id: string;
  sistema_id: string;
  modello: string;
  tipo_output: TipoOutput;
  prompt_hash: string;
  prompt_sintesi: string | null;
  token_input: number | null;
  token_output: number | null;
  output_ref: string | null;
  utente_id: string;
  cliente_id: string | null;
  progetto: string | null;
  esito_etichetta: EsitoEtichetta;
  regola_applicata: string | null;
  etichetta_applicata: boolean;
  testo_etichetta: string | null;
  revisione_umana: boolean;
  revisore_id: string | null;
  data_revisione: string | null;
  note_revisione: string | null;
  pubblicato: boolean;
  data_pubblicazione: string | null;
  canale_pubblicazione: string | null;
  created_at: string;
}

export interface AiTrainingModuleRow {
  id: string;
  titolo: string;
  descrizione: string;
  contenuto_url: string | null;
  durata_minuti: number;
  validita_mesi: number;
  obbligatorio: boolean;
  attivo: boolean;
  created_at: string;
}

export interface AiTrainingSessionRow {
  id: string;
  modulo_id: string;
  utente_id: string;
  stato: StatoFormazione;
  data_erogazione: string | null;
  durata_effettiva: number | null;
  esito_quiz: number | null;
  presa_visione: string | null;
  scadenza: string | null;
  attestato_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiDocumentRow {
  id: string;
  tipo: TipoDocumentoAi;
  titolo: string;
  versione: string;
  file_url: string;
  file_hash: string;
  data_vigore: string;
  data_scadenza: string | null;
  cliente_id: string | null;
  vigente: boolean;
  created_at: string;
}

/** Etichette leggibili per i badge. */
export const RUOLO_LABEL: Record<RuoloAi, string> = {
  DEPLOYER: 'Utilizzatore', PROVIDER: 'Fornitore', ENTRAMBI: 'Entrambi',
};
export const RISCHIO_LABEL: Record<ClassificazioneRischio, string> = {
  MINIMO: 'Minimo', LIMITATO: 'Limitato', ALTO: 'Alto', VIETATO: 'Vietato',
};
export const RISCHIO_TONE: Record<ClassificazioneRischio, 'neutral' | 'success' | 'warning' | 'danger'> = {
  MINIMO: 'success', LIMITATO: 'neutral', ALTO: 'warning', VIETATO: 'danger',
};
export const ESITO_LABEL: Record<EsitoEtichetta, string> = {
  NON_RICHIESTA: 'Non richiesta',
  RICHIESTA_DEEPFAKE: 'Etichetta deepfake',
  RICHIESTA_TESTO_INTERESSE_PUBBLICO: 'Etichetta testo pubblico',
  ESENTE_REVISIONE_EDITORIALE: 'Esente (revisione)',
  ESENTE_OPERA_CREATIVA: 'Esente (opera creativa)',
};
export const ESITO_TONE: Record<EsitoEtichetta, 'neutral' | 'success' | 'warning' | 'danger'> = {
  NON_RICHIESTA: 'neutral',
  RICHIESTA_DEEPFAKE: 'danger',
  RICHIESTA_TESTO_INTERESSE_PUBBLICO: 'warning',
  ESENTE_REVISIONE_EDITORIALE: 'success',
  ESENTE_OPERA_CREATIVA: 'success',
};

/** Un'etichetta è "in sospeso" se richiesta ma non applicata e non pubblicata. */
export function etichettaInSospeso(g: Pick<AiGenerationRow, 'esito_etichetta' | 'etichetta_applicata' | 'pubblicato'>): boolean {
  return g.esito_etichetta.startsWith('RICHIESTA_') && !g.etichetta_applicata && !g.pubblicato;
}
