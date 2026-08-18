import 'server-only';

/**
 * Import dello storico commerciale (§11 della specifica).
 *
 * Il caricamento delle trattative già in corso — chat aperte, preventivi mai
 * richiamati, prospect del 2025 — è parte del rilascio: senza, alla prima
 * Sales Review la pipeline è vuota e non si guarda.
 *
 * Tracciato (separatore ';'):
 *   azienda;contatto;email;telefono;source;referrer;stage;prossima_azione;
 *   data_prossima_azione;canone_proposto;una_tantum_proposto;note
 *
 * Colonne facoltative in coda, non previste dal tracciato della specifica ma
 * necessarie per caricare davvero quello che la §11 chiede di caricare:
 *   data_ingresso  la data reale di inizio trattativa. Senza, tutti i sales
 *                  cycle dello storico partirebbero dal giorno dell'import.
 *   esito          won / lost / nurture. Il tracciato non la prevedeva, ma
 *                  fra le righe da caricare ci sono i "clienti persi": senza
 *                  questa colonna resterebbero fermi allo stage Esito senza
 *                  un esito, cioè in uno stato che non vuol dire niente.
 *   motivo_lost    obbligatoria se esito = lost (V4).
 *   data_ripresa   obbligatoria se esito = nurture (V5).
 */

export const COLONNE_CSV = [
  'azienda', 'contatto', 'email', 'telefono', 'source', 'referrer', 'stage',
  'prossima_azione', 'data_prossima_azione', 'canone_proposto', 'una_tantum_proposto', 'note',
] as const;

export interface RigaImport {
  numero: number;
  dati: Record<string, string>;
}

export interface ErroreImport {
  numero: number;
  azienda: string;
  motivo: string;
}

/** Parser CSV minimo: separatore ';', virgolette doppie, niente altro. */
export function analizzaCsv(testo: string): { intestazione: string[]; righe: RigaImport[] } {
  const linee = testo.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linee.length === 0) return { intestazione: [], righe: [] };

  const dividi = (linea: string): string[] => {
    const campi: string[] = [];
    let corrente = '';
    let traVirgolette = false;

    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (traVirgolette && linea[i + 1] === '"') { corrente += '"'; i++; }
        else traVirgolette = !traVirgolette;
      } else if (c === ';' && !traVirgolette) {
        campi.push(corrente.trim()); corrente = '';
      } else {
        corrente += c;
      }
    }
    campi.push(corrente.trim());
    return campi;
  };

  const intestazione = dividi(linee[0]).map((h) => h.toLowerCase().trim());
  const righe: RigaImport[] = linee.slice(1).map((linea, i) => {
    const valori = dividi(linea);
    const dati: Record<string, string> = {};
    intestazione.forEach((nome, idx) => { dati[nome] = valori[idx] ?? ''; });
    return { numero: i + 2, dati }; // +2: la 1 è l'intestazione, si conta da 1
  });

  return { intestazione, righe };
}

const SOURCE_VALIDE = ['referral', 'inbound', 'outbound', 'paid', 'partnership'];
const ESITI_VALIDI = ['won', 'lost', 'nurture'];
const MOTIVI_VALIDI = ['prezzo', 'timing', 'no_decision_maker', 'concorrente', 'no_fit', 'silenzio'];

/** Dalla riga CSV al payload dell'opportunità. Null se la riga non è valida. */
export function rigaAOpportunita(
  riga: RigaImport,
  stagePerCodice: Map<string, number>,
): { dati: Record<string, unknown>; dataIngresso: string | null } | { errore: string } {
  const d = riga.dati;
  const azienda = (d.azienda ?? '').trim();
  if (!azienda) return { errore: 'Manca il nome dell\'azienda' };

  const source = (d.source ?? '').trim().toLowerCase();
  if (!source) return { errore: 'Indica la provenienza del lead' };
  if (!SOURCE_VALIDE.includes(source)) {
    return { errore: `Provenienza "${source}" non valida (ammesse: ${SOURCE_VALIDE.join(', ')})` };
  }
  if (source === 'referral' && !(d.referrer ?? '').trim()) {
    return { errore: 'Indica chi ha segnalato il contatto' };
  }

  const codiceStage = (d.stage ?? '').trim().toLowerCase();
  let stage = 0;
  if (codiceStage) {
    // Si accetta sia il codice ('qualificato') sia il numero ('2').
    const daCodice = stagePerCodice.get(codiceStage);
    const daNumero = /^\d$/.test(codiceStage) ? Number(codiceStage) : undefined;
    const scelto = daCodice ?? daNumero;
    if (scelto == null || scelto < 0 || scelto > 9) {
      return { errore: `Stage "${codiceStage}" non riconosciuto` };
    }
    stage = scelto;
  }

  const numero = (v: string | undefined): number | null => {
    const pulito = (v ?? '').trim().replace(/\./g, '').replace(',', '.');
    if (!pulito) return null;
    const n = Number(pulito);
    return Number.isFinite(n) ? n : null;
  };

  const data = (v: string | undefined): string | null => {
    const t = (v ?? '').trim();
    if (!t) return null;
    // Si accetta sia 2026-08-18 sia 18/08/2026.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    const ita = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) return iso;
    if (ita) return `${ita[3]}-${ita[2].padStart(2, '0')}-${ita[1].padStart(2, '0')}`;
    return null;
  };

  const aperto = stage >= 0 && stage <= 6;
  const prossima = (d.prossima_azione ?? '').trim();
  const dataProssima = data(d.data_prossima_azione);
  if (aperto && (!prossima || !dataProssima)) {
    return { errore: 'Ogni opportunità aperta deve avere una prossima azione con data' };
  }

  const esito = (d.esito ?? '').trim().toLowerCase() || null;
  const motivoLost = (d.motivo_lost ?? '').trim().toLowerCase() || null;
  const dataRipresa = data(d.data_ripresa);

  if (esito) {
    if (!ESITI_VALIDI.includes(esito)) {
      return { errore: `Esito "${esito}" non valido (ammessi: ${ESITI_VALIDI.join(', ')})` };
    }
    if (stage < 7) {
      return { errore: 'Per registrare un esito lo stage deve essere esito, contratto o onboarding' };
    }
    if (esito === 'lost') {
      if (!motivoLost) return { errore: 'Indica il motivo della perdita' };
      if (!MOTIVI_VALIDI.includes(motivoLost)) {
        return { errore: `Motivo "${motivoLost}" non valido (ammessi: ${MOTIVI_VALIDI.join(', ')})` };
      }
    }
    // V5 chiede una data futura solo quando si mette in nurture adesso: sullo
    // storico si accetta anche una data passata, che il job di §8.4 farà
    // emergere subito come "da riprendere". È il comportamento giusto: quel
    // contatto andava richiamato mesi fa.
    if (esito === 'nurture' && !dataRipresa) {
      return { errore: 'Indica quando riprendere il contatto' };
    }
  } else if (stage >= 7) {
    return { errore: 'Una opportunità allo stage esito deve dichiarare com\'è andata' };
  }

  return {
    dati: {
      title: (d.titolo ?? '').trim() || `Opportunità ${azienda}`,
      company_name: azienda,
      contact_name: (d.contatto ?? '').trim() || null,
      contact_email: (d.email ?? '').trim() || null,
      contact_phone: (d.telefono ?? '').trim() || null,
      source,
      referrer: (d.referrer ?? '').trim() || null,
      stage_id: stage,
      prossima_azione: prossima || null,
      data_prossima_azione: dataProssima,
      canone_proposto: numero(d.canone_proposto),
      una_tantum_proposto: numero(d.una_tantum_proposto),
      notes: (d.note ?? '').trim() || null,
      esito,
      motivo_lost: esito === 'lost' ? motivoLost : null,
      data_ripresa: esito === 'nurture' ? dataRipresa : null,
      importato: true,
    },
    dataIngresso: data(d.data_ingresso),
  };
}

/** CSV di ritorno con le righe scartate e il perché (§11). */
export function csvDegliErrori(errori: ErroreImport[]): string {
  const righe = errori.map((e) => `${e.numero};"${e.azienda.replace(/"/g, '""')}";"${e.motivo.replace(/"/g, '""')}"`);
  return ['riga;azienda;motivo', ...righe].join('\n');
}
