/**
 * Prova firmata di "ho superato la 2FA".
 *
 * Prima il cookie `2fa_verified` conteneva l'user.id in chiaro e durava un
 * anno: un valore che l'utente stesso conosce (e' il `sub` del suo JWT), quindi
 * chi rubava la sessione poteva scriverselo da solo e saltare il secondo
 * fattore senza generare alcun codice. Ora il cookie e' `exp.firma`, dove la
 * firma e' un HMAC che solo il server puo' produrre: falsificarlo richiede la
 * chiave segreta, e la prova scade in ore invece che in un anno.
 *
 * Web Crypto (non node:crypto): il middleware gira su Edge, dove Buffer e
 * node:crypto non esistono.
 */

// Durata della prova: coincide con una giornata di lavoro. Alla scadenza si
// rifa il codice — molto meglio del vecchio anno intero.
export const TFA_TTL_SEC = 60 * 60 * 24;

// La chiave HMAC deriva dal service role (segreto forte, gia' presente sul
// server sia nel middleware sia nelle route): niente nuova env da mettere su
// Vercel. Il suffisso separa questo uso da qualunque altro.
function materialeChiave(): string {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('SUPABASE_SERVICE_ROLE_KEY mancante');
  return `${base}:2fa-cookie`;
}

async function hmacHex(messaggio: string): Promise<string> {
  const enc = new TextEncoder();
  const chiave = await crypto.subtle.importKey(
    'raw',
    enc.encode(materialeChiave()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', chiave, enc.encode(messaggio));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confronto a tempo costante di due stringhe hex della stessa forma. */
function stessaFirma(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Valore da mettere nel cookie dopo un codice TOTP valido. */
export async function firmaProvaTfa(userId: string, nowMs: number): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + TFA_TTL_SEC;
  const firma = await hmacHex(`${userId}.${exp}`);
  return `${exp}.${firma}`;
}

/** True se il cookie e' una prova valida e non scaduta per QUESTO utente. */
export async function provaTfaValida(valore: string | undefined, userId: string, nowMs: number): Promise<boolean> {
  if (!valore) return false;
  const punto = valore.indexOf('.');
  if (punto <= 0) return false;

  const exp = Number(valore.slice(0, punto));
  const firma = valore.slice(punto + 1);
  if (!Number.isFinite(exp) || !firma) return false;
  if (exp < Math.floor(nowMs / 1000)) return false; // scaduta

  const attesa = await hmacHex(`${userId}.${exp}`);
  return stessaFirma(firma, attesa);
}
