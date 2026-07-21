'use client';

import { useEffect, useState } from 'react';

/**
 * Il logo del cliente, ritagliato dai suoi margini vuoti.
 *
 * Nasce da un caso reale: il logo di un cliente era un PNG 2160×3840 — un
 * formato da schermo di telefono — con il marchio piccolo al centro e il
 * resto bianco. Dentro un riquadro quadrato con object-contain diventava un
 * puntino invisibile, e sembrava che il logo non ci fosse.
 *
 * Non è un file sbagliato: ogni cliente consegna il logo come gli pare —
 * quadrato, largo, con o senza margini. Ritagliare al volo è l'unico modo
 * per farli stare tutti bene senza rilavorarli a mano uno per uno.
 *
 * Se il ritaglio non riesce (immagine da un'origine che non lo consente),
 * si mostra il file com'è: meglio un logo piccolo che nessun logo.
 */
export function LogoCliente({
  url,
  nome,
  className = '',
}: {
  url: string | null;
  nome: string;
  className?: string;
}) {
  const [ritagliato, setRitagliato] = useState<string | null>(null);
  const [fallito, setFallito] = useState(false);

  useEffect(() => {
    if (!url) return;
    let annullato = false;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // Su immagini enormi il ritaglio pixel per pixel costerebbe troppo:
        // si analizza una copia ridotta e si riporta il risultato in scala.
        const max = 400;
        const scala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scala);
        const h = Math.round(img.height * scala);

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas non disponibile');
        ctx.drawImage(img, 0, 0, w, h);

        const dati = ctx.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const alpha = dati[i + 3];
            // Si considera "vuoto" ciò che è trasparente o quasi bianco:
            // sono i due modi in cui i loghi arrivano contornati.
            const quasiBianco = dati[i] > 244 && dati[i + 1] > 244 && dati[i + 2] > 244;
            if (alpha > 12 && !quasiBianco) {
              if (x < x0) x0 = x;
              if (y < y0) y0 = y;
              if (x > x1) x1 = x;
              if (y > y1) y1 = y;
            }
          }
        }

        // Niente da ritagliare (o immagine tutta piena): si tiene l'originale.
        if (x1 < 0 || (x1 - x0 > w * 0.92 && y1 - y0 > h * 0.92)) {
          if (!annullato) setFallito(true);
          return;
        }

        // Un filo di margine, o il logo tocca i bordi del riquadro.
        const margine = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
        const cx = Math.max(0, x0 - margine);
        const cy = Math.max(0, y0 - margine);
        const cw = Math.min(w - cx, x1 - x0 + margine * 2);
        const ch = Math.min(h - cy, y1 - y0 + margine * 2);

        // Si ritaglia dall'ORIGINALE, non dalla copia ridotta: la qualità
        // deve restare quella del file caricato.
        const inv = 1 / scala;
        const finale = document.createElement('canvas');
        finale.width = Math.round(cw * inv);
        finale.height = Math.round(ch * inv);
        const ctx2 = finale.getContext('2d');
        if (!ctx2) throw new Error('canvas non disponibile');
        ctx2.drawImage(
          img,
          Math.round(cx * inv), Math.round(cy * inv),
          Math.round(cw * inv), Math.round(ch * inv),
          0, 0, finale.width, finale.height
        );

        if (!annullato) setRitagliato(finale.toDataURL('image/png'));
      } catch {
        if (!annullato) setFallito(true);
      }
    };
    img.onerror = () => { if (!annullato) setFallito(true); };
    img.src = url;

    return () => { annullato = true; };
  }, [url]);

  if (!url) {
    return (
      <span className="text-xl font-bold text-[var(--pw-navy)]">
        {nome.charAt(0).toUpperCase()}
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ritagliato || url} alt={nome} className={className} />;
}
