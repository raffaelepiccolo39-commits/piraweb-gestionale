/**
 * I riquadri della dashboard: quali esistono, quanto sono grandi, chi li vede.
 *
 * Sta in un file suo, separato dalla pagina, perché lo leggono in tre: la
 * griglia (per disegnare), il pannello "aggiungi" (per elencare quelli
 * spenti) e il salvataggio (per sapere cosa è lecito). Tenerlo dentro la
 * pagina avrebbe significato tre copie della stessa lista.
 *
 * Il CONTENUTO dei riquadri non sta qui: lo costruisce la pagina, dove i dati
 * sono già in memoria. Qui c'è solo l'anagrafica.
 */

/** Colonne della griglia su schermo largo. Le misure sotto sono in dodicesimi. */
export const COLONNE = 12;

/** Altezza di una riga, in pixel. Un riquadro alto 4 occupa 4×40 + i margini. */
export const ALTEZZA_RIGA = 40;

export interface Riquadro {
  id: string;
  titolo: string;
  /** Larghezza e altezza iniziali, in celle. */
  w: number;
  h: number;
  /** Sotto queste misure il contenuto diventa illeggibile: la griglia non lascia scendere. */
  minW: number;
  minH: number;
  /**
   * Chi lo vede. Assente = tutti.
   * Non è una guardia di sicurezza: i dati dentro sono già protetti dalla RLS
   * e dai controlli delle rispettive query. Serve a non proporre a un video
   * maker un riquadro che per lui sarebbe sempre vuoto.
   */
  ruoli?: string[];
  /** Fuori dalla disposizione iniziale: c'è, ma va aggiunto a mano. */
  spentoDiDefault?: boolean;
}

/**
 * L'ordine di questo elenco è la disposizione predefinita, dall'alto in
 * basso.
 *
 * Le altezze sono strette apposta. La prima versione le aveva generose e il
 * risultato erano vuoti larghi fra un riquadro e l'altro: la cella era alta
 * il doppio del suo contenuto. Meglio partire corti — allargare un riquadro
 * è un gesto, accorgersi che lo spazio vuoto è dentro al riquadro e non fra
 * i riquadri non lo è. Cambiare l'ordine qui cambia solo la partenza — chi si è già
 * sistemato i riquadri non se li vede spostare.
 */
export const RIQUADRI: Riquadro[] = [
  { id: 'timbratura', titolo: 'Timbratura', w: 12, h: 3, minW: 4, minH: 3 },
  { id: 'numeri', titolo: 'I numeri', w: 12, h: 3, minW: 4, minH: 3 },
  { id: 'ped', titolo: 'Scadenze piani editoriali', w: 12, h: 5, minW: 4, minH: 4,
    ruoli: ['admin', 'social_media_manager'] },
  { id: 'rinnovi', titolo: 'Rinnovi siti', w: 12, h: 4, minW: 4, minH: 4, ruoli: ['admin'] },
  { id: 'urgenti', titolo: 'Task urgenti', w: 8, h: 5, minW: 4, minH: 4 },
  { id: 'mie-task', titolo: 'Le mie task', w: 8, h: 6, minW: 4, minH: 4 },
  { id: 'progetti', titolo: 'Progetti', w: 8, h: 5, minW: 4, minH: 4 },
  { id: 'ferie', titolo: 'Ferie da approvare', w: 4, h: 4, minW: 3, minH: 3, ruoli: ['admin'] },
  { id: 'presenze-team', titolo: 'Presenze del team', w: 4, h: 4, minW: 3, minH: 3, ruoli: ['admin'] },
  { id: 'assenti', titolo: 'Assenti oggi', w: 4, h: 3, minW: 3, minH: 3, ruoli: ['admin'] },
  { id: 'team', titolo: 'Il team', w: 4, h: 5, minW: 3, minH: 3, ruoli: ['admin'] },
  { id: 'attivita', titolo: 'Attività recenti', w: 4, h: 6, minW: 3, minH: 4 },
];

export const riquadroPerId = (id: string): Riquadro | undefined =>
  RIQUADRI.find((r) => r.id === id);

/** I riquadri che ha senso proporre a questo ruolo. */
export function riquadriPerRuolo(ruolo: string | null | undefined): Riquadro[] {
  return RIQUADRI.filter((r) => !r.ruoli || r.ruoli.includes(ruolo ?? ''));
}

export interface PostoRiquadro { i: string; x: number; y: number; w: number; h: number }

export interface DisposizioneSalvata {
  riquadri: PostoRiquadro[];
  spenti: string[];
}

/**
 * La disposizione di partenza: i riquadri incolonnati nell'ordine di RIQUADRI,
 * quelli larghi 8 con accanto i loro vicini stretti — cioè l'impaginazione che
 * la dashboard aveva prima che diventasse spostabile.
 */
export function disposizionePredefinita(ruolo: string | null | undefined): PostoRiquadro[] {
  const disponibili = riquadriPerRuolo(ruolo).filter((r) => !r.spentoDiDefault);
  const posti: PostoRiquadro[] = [];
  let y = 0;
  // Quanto è già occupato sulla destra: i riquadri stretti si affiancano ai
  // larghi invece di finire tutti in fondo.
  let yDestra = 0;

  for (const r of disponibili) {
    if (r.w >= COLONNE) {
      y = Math.max(y, yDestra);
      posti.push({ i: r.id, x: 0, y, w: r.w, h: r.h });
      y += r.h;
      yDestra = y;
    } else if (r.w > COLONNE / 2) {
      posti.push({ i: r.id, x: 0, y, w: r.w, h: r.h });
      y += r.h;
    } else {
      posti.push({ i: r.id, x: COLONNE - r.w, y: yDestra, w: r.w, h: r.h });
      yDestra += r.h;
    }
  }
  return posti;
}

/**
 * Ripulisce quello che arriva dal database.
 *
 * Serve perché i riquadri cambiano col codice e la disposizione no: chi si è
 * sistemato la dashboard a marzo può avere in memoria un riquadro che non
 * esiste più, e può non avere quello aggiunto a giugno. Senza questo passaggio
 * il primo darebbe un buco vuoto e il secondo non comparirebbe mai.
 */
export function normalizza(
  salvata: unknown,
  ruolo: string | null | undefined,
): DisposizioneSalvata {
  const ammessi = new Set(riquadriPerRuolo(ruolo).map((r) => r.id));
  const dati = (salvata ?? {}) as Partial<DisposizioneSalvata>;

  const posti = Array.isArray(dati.riquadri) ? dati.riquadri : [];
  const validi = posti.filter(
    (p): p is PostoRiquadro =>
      !!p && typeof p.i === 'string' && ammessi.has(p.i) &&
      [p.x, p.y, p.w, p.h].every((n) => typeof n === 'number' && Number.isFinite(n)),
  );

  const spenti = (Array.isArray(dati.spenti) ? dati.spenti : []).filter(
    (id): id is string => typeof id === 'string' && ammessi.has(id),
  );

  // Mai visto prima: parte dalla disposizione predefinita.
  if (validi.length === 0 && spenti.length === 0) {
    return { riquadri: disposizionePredefinita(ruolo), spenti: [] };
  }

  // Un riquadro nuovo, aggiunto al codice dopo l'ultimo salvataggio, va messo
  // in fondo invece di sparire. In fondo e non in mezzo: spostare i riquadri
  // di qualcuno senza che l'abbia chiesto è peggio che farglielo trovare giù.
  const gia = new Set([...validi.map((p) => p.i), ...spenti]);
  const mancanti = riquadriPerRuolo(ruolo).filter((r) => !gia.has(r.id) && !r.spentoDiDefault);
  let yFondo = validi.reduce((max, p) => Math.max(max, p.y + p.h), 0);
  for (const r of mancanti) {
    validi.push({ i: r.id, x: 0, y: yFondo, w: r.w, h: r.h });
    yFondo += r.h;
  }

  return { riquadri: validi, spenti };
}
