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

interface VocePdf { testo: string; x: number; y: number }

/** Il lato lungo massimo delle foto estratte: nel PDF sono anche 4000px. */
const MAX_LATO = 1600;

/** Prodotto di due matrici PDF, nell'ordine in cui le applica il disegno. */
function componi(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/**
 * Dove finisce la colonna della didascalia.
 *
 * Non una frazione fissa della larghezza: su un piano vero (Quadrifoglio) la
 * colonna del canale cadeva dentro il 30% e i suoi "IG, FB & TikTok"
 * finivano in mezzo al testo. Le colonne di una tabella sono separate da
 * spazi vuoti larghi, quindi il confine sta al primo salto grosso fra le x.
 */
function confineColonnaCopy(voci: VocePdf[]): number {
  const xs = [...new Set(voci.map((v) => Math.round(v.x)))].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > 60) return (xs[i] + xs[i - 1]) / 2;
  }
  return Infinity;
}

interface ImmaginePdf { nome: string; alto: number; basso: number; presa: boolean }

/** Le immagini disegnate nella pagina, con la fascia verticale che occupano. */
async function immaginiDellaPagina(
  pagina: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }> },
  altezza: number,
  OPS: Record<string, number>,
): Promise<ImmaginePdf[]> {
  const lista = await pagina.getOperatorList();
  const fuori: ImmaginePdf[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pila: number[][] = [];

  for (let i = 0; i < lista.fnArray.length; i++) {
    const fn = lista.fnArray[i];
    if (fn === OPS.save) pila.push(ctm.slice());
    else if (fn === OPS.restore) ctm = pila.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = componi(ctm, lista.argsArray[i] as number[]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      // L'immagine è disegnata in un quadrato unitario e poi trasformata:
      // il centro vero è la matrice applicata a (0.5, 0.5).
      const centro = altezza - (ctm[1] * 0.5 + ctm[3] * 0.5 + ctm[5]);
      const alta = Math.abs(ctm[3]);
      fuori.push({
        nome: String((lista.argsArray[i] as unknown[])[0]),
        alto: centro - alta / 2,
        basso: centro + alta / 2,
        presa: false,
      });
    }
  }
  return fuori;
}

/** Converte l'immagine grezza di pdf.js in un JPEG, rimpicciolita. */
async function immagineInBlob(
  pagina: { objs: { get: (n: string, cb: (o: unknown) => void) => void } },
  nome: string,
): Promise<Blob | undefined> {
  try {
    const oggetto = await new Promise<unknown>((r) => pagina.objs.get(nome, r));
    const o = oggetto as {
      width?: number; height?: number; data?: Uint8ClampedArray | Uint8Array;
      bitmap?: ImageBitmap;
    };

    const larga = o.bitmap?.width ?? o.width ?? 0;
    const alta = o.bitmap?.height ?? o.height ?? 0;
    if (!larga || !alta) return undefined;

    const scala = Math.min(1, MAX_LATO / Math.max(larga, alta));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(larga * scala));
    canvas.height = Math.max(1, Math.round(alta * scala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    if (o.bitmap) {
      ctx.drawImage(o.bitmap, 0, 0, canvas.width, canvas.height);
    } else if (o.data) {
      // I dati arrivano a 1, 3 o 4 canali: ImageData ne vuole 4.
      const canali = o.data.length / (larga * alta);
      const rgba = new Uint8ClampedArray(larga * alta * 4);
      for (let p = 0; p < larga * alta; p++) {
        const s = p * canali;
        const d = p * 4;
        if (canali >= 3) {
          rgba[d] = o.data[s]; rgba[d + 1] = o.data[s + 1]; rgba[d + 2] = o.data[s + 2];
          rgba[d + 3] = canali === 4 ? o.data[s + 3] : 255;
        } else {
          rgba[d] = rgba[d + 1] = rgba[d + 2] = o.data[s];
          rgba[d + 3] = 255;
        }
      }
      // Passa da un canvas a grandezza naturale, poi rimpicciolisce.
      const pieno = document.createElement('canvas');
      pieno.width = larga; pieno.height = alta;
      pieno.getContext('2d')?.putImageData(new ImageData(rgba, larga, alta), 0, 0);
      ctx.drawImage(pieno, 0, 0, canvas.width, canvas.height);
    } else {
      return undefined;
    }

    return await new Promise<Blob | undefined>((r) =>
      canvas.toBlob((b) => r(b ?? undefined), 'image/jpeg', 0.85),
    );
  } catch {
    // Una foto illeggibile non deve far saltare l'importazione del piano.
    return undefined;
  }
}

/**
 * Legge un piano editoriale in PDF: date, didascalie, formato e le foto.
 *
 * Le righe si delimitano a metà strada fra una data e la successiva. La data
 * è centrata verticalmente nella sua riga, quindi il punto di mezzo cade
 * nello spazio bianco fra due contenuti: la didascalia che scende sotto la
 * propria data resta dalla parte giusta, e gli hashtag non finiscono
 * appiccicati al contenuto dopo.
 *
 * La versione precedente cercava invece una coppia di emoji bandiera come
 * inizio di ogni didascalia — regola presa da un piano solo (Maestri
 * Cotonieri). Su un piano senza bandierine non trovava nessun confine e
 * assegnava a OGNI data l'intera pagina: 23 contenuti con la stessa
 * didascalia, intestazione compresa. Le date invece ci sono sempre, perché
 * sono ciò che rende un piano un piano.
 */
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
    const voci: VocePdf[] = contenuto.items
      .flatMap((i) => {
        const t = i as { str?: string; transform?: number[] };
        if (typeof t.str !== 'string' || !t.transform) return [];
        return [{ testo: t.str, x: t.transform[4], y: vista.height - t.transform[5] }];
      })
      .filter((v) => v.testo.trim());
    if (!voci.length) continue;

    const limiteCopy = confineColonnaCopy(voci);

    const date = voci
      .flatMap((v) => {
        const d = leggiData(v.testo);
        return d ? [{ y: v.y, data: d }] : [];
      })
      .sort((a, b) => a.y - b.y);
    if (!date.length) continue;

    // Quanto è alta una riga: mediana delle distanze fra date consecutive.
    // Serve solo a chiudere la prima e l'ultima, che non hanno una vicina
    // da un lato. Con una data sola si tiene tutta la pagina.
    const passi = date.slice(1).map((d, i) => d.y - date[i].y).sort((a, b) => a - b);
    const passo = passi.length ? passi[Math.floor(passi.length / 2)] : vista.height * 2;

    const immagini = await immaginiDellaPagina(pagina, vista.height, pdfjs.OPS as unknown as Record<string, number>);

    for (let i = 0; i < date.length; i++) {
      const da = i === 0 ? date[i].y - passo / 2 : (date[i - 1].y + date[i].y) / 2;
      const a = i === date.length - 1 ? date[i].y + passo / 2 : (date[i].y + date[i + 1].y) / 2;

      const dentro = voci.filter((v) => v.y >= da && v.y < a);
      const colonnaCopy = dentro
        .filter((v) => v.x < limiteCopy)
        .sort((p, q) => p.y - q.y || p.x - q.x);

      const formatoVoce = dentro.find((v) => /^(video|post|reel|carosello|storia|stories)$/i.test(v.testo.trim()));
      const copy = ricompatta(colonnaCopy.map((v) => v.testo).join('\n'));

      // Non "il centro dell'immagine cade nella riga": una foto più alta
      // delle altre ha il centro spostato e resterebbe orfana. Vince quella
      // che si sovrappone di più, e ognuna si usa una volta sola.
      let scelta: ImmaginePdf | null = null;
      let meglio = 0;
      for (const im of immagini) {
        if (im.presa) continue;
        const sovrapposta = Math.min(a, im.basso) - Math.max(da, im.alto);
        if (sovrapposta > meglio) { meglio = sovrapposta; scelta = im; }
      }
      if (scelta) scelta.presa = true;

      out.push({
        data: date[i].data,
        formato: leggiFormato(formatoVoce?.testo || ''),
        copy,
        immagine: scelta ? await immagineInBlob(pagina, scelta.nome) : undefined,
        avviso: copy.length < 40 ? 'didascalia molto corta: controlla' : undefined,
      });
    }
  }

  return out.sort((a, b) => a.data.localeCompare(b.data));
}
