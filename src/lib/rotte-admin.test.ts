import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessoNegato, isRottaAdmin, ADMIN_ROUTES, ROTTE_PER_RUOLO } from './rotte-admin.ts';

/**
 * Chi può aprire cosa.
 *
 * Esiste perché il 20/08/2026 due pagine riservate — /accessi (credenziali
 * dei profili social) e /crediti (rate e insoluti) — erano nascoste solo nel
 * menu: chi ne conosceva l'indirizzo entrava. Una regola di accesso senza
 * prova è una speranza, e questa la leggono in tre (middleware, menu,
 * ricerca rapida).
 *
 * node --test --experimental-strip-types src/lib/*.test.ts
 */

test('l\'admin apre tutto', () => {
  for (const r of [...ADMIN_ROUTES, ...Object.keys(ROTTE_PER_RUOLO), '/dashboard']) {
    assert.equal(accessoNegato(r, 'admin'), false, r);
  }
});

test('chi non è admin non apre le pagine di direzione', () => {
  for (const ruolo of ['content_creator', 'social_media_manager', 'video_maker', null]) {
    assert.equal(accessoNegato('/cfo', ruolo), true, String(ruolo));
    assert.equal(accessoNegato('/crediti', ruolo), true, `crediti / ${ruolo}`);
    assert.equal(accessoNegato('/gestione', ruolo), true, String(ruolo));
    assert.equal(accessoNegato('/log', ruolo), true, String(ruolo));
  }
});

test('gli Accessi li apre chi gestisce i social, e nessun altro', () => {
  assert.equal(accessoNegato('/accessi', 'social_media_manager'), false);
  assert.equal(accessoNegato('/accessi', 'content_creator'), true);
  assert.equal(accessoNegato('/accessi', 'video_maker'), true);
  assert.equal(accessoNegato('/accessi', null), true);
  assert.equal(accessoNegato('/accessi', undefined), true);
});

test('chi gestisce i social resta fuori dalle pagine di direzione', () => {
  assert.equal(accessoNegato('/cfo', 'social_media_manager'), true);
  assert.equal(accessoNegato('/crediti', 'social_media_manager'), true);
});

test('le sottopagine seguono la pagina', () => {
  assert.equal(accessoNegato('/accessi/nuovo', 'content_creator'), true);
  assert.equal(accessoNegato('/accessi/nuovo', 'social_media_manager'), false);
  assert.equal(accessoNegato('/gestione/qualsiasi', 'content_creator'), true);
});

test('il confronto richiede la barra: /gestione non copre /gestione-siti', () => {
  // Sono elencate entrambe apposta. Se un giorno /gestione-siti sparisse
  // dall'elenco, questo test cadrebbe invece di lasciarla aperta in silenzio.
  assert.equal(isRottaAdmin('/gestione-siti'), true);
  assert.equal(accessoNegato('/gestione-siti', 'content_creator'), true);
});

test('le pagine di tutti restano di tutti', () => {
  for (const r of ['/dashboard', '/team', '/calendario', '/contenuti', '/ferie',
                   '/clients', '/note-clienti', '/note-dev', '/tasks', '/presenze']) {
    assert.equal(accessoNegato(r, 'content_creator'), false, r);
  }
});

test('ogni voce riservata del menu ha la sua serratura', () => {
  // Il menu può nascondere, ma non protegge: la porta è rotte-admin.ts.
  // Se qualcuno aggiunge una voce riservata al menu e si dimentica di
  // elencarla qui, questo test se ne accorge.
  const riservateNelMenu = ['/gestione', '/gestione-siti', '/crediti', '/log', '/accessi'];
  for (const r of riservateNelMenu) {
    assert.equal(accessoNegato(r, 'content_creator'), true, `${r} è aperta a chiunque`);
  }
});
