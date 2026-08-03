/**
 * Invio a iPhone e iPad, parlando direttamente con APNs.
 *
 * Nessuna libreria: serve un JWT firmato ES256 con la chiave .p8 del team e
 * una richiesta HTTP/2. Il token vale un'ora (Apple lo rifiuta se piu' vecchio
 * di 60 minuti e se piu' recente di 20 secondi non lo rigenera), quindi lo si
 * tiene in memoria e si rifa' quando scade.
 *
 * Variabili d'ambiente:
 *   APNS_KEY_ID       ID della chiave (10 caratteri, dato da Apple)
 *   APNS_TEAM_ID      LLR5VGHMCF
 *   APNS_PRIVATE_KEY  contenuto del file .p8, con gli a capo
 *   APNS_HOST         api.push.apple.com (default) oppure
 *                     api.sandbox.push.apple.com per le build da Xcode
 */

import { createSign } from 'node:crypto';
import { connect } from 'node:http2';

const BUNDLE_ID = 'it.piraweb.gestionale';
const SCADENZA_TOKEN_MS = 45 * 60 * 1000; // sotto l'ora, con margine

let tokenInCache: { valore: string; creatoIl: number } | null = null;

function base64url(dato: string | Buffer): string {
  return Buffer.from(dato)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** La chiave nelle variabili d'ambiente arriva spesso con gli \n letterali. */
function chiavePrivata(): string {
  return (process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

export function apnsConfigurato(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && chiavePrivata());
}

function tokenAutorizzazione(): string {
  if (tokenInCache && Date.now() - tokenInCache.creatoIl < SCADENZA_TOKEN_MS) {
    return tokenInCache.valore;
  }

  const intestazione = base64url(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }));
  const corpo = base64url(JSON.stringify({
    iss: process.env.APNS_TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
  }));

  const firma = createSign('SHA256');
  firma.update(`${intestazione}.${corpo}`);
  firma.end();
  // dsaEncoding: APNs vuole la firma "grezza" (r||s), non la forma DER che
  // OpenSSL produrrebbe di default. Sbagliarlo da' un 403 InvalidProviderToken
  // che sembra un problema di chiave e invece e' di formato.
  const parteFirmata = base64url(firma.sign({ key: chiavePrivata(), dsaEncoding: 'ieee-p1363' }));

  const valore = `${intestazione}.${corpo}.${parteFirmata}`;
  tokenInCache = { valore, creatoIl: Date.now() };
  return valore;
}

export interface EsitoInvio {
  ok: boolean;
  /** true quando il dispositivo non esiste piu': la riga va cancellata. */
  tokenMorto: boolean;
  dettaglio?: string;
}

export async function inviaAdApns(
  tokenDispositivo: string,
  contenuto: { titolo: string; testo: string; link?: string | null; badge?: number },
): Promise<EsitoInvio> {
  if (!apnsConfigurato()) return { ok: false, tokenMorto: false, dettaglio: 'APNs non configurato' };

  const host = process.env.APNS_HOST || 'api.push.apple.com';
  const esito = await inviaAllHost(host, tokenDispositivo, contenuto);

  // Un token di una build installata col cavo (o da Xcode) vive nell'ambiente
  // di prova di Apple, e in produzione risulta "BadDeviceToken" — che sembra
  // un token rotto e invece e' solo nell'altra stanza. Si ritenta una volta
  // di la': cosi' una build di sviluppo riceve le push senza dover cambiare
  // configurazione al server, che e' la trappola classica di questo impianto.
  if (!esito.ok && esito.tokenMorto && host === 'api.push.apple.com') {
    const prova = await inviaAllHost('api.sandbox.push.apple.com', tokenDispositivo, contenuto);
    if (prova.ok) return prova;
    // Morto davvero solo se lo dicono entrambi gli ambienti.
    return { ...esito, tokenMorto: prova.tokenMorto };
  }

  return esito;
}

async function inviaAllHost(
  host: string,
  tokenDispositivo: string,
  contenuto: { titolo: string; testo: string; link?: string | null; badge?: number },
): Promise<EsitoInvio> {
  const sessione = connect(`https://${host}`);

  const corpo = JSON.stringify({
    aps: {
      alert: { title: contenuto.titolo, body: contenuto.testo },
      sound: 'default',
      ...(contenuto.badge != null ? { badge: contenuto.badge } : {}),
    },
    link: contenuto.link ?? null,
  });

  try {
    return await new Promise<EsitoInvio>((risolvi) => {
      const richiesta = sessione.request({
        ':method': 'POST',
        ':path': `/3/device/${tokenDispositivo}`,
        authorization: `bearer ${tokenAutorizzazione()}`,
        'apns-topic': BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });

      let stato = 0;
      let risposta = '';

      richiesta.on('response', (intestazioni) => { stato = Number(intestazioni[':status']) || 0; });
      richiesta.on('data', (pezzo) => { risposta += pezzo; });
      richiesta.on('error', (err) => risolvi({ ok: false, tokenMorto: false, dettaglio: String(err) }));
      richiesta.on('end', () => {
        // 410 = dispositivo sparito. 400 con BadDeviceToken = token non valido
        // per questo ambiente (tipico se si mescolano build Xcode e TestFlight).
        const morto = stato === 410 || (stato === 400 && /BadDeviceToken|Unregistered/.test(risposta));
        risolvi({
          ok: stato === 200,
          tokenMorto: morto,
          dettaglio: stato === 200 ? undefined : `${stato} ${risposta}`.trim(),
        });
      });

      richiesta.setTimeout(10_000, () => {
        richiesta.close();
        risolvi({ ok: false, tokenMorto: false, dettaglio: 'timeout APNs' });
      });

      richiesta.end(corpo);
    });
  } finally {
    sessione.close();
  }
}
