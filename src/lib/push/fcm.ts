/**
 * Invio ai telefoni Android, tramite FCM HTTP v1.
 *
 * Google non accetta piu' la vecchia chiave server: serve un token OAuth2
 * ottenuto firmando un JWT con la chiave del service account. Anche qui niente
 * librerie — il token dura un'ora e si tiene in memoria.
 *
 * Variabili d'ambiente (dal file JSON del service account Firebase):
 *   FCM_PROJECT_ID
 *   FCM_CLIENT_EMAIL
 *   FCM_PRIVATE_KEY
 */

import { createSign } from 'node:crypto';
import type { EsitoInvio } from './apns';

const SCADENZA_TOKEN_MS = 45 * 60 * 1000;

let tokenInCache: { valore: string; creatoIl: number } | null = null;

function base64url(dato: string | Buffer): string {
  return Buffer.from(dato)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function chiavePrivata(): string {
  return (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

export function fcmConfigurato(): boolean {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && chiavePrivata());
}

async function tokenAccesso(): Promise<string | null> {
  if (tokenInCache && Date.now() - tokenInCache.creatoIl < SCADENZA_TOKEN_MS) {
    return tokenInCache.valore;
  }

  const adesso = Math.floor(Date.now() / 1000);
  const intestazione = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify({
    iss: process.env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: adesso,
    exp: adesso + 3600,
  }));

  const firma = createSign('RSA-SHA256');
  firma.update(`${intestazione}.${corpo}`);
  firma.end();
  const jwt = `${intestazione}.${corpo}.${base64url(firma.sign(chiavePrivata()))}`;

  const risposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!risposta.ok) return null;
  const dati = await risposta.json();
  if (!dati.access_token) return null;

  tokenInCache = { valore: dati.access_token, creatoIl: Date.now() };
  return dati.access_token;
}

export async function inviaAFcm(
  tokenDispositivo: string,
  contenuto: { titolo: string; testo: string; link?: string | null },
): Promise<EsitoInvio> {
  if (!fcmConfigurato()) return { ok: false, tokenMorto: false, dettaglio: 'FCM non configurato' };

  const accesso = await tokenAccesso();
  if (!accesso) return { ok: false, tokenMorto: false, dettaglio: 'token OAuth non ottenuto' };

  const risposta = await fetch(
    `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accesso}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: tokenDispositivo,
          notification: { title: contenuto.titolo, body: contenuto.testo },
          // I dati viaggiano come stringhe: FCM rifiuta un null secco.
          data: { link: contenuto.link ?? '' },
          android: { priority: 'HIGH' },
        },
      }),
    },
  );

  if (risposta.ok) return { ok: true, tokenMorto: false };

  const testo = await risposta.text();
  // UNREGISTERED = app disinstallata; INVALID_ARGUMENT su un token vuol dire
  // token malformato: in entrambi i casi la riga non serve piu'.
  const morto = risposta.status === 404
    || /UNREGISTERED|NOT_FOUND/.test(testo)
    || (risposta.status === 400 && /token/i.test(testo));

  return { ok: false, tokenMorto: morto, dettaglio: `${risposta.status} ${testo}`.slice(0, 300) };
}
