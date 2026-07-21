/**
 * Le tre viste del piano editoriale: da approvare, in programma, postati.
 *
 * Stanno qui e non nelle pagine perché i numeri della home e l'elenco filtrato
 * devono dire la STESSA cosa. Con due definizioni separate basta una modifica
 * da una parte sola e il cliente legge "3 in programma", tocca, e ne trova
 * quattro — il tipo di errore che fa perdere fiducia in tutto il resto della
 * pagina, non solo in quel numero.
 */

export type FiltroPiano = 'da-approvare' | 'in-programma' | 'postati';

/** Il minimo che serve per decidere in quale vista cade un contenuto. */
export interface PostPiano {
  status: string;
  client_approval: string;
  scheduled_at: string | null;
}

/** Inizio e fine del mese in corso, come stringhe ISO confrontabili. */
export function meseInCorso(adesso: Date = new Date()): { da: string; a: string } {
  return {
    da: new Date(adesso.getFullYear(), adesso.getMonth(), 1).toISOString(),
    a: new Date(adesso.getFullYear(), adesso.getMonth() + 1, 1).toISOString(),
  };
}

/** Gli stati che il cliente può vedere prima della pubblicazione. */
const PRESENTABILI = ['ready', 'scheduled'];

export const FILTRI: Record<FiltroPiano, {
  etichetta: string;
  /** Testo quando il filtro è attivo ma non c'è niente da mostrare. */
  vuoto: string;
  vale: (p: PostPiano, adesso?: Date) => boolean;
}> = {
  'da-approvare': {
    etichetta: 'Da approvare',
    vuoto: 'Non c’è niente in attesa di una tua risposta.',
    vale: (p) => PRESENTABILI.includes(p.status) && p.client_approval === 'pending',
  },
  'in-programma': {
    etichetta: 'In programma',
    vuoto: 'Non c’è ancora niente di approvato in attesa di uscire.',
    vale: (p) => PRESENTABILI.includes(p.status) && p.client_approval === 'approved',
  },
  postati: {
    etichetta: 'Postati',
    vuoto: 'Questo mese non è ancora uscito niente.',
    // Il mese in corso, non tutto lo storico: è il piano di cui si sta
    // parlando adesso. La data è quella di programmazione, che è il piano —
    // published_at può mancare su contenuti segnati pubblicati a mano.
    vale: (p, adesso) => {
      if (p.status !== 'published' || !p.scheduled_at) return false;
      const { da, a } = meseInCorso(adesso);
      return p.scheduled_at >= da && p.scheduled_at < a;
    },
  },
};

/** Il filtro chiesto nell'indirizzo, se è uno di quelli che conosciamo. */
export function filtroValido(valore: string | null): FiltroPiano | null {
  return valore && valore in FILTRI ? (valore as FiltroPiano) : null;
}

export function conta(posts: PostPiano[], filtro: FiltroPiano, adesso?: Date): number {
  return posts.filter((p) => FILTRI[filtro].vale(p, adesso)).length;
}
