/**
 * Decide se un contenuto generato con IA va etichettato ex art. 50 del
 * Reg. UE 2024/1689 (obblighi di trasparenza, applicabili dal 2 agosto 2026).
 *
 * Funzione PURA: nessun effetto collaterale, nessuna chiamata esterna, nessuna
 * dipendenza dallo stack. È la funzione su cui si regge la difendibilità
 * dell'intero modulo, quindi ogni regola riporta in commento l'articolo che la
 * fonda ed è coperta da test.
 *
 * ORDINE (dalla tabella della specifica). Attenzione: NON è un "primo match
 * vince" secco. Le esenzioni R3 e R5 non scavalcano gli obblighi, li
 * MODIFICANO:
 *   - R3 (opera creativa) riduce un deepfake a disclosure non invasiva, non lo
 *     annulla — art. 50(4), eccezione per opere manifestamente creative.
 *   - R5 (revisione editoriale) esenta SOLO il testo di interesse pubblico
 *     (R4), MAI un deepfake: la responsabilità editoriale non sana un
 *     contenuto falsamente autentico — art. 50(4), esenzione editoriale.
 */

import type { TipoOutput, EsitoEtichetta } from './tipi';

export type ContestoGenerazione = {
  tipoOutput: TipoOutput;
  contieneVoceClonata: boolean;
  contieneVoltoSintetico: boolean;
  rappresentaPersonaReale: boolean;
  scenaFotorealistica: boolean;
  finalitaInformativaPubblica: boolean; // notizie, temi di interesse pubblico
  operaManifestamenteCreativa: boolean; // satira, finzione dichiarata
  revisioneEditorialeUmana: boolean;
  responsabileEditoriale: string | null;
};

export type EsitoValutazione = {
  esito: EsitoEtichetta;
  regolaApplicata: string;
  testoSuggerito: string | null;
  motivazione: string;
};

/** Testo di disclosure standard per un contenuto sintetico. */
const ETICHETTA_DEEPFAKE = 'Contenuto generato o manipolato con intelligenza artificiale.';
/** Disclosure ridotta e non invasiva per opere creative (art. 50(4)). */
const ETICHETTA_OPERA_CREATIVA = 'Opera creativa realizzata con l’ausilio di intelligenza artificiale.';
/** Disclosure per testo pubblicato di interesse pubblico. */
const ETICHETTA_TESTO_PUBBLICO = 'Testo generato con intelligenza artificiale.';

export function valutaEtichetta(ctx: ContestoGenerazione): EsitoValutazione {
  // ── Blocco deepfake — art. 50(4): contenuti che appaiono falsamente
  //    autentici (voce clonata, volto sintetico realistico, scena verosimile).
  const deepfakeVoce = ctx.contieneVoceClonata && ctx.rappresentaPersonaReale; // R1
  const deepfakeVolto =
    ctx.contieneVoltoSintetico && (ctx.rappresentaPersonaReale || ctx.scenaFotorealistica); // R2

  if (deepfakeVoce || deepfakeVolto) {
    // R3 — opera manifestamente creativa: l'obbligo si riduce a disclosure
    //      non invasiva, ma NON sparisce.
    if (ctx.operaManifestamenteCreativa) {
      return {
        esito: 'ESENTE_OPERA_CREATIVA',
        regolaApplicata: 'OPERA_CREATIVA',
        testoSuggerito: ETICHETTA_OPERA_CREATIVA,
        motivazione:
          'Contenuto sintetico ma opera manifestamente creativa (art. 50(4)): disclosure ridotta e non invasiva.',
      };
    }
    return {
      esito: 'RICHIESTA_DEEPFAKE',
      regolaApplicata: deepfakeVoce ? 'DEEPFAKE_VOCE' : 'DEEPFAKE_VOLTO',
      testoSuggerito: ETICHETTA_DEEPFAKE,
      motivazione:
        'Contenuto che appare falsamente autentico (art. 50(4)): etichettatura obbligatoria come deepfake.',
    };
  }

  // ── Blocco testo di interesse pubblico — art. 50(4), secondo caso.
  if (ctx.tipoOutput === 'TESTO' && ctx.finalitaInformativaPubblica) {
    // R4
    // R5 — esenzione per revisione editoriale: vale SOLO qui, e solo se c'è un
    //      responsabile editoriale (persona fisica o giuridica) dimostrabile.
    if (ctx.revisioneEditorialeUmana && ctx.responsabileEditoriale !== null) {
      return {
        esito: 'ESENTE_REVISIONE_EDITORIALE',
        regolaApplicata: 'REVISIONE_EDITORIALE',
        testoSuggerito: null,
        motivazione: `Testo di interesse pubblico sottoposto a revisione editoriale con responsabilità in capo a "${ctx.responsabileEditoriale}" (art. 50(4)): esente da etichettatura.`,
      };
    }
    return {
      esito: 'RICHIESTA_TESTO_INTERESSE_PUBBLICO',
      regolaApplicata: 'TESTO_PUBBLICO',
      testoSuggerito: ETICHETTA_TESTO_PUBBLICO,
      motivazione:
        'Testo pubblicato per informare il pubblico su questioni di interesse pubblico (art. 50(4)): etichettatura obbligatoria.',
    };
  }

  // R6 — nessun obbligo di trasparenza: copy pubblicitario, script recitati da
  //      persone reali, grafiche rilavorate da un designer.
  return {
    esito: 'NON_RICHIESTA',
    regolaApplicata: 'DEFAULT',
    testoSuggerito: null,
    motivazione: 'Nessun contenuto sintetico falsamente autentico e nessuna finalità informativa pubblica: etichettatura non richiesta.',
  };
}
