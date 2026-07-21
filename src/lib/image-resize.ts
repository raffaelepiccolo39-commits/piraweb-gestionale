/**
 * Ridimensiona le immagini nel browser, prima di caricarle.
 *
 * Non è un'ottimizzazione facoltativa, sono tre vincoli reali:
 *
 * 1. Instagram, via Graph API, rifiuta le immagini oltre 8 MB. Caricare
 *    l'originale da 40 MB di uno shooting non servirebbe: la pubblicazione
 *    fallirebbe comunque, e più tardi, quando è più difficile capire perché.
 * 2. Quelle foto le scarica il CLIENTE nella griglia del portale, spesso da
 *    telefono e in mobilità. Venti scatti a piena risoluzione sono centinaia
 *    di megabyte.
 * 3. Caricare 40 MB da una connessione normale richiede minuti, durante i
 *    quali sembra che il gestionale sia bloccato.
 *
 * A 2048px di lato lungo un JPEG di qualità alta pesa 1-3 MB e su Instagram
 * resta indistinguibile dall'originale: la piattaforma ricomprime comunque.
 */

/** Oltre questo lato l'immagine viene rimpicciolita. */
const MAX_LATO = 2048;

/** Sotto questa soglia un file va bene com'è: non lo si ricomprime per nulla. */
const SOGLIA_INTATTO = 2 * 1024 * 1024;

/** Limite di sicurezza su ciò che accettiamo in ingresso. */
export const MAX_INGRESSO_MB = 50;

export interface RisultatoResize {
  file: File;
  originale: number;
  finale: number;
  ridotta: boolean;
}

function leggiImmagine(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('immagine illeggibile')); };
    img.src = url;
  });
}

function suCanvas(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas non disponibile');
  // Sfondo bianco: un PNG con trasparenza convertito in JPEG avrebbe
  // altrimenti il fondo nero.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function versoBlob(canvas: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
}

/**
 * Restituisce il file da caricare: l'originale se già piccolo, altrimenti
 * una versione ridotta. Se qualcosa va storto tiene l'originale — meglio
 * caricare un file pesante che non caricarlo affatto.
 */
export async function preparaImmagine(file: File): Promise<RisultatoResize> {
  const originale = file.size;
  const intatto: RisultatoResize = { file, originale, finale: originale, ridotta: false };

  if (!file.type.startsWith('image/')) return intatto;

  try {
    const img = await leggiImmagine(file);
    const latoLungo = Math.max(img.width, img.height);

    // Già piccola e leggera: si lascia com'è.
    if (originale <= SOGLIA_INTATTO && latoLungo <= MAX_LATO) return intatto;

    const scala = latoLungo > MAX_LATO ? MAX_LATO / latoLungo : 1;
    const canvas = suCanvas(img, Math.round(img.width * scala), Math.round(img.height * scala));

    // Si parte da una qualità alta e si scende solo se serve davvero.
    let blob: Blob | null = null;
    for (const q of [0.88, 0.78, 0.65]) {
      blob = await versoBlob(canvas, q);
      if (blob && blob.size <= 4 * 1024 * 1024) break;
    }
    if (!blob || blob.size >= originale) return intatto;

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return {
      file: new File([blob], nome, { type: 'image/jpeg' }),
      originale,
      finale: blob.size,
      ridotta: true,
    };
  } catch {
    return intatto;
  }
}

export function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
