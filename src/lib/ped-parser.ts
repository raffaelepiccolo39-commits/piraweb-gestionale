/**
 * Lettura di un piano editoriale da CSV o PDF.
 *
 * Il CSV (export di Notion) è esatto: i campi sono dati, non interpretazione.
 * Il PDF è il ripiego per i piani che non passano da Notion — funziona bene
 * ma va sempre riletto prima di creare i contenuti.
 *
 * Le regole del PDF qui sotto NON sono ipotesi: vengono da un piano vero
 * (Maestri Cotonieri, agosto 2026) su cui sono state sbagliate due volte
 * prima di trovare quelle giuste. Sono annotate una per una.
 */

export type FormatoPed = 'post' | 'reel' | 'storia' | 'carosello';

export interface RigaPed {
  /** ISO, YYYY-MM-DD */
  data: string;
  formato: FormatoPed;
  /** Didascalia completa, così come sta nel piano */
  copy: string;
  /** Solo dal PDF: l'immagine trovata nella riga */
  immagine?: Blob;
  /** Segnalato all'utente quando qualcosa non torna */
  avviso?: string;
}

const MESI: Record<string, number> = {
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6,
  lug: 7, ago: 8, set: 9, sett: 9, ott: 10, nov: 11, dic: 12,
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

/** Riconosce "14 ago 2026", "14/08/2026", "2026-08-14". */
export function leggiData(testo: string): string | null {
  const t = testo.trim().toLowerCase();

  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const esteso = t.match(/(\d{1,2})\s+([a-zà]+)\.?\s+(\d{4})/);
  if (esteso && MESI[esteso[2]]) {
    return `${esteso[3]}-${String(MESI[esteso[2]]).padStart(2, '0')}-${esteso[1].padStart(2, '0')}`;
  }

  const barre = t.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (barre) {
    const anno = barre[3].length === 2 ? `20${barre[3]}` : barre[3];
    return `${anno}-${barre[2].padStart(2, '0')}-${barre[1].padStart(2, '0')}`;
  }
  return null;
}

export function leggiFormato(testo: string): FormatoPed {
  const t = testo.toLowerCase();
  if (t.includes('reel') || t.includes('video')) return 'reel';
  if (t.includes('storia') || t.includes('stories')) return 'storia';
  if (t.includes('carosello') || t.includes('carousel')) return 'carosello';
  return 'post';
}

/**
 * Toglie gli a capo dell'impaginazione, tiene i capoversi.
 *
 * Nel PDF ogni riga va a capo alla larghezza della colonna: incollata su
 * Instagram, la didascalia risulterebbe spezzata a metà frase. Le bandierine
 * e il separatore restano su una riga loro, come nel piano.
 */
export function ricompatta(testo: string): string {
  const fuori: string[] = [];
  for (const blocco of testo.split(/\n\s*\n/)) {
    const righe = blocco.split('\n').map((r) => r.trim()).filter(Boolean);
    let buffer: string[] = [];
    for (const r of righe) {
      if (r.length <= 3) {
        if (buffer.length) { fuori.push(buffer.join(' ')); buffer = []; }
        fuori.push(r);
      } else {
        buffer.push(r);
      }
    }
    if (buffer.length) fuori.push(buffer.join(' '));
  }
  return fuori.join('\n\n').trim();
}

// ─────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────

/** Parser CSV completo: gestisce virgolette, virgole e a capo dentro i campi. */
function celleCsv(testo: string): string[][] {
  const righe: string[][] = [];
  let riga: string[] = [];
  let campo = '';
  let dentroVirgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (dentroVirgolette) {
      if (c === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; }
        else dentroVirgolette = false;
      } else campo += c;
    } else if (c === '"') {
      dentroVirgolette = true;
    } else if (c === ',') {
      riga.push(campo); campo = '';
    } else if (c === '\n') {
      riga.push(campo); righe.push(riga); riga = []; campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  return righe.filter((r) => r.some((c) => c.trim()));
}

export function leggiCsv(testo: string): RigaPed[] {
  const righe = celleCsv(testo);
  if (righe.length < 2) return [];

  const intestazioni = righe[0].map((h) => h.toLowerCase().trim());
  const trova = (...nomi: string[]) =>
    intestazioni.findIndex((h) => nomi.some((n) => h.includes(n)));

  const iData = trova('data', 'date', 'pubblicazione');
  const iCopy = trova('descrizione', 'copy', 'caption', 'testo');
  const iTipo = trova('tipologia', 'formato', 'tipo', 'type');

  const out: RigaPed[] = [];
  for (const r of righe.slice(1)) {
    const data = iData >= 0 ? leggiData(r[iData] || '') : null;
    const copy = (iCopy >= 0 ? r[iCopy] : '') || '';
    if (!data && !copy.trim()) continue;

    out.push({
      data: data || '',
      formato: leggiFormato(iTipo >= 0 ? r[iTipo] || '' : ''),
      copy: copy.trim(),
      avviso: !data ? 'data non riconosciuta' : undefined,
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

// ─────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────

export async function leggiPdf(file: File): Promise<RigaPed[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: RigaPed[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const vista = pagina.getViewport({ scale: 1 });
    const contenuto = await pagina.getTextContent();

    // y misurato dall'alto, per ragionare come si legge.
    // items contiene anche marcatori di struttura senza testo: si tengono
    // solo quelli con `str`, che sono i frammenti veri.
    const voci = contenuto.items
      .flatMap((i) => {
        const t = i as { str?: string; transform?: number[] };
        if (typeof t.str !== 'string' || !t.transform) return [];
        return [{
          testo: t.str,
          x: t.transform[4],
          y: vista.height - t.transform[5],
        }];
      })
      .filter((v) => v.testo.trim());

    // 1. Le righe iniziano dove inizia il copy, NON dove sta la data.
    //    La data e' centrata verticalmente mentre il copy scende piu in
    //    basso: usando le date come confine, gli hashtag di un contenuto
    //    finiscono attaccati al successivo. La bandierina che apre ogni
    //    didascalia e' il delimitatore giusto.
    const inizi = voci
      .filter((v) => /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(v.testo))
      .map((v) => v.y)
      .sort((a, b) => a - b);

    // 2. Data e tipologia stanno nella stessa zona, a destra.
    const marcatori = voci
      .filter((v) => leggiData(v.testo) !== null)
      .map((v) => ({ y: v.y, data: leggiData(v.testo)!, x: v.x }));

    if (marcatori.length === 0) continue;

    for (const m of marcatori) {
      const sopra = inizi.filter((y) => y <= m.y + 40);
      const da = sopra.length ? Math.max(...sopra) - 12 : 0;
      const sotto = inizi.filter((y) => y > m.y + 40);
      const a = sotto.length ? Math.min(...sotto) - 12 : Infinity;

      const dentro = voci.filter((v) => v.y >= da && v.y < a);

      // Colonna di sinistra = didascalia. Il resto sono tipologia, data e
      // i menu a tendina dell'export, che non servono.
      const colonnaCopy = dentro
        .filter((v) => v.x < vista.width * 0.3)
        .sort((x1, x2) => x1.y - x2.y || x1.x - x2.x);

      const formatoVoce = dentro.find((v) => /^(video|post|reel|carosello|storia|stories)$/i.test(v.testo.trim()));

      const copy = ricompatta(colonnaCopy.map((v) => v.testo).join('\n'));

      out.push({
        data: m.data,
        formato: leggiFormato(formatoVoce?.testo || ''),
        copy,
        avviso: copy.length < 40 ? 'didascalia molto corta: controlla' : undefined,
      });
    }
  }

  return out.sort((a, b) => a.data.localeCompare(b.data));
}
