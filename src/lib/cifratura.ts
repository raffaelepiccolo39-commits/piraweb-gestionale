/**
 * Cifratura delle password conservate nell'archivio accessi.
 *
 * AES-256-GCM con una chiave che vive solo tra le variabili d'ambiente del
 * server: nel database finisce testo illeggibile, e chi si porta via un
 * backup non si porta via le password dei clienti.
 *
 * ⚠️ Se `CREDENTIALS_KEY` va persa, le password diventano irrecuperabili.
 * Non e' un difetto: e' cosa significa cifrare. Va custodita dove si tiene
 * il keystore Android e la chiave APNs.
 *
 * GCM e non CBC perche' autentica il testo cifrato: se qualcuno modifica una
 * riga nel database, la decifratura fallisce invece di restituire spazzatura
 * che sembra una password.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';

function chiave(): Buffer | null {
  const grezza = process.env.CREDENTIALS_KEY;
  if (!grezza) return null;

  const buf = Buffer.from(grezza, 'base64');
  // 32 byte = 256 bit. Una chiave piu' corta farebbe fallire createCipheriv
  // con un errore oscuro: meglio dirlo qui.
  return buf.length === 32 ? buf : null;
}

export function cifraturaConfigurata(): boolean {
  return chiave() !== null;
}

/**
 * Restituisce `iv:tag:testocifrato`, tutto in base64. I tre pezzi servono
 * tutti per rileggere: l'iv perche' cambia a ogni cifratura (due password
 * uguali non devono produrre lo stesso testo), il tag per accorgersi delle
 * manomissioni.
 */
export function cifra(testo: string): string {
  const k = chiave();
  if (!k) throw new Error('CREDENTIALS_KEY non configurata: impossibile salvare una password');
  if (!testo) return '';

  const iv = randomBytes(12);
  const cifratore = createCipheriv(ALGORITMO, k, iv);
  const cifrato = Buffer.concat([cifratore.update(testo, 'utf8'), cifratore.final()]);
  const tag = cifratore.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${cifrato.toString('base64')}`;
}

/**
 * Torna al testo in chiaro. Se qualcosa non torna — chiave sbagliata, riga
 * manomessa, formato vecchio — restituisce null invece di sollevare: una
 * password illeggibile non deve far fallire l'intera pagina degli accessi.
 */
export function decifra(salvato: string | null | undefined): string | null {
  if (!salvato) return null;

  const k = chiave();
  if (!k) return null;

  try {
    const [iv, tag, corpo] = salvato.split(':');
    if (!iv || !tag || !corpo) return null;

    const decifratore = createDecipheriv(ALGORITMO, k, Buffer.from(iv, 'base64'));
    decifratore.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
      decifratore.update(Buffer.from(corpo, 'base64')),
      decifratore.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
