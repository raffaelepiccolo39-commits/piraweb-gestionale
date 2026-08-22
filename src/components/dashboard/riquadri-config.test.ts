import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RIQUADRI, COLONNE, riquadriPerRuolo, disposizionePredefinita, normalizza,
} from './riquadri-config.ts';

/**
 * Qui si decide se una persona si ritrova la dashboard che si e' sistemata.
 * Gli errori di questo file non danno errori a schermo: danno riquadri
 * spariti, o doppi, o tornati al loro posto di partenza senza motivo.
 */

test('ogni riquadro ha un id unico', () => {
  const ids = RIQUADRI.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('nessun riquadro nasce piu\' stretto del suo minimo', () => {
  for (const r of RIQUADRI) {
    assert.ok(r.w >= r.minW, `${r.id}: w ${r.w} < minW ${r.minW}`);
    assert.ok(r.h >= r.minH, `${r.id}: h ${r.h} < minH ${r.minH}`);
    assert.ok(r.w <= COLONNE, `${r.id} e' piu' largo della griglia`);
  }
});

test('il ruolo filtra: un video maker non vede i riquadri di direzione', () => {
  const suoi = riquadriPerRuolo('video_maker').map((r) => r.id);
  assert.ok(!suoi.includes('ferie'));
  assert.ok(!suoi.includes('rinnovi'));
  assert.ok(suoi.includes('urgenti'));
  assert.ok(suoi.includes('mie-task'));
  // Il social media manager ha in piu' le scadenze del piano editoriale.
  assert.ok(riquadriPerRuolo('social_media_manager').some((r) => r.id === 'ped'));
  assert.ok(!riquadriPerRuolo('video_maker').some((r) => r.id === 'ped'));
});

test('la disposizione predefinita non sovrappone i riquadri', () => {
  for (const ruolo of ['admin', 'social_media_manager', 'video_maker']) {
    const posti = disposizionePredefinita(ruolo);
    for (let a = 0; a < posti.length; a++) {
      for (let b = a + 1; b < posti.length; b++) {
        const p = posti[a], q = posti[b];
        const sovrapposti =
          p.x < q.x + q.w && q.x < p.x + p.w &&
          p.y < q.y + q.h && q.y < p.y + p.h;
        assert.ok(!sovrapposti, `${ruolo}: ${p.i} e ${q.i} si sovrappongono`);
      }
      assert.ok(posti[a].x + posti[a].w <= COLONNE, `${posti[a].i} sborda`);
    }
  }
});

test('chi non ha mai toccato niente parte dalla disposizione predefinita', () => {
  const d = normalizza(null, 'admin');
  assert.deepEqual(d.riquadri, disposizionePredefinita('admin'));
  assert.deepEqual(d.spenti, []);
});

test('un riquadro che non esiste piu\' viene scartato, non lascia un buco', () => {
  const d = normalizza(
    { riquadri: [{ i: 'riquadro-di-marzo', x: 0, y: 0, w: 4, h: 4 }, { i: 'urgenti', x: 0, y: 4, w: 8, h: 7 }], spenti: [] },
    'admin',
  );
  assert.ok(!d.riquadri.some((p) => p.i === 'riquadro-di-marzo'));
  assert.ok(d.riquadri.some((p) => p.i === 'urgenti'));
});

test('un riquadro aggiunto dopo compare in fondo, non sparisce', () => {
  // Disposizione vecchia: solo due riquadri salvati.
  const d = normalizza({ riquadri: [{ i: 'urgenti', x: 0, y: 0, w: 8, h: 7 }], spenti: [] }, 'admin');
  const ids = d.riquadri.map((p) => p.i);
  assert.ok(ids.includes('urgenti'));
  // Tutti gli altri suoi riquadri devono esserci, aggiunti sotto.
  for (const r of riquadriPerRuolo('admin')) assert.ok(ids.includes(r.id), `manca ${r.id}`);
  const urgenti = d.riquadri.find((p) => p.i === 'urgenti')!;
  for (const p of d.riquadri) {
    if (p.i !== 'urgenti') assert.ok(p.y >= urgenti.y, `${p.i} e' finito sopra a urgenti`);
  }
});

test('un riquadro spento resta spento, e non riappare come "nuovo"', () => {
  const d = normalizza(
    { riquadri: disposizionePredefinita('admin').filter((p) => p.i !== 'attivita'), spenti: ['attivita'] },
    'admin',
  );
  assert.deepEqual(d.spenti, ['attivita']);
  assert.ok(!d.riquadri.some((p) => p.i === 'attivita'));
});

test('non si tiene la disposizione di un ruolo che non e\' piu\' il tuo', () => {
  // Chi era admin e non lo e' piu' non deve conservare i riquadri riservati.
  const daAdmin = { riquadri: disposizionePredefinita('admin'), spenti: [] };
  const d = normalizza(daAdmin, 'video_maker');
  assert.ok(!d.riquadri.some((p) => ['ferie', 'rinnovi', 'team', 'presenze-team'].includes(p.i)));
});

test('spazzatura nel database non rompe la pagina', () => {
  for (const brutto of [undefined, null, 'ciao', 42, [], { riquadri: 'no' }, { riquadri: [null, {}, { i: 5 }] }]) {
    const d = normalizza(brutto, 'admin');
    assert.ok(Array.isArray(d.riquadri) && d.riquadri.length > 0);
    assert.ok(Array.isArray(d.spenti));
  }
});
