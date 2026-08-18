import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBenignTransientError } from './errori-benigni.ts';

/**
 * Il messaggio qui sotto è quello vero, copiato dal registro del 18/08/2026.
 * Il filtro conosceva due formulazioni del lock e non questa, quindi per 28
 * giorni ha lasciato passare 9 occorrenze di rumore. Fissarlo alla lettera
 * è l'unico modo perché la terza variante non torni a sfuggire.
 */
const LOCK_VERO =
  'Lock "lock:sb-queboudvijstvpjuacix-auth-token" was released because another request stole it';

test('il lock della sessione, nella formulazione trovata in produzione', () => {
  assert.equal(isBenignTransientError(new Error(LOCK_VERO)), true);
});

test('le altre due formulazioni dello stesso lock', () => {
  assert.equal(isBenignTransientError(new Error('Lock broken by another request')), true);
  assert.equal(isBenignTransientError(new Error("acquiring lock with the 'steal' option")), true);
});

test('i guasti di rete transitori', () => {
  for (const m of ['Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch', 'Network request failed']) {
    assert.equal(isBenignTransientError(new Error(m)), true, m);
  }
});

test('le richieste annullate', () => {
  const e = new Error('The user aborted a request.');
  e.name = 'AbortError';
  assert.equal(isBenignTransientError(e), true);
});

test('un errore vero NON viene silenziato', () => {
  // Il rischio opposto: un filtro troppo largo nasconde i guasti veri. Questi
  // sono errori realmente capitati oggi e devono finire nel registro.
  for (const m of [
    'voceVisibile is not defined',
    'column client_payments.is_suspended does not exist',
    'Accesso non autorizzato: serve la verifica in due passaggi (2FA)',
    'Ogni opportunità aperta deve avere una prossima azione con data',
    'new row violates row-level security policy',
  ]) {
    assert.equal(isBenignTransientError(new Error(m)), false, m);
  }
});

test('regge anche quello che non è un Error', () => {
  assert.equal(isBenignTransientError(LOCK_VERO), true);
  assert.equal(isBenignTransientError({ message: LOCK_VERO }), true);
  assert.equal(isBenignTransientError(null), false);
  assert.equal(isBenignTransientError(undefined), false);
  assert.equal(isBenignTransientError({}), false);
});
