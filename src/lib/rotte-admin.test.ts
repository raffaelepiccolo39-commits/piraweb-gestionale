import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessoNegato, isRottaAdmin, rottaRiservata, ADMIN_ROUTES, ROTTE_PER_RUOLO } from './rotte-admin.ts';

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
                   '/note-clienti', '/note-dev', '/tasks', '/presenze',
                   // Scadenze PED: nel menu di tutti dal 21-08-2026. La data
                   // la cambiano solo admin e social, ma il limite sta nel
                   // database (set_ped_coverage), non nella porta: il team
                   // deve poter leggere cosa scade.
                   '/scadenze-ped']) {
    assert.equal(accessoNegato(r, 'content_creator'), false, r);
  }
});

test('Clienti e\' fuori dal menu ma la pagina resta aperta: e\' voluto', () => {
  // Il 21/08/2026 il referente ha tolto Clienti dal menu del team e ha
  // chiesto esplicitamente di non toccare altro: la scheda cliente porta
  // materiali, messaggi, idee, libreria asset e knowledge base, che il team
  // usa ogni giorno. Nascosta nel menu, aperta nell'indirizzo.
  //
  // Questo test esiste per impedire la "correzione" sbagliata: chi domani
  // vedesse Clienti nascosta e non protetta potrebbe crederlo un buco come
  // quelli di /accessi e /crediti, e chiuderla — togliendo al team mezzo
  // lavoro. Se un giorno va chiusa davvero, si cancella questo test
  // apposta, non per sbaglio.
  for (const ruolo of ['content_creator', 'social_media_manager', 'video_maker']) {
    assert.equal(accessoNegato('/clients', ruolo), false, ruolo);
    assert.equal(accessoNegato('/clients/scheda', ruolo), false, ruolo);
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

test('rottaRiservata dice quando serve leggere il ruolo dal database', () => {
  // Il middleware la usa per NON leggere il profilo a ogni clic: se qui
  // scappasse un false su una pagina riservata, la guardia non scatterebbe
  // perche' il ruolo non verrebbe nemmeno letto. E' la parte pericolosa
  // dell'ottimizzazione, quindi va fissata.
  for (const r of [...ADMIN_ROUTES, ...Object.keys(ROTTE_PER_RUOLO)]) {
    assert.equal(rottaRiservata(r), true, r);
  }
  for (const r of ['/dashboard', '/tasks', '/calendario', '/contenuti', '/clients',
                   '/scadenze-ped', '/ferie', '/presenze', '/note-dev']) {
    assert.equal(rottaRiservata(r), false, r);
  }
});

test('rottaRiservata copre anche le sottopagine', () => {
  assert.equal(rottaRiservata('/cfo/qualsiasi'), true);
  assert.equal(rottaRiservata('/accessi/nuovo'), true);
  assert.equal(rottaRiservata('/tasks/scheda'), false);
});
