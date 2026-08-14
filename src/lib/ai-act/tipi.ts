/**
 * Tipi del modulo AI Act (Reg. UE 2024/1689 come modificato dal Reg. UE
 * 2026/1744). Sono union di stringhe che mappano 1:1 agli enum Postgres della
 * migration: TypeScript per la logica applicativa, il DB per il vincolo.
 *
 * NB stack: la specifica originale era scritta per Prisma/Express/JWT. Qui il
 * progetto è Supabase + Next 16, quindi gli "enum Prisma" diventano type union
 * lato codice e CHECK/enum Postgres lato database.
 */

export type RuoloAi = 'DEPLOYER' | 'PROVIDER' | 'ENTRAMBI';

export type ClassificazioneRischio =
  | 'MINIMO'
  | 'LIMITATO' // soggetto ad art. 50
  | 'ALTO' // Allegato III — valutazione dedicata
  | 'VIETATO'; // art. 5 — non deve mai comparire come attivo

export type TipoOutput = 'TESTO' | 'IMMAGINE' | 'VIDEO' | 'AUDIO' | 'CODICE' | 'DATI';

export type EsitoEtichetta =
  | 'NON_RICHIESTA'
  | 'RICHIESTA_DEEPFAKE'
  | 'RICHIESTA_TESTO_INTERESSE_PUBBLICO'
  | 'ESENTE_REVISIONE_EDITORIALE'
  | 'ESENTE_OPERA_CREATIVA';

export type TipoDocumentoAi =
  | 'POLICY_INTERNA'
  | 'ADDENDUM_CLIENTE'
  | 'INFORMATIVA_UTENTI'
  | 'VALUTAZIONE_RISCHIO'
  | 'ATTESTATO_FORMAZIONE'
  | 'DOSSIER_CONFORMITA';

export type StatoFormazione = 'DA_EROGARE' | 'EROGATA' | 'PRESA_VISIONE' | 'SCADUTA';
