import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coloreCliente, PALETTE_CLIENTI } from './colori-cliente.ts';

/**
 * Il colore di ripiego deve essere STABILE e VARIO: se cambiasse a ogni
 * render il cliente cambierebbe colore sotto gli occhi, e se ricadesse
 * sempre sullo stesso valore avremmo ricreato il difetto di partenza —
 * decine di clienti identici nella bacheca.
 */

test('il colore scelto a mano vince sempre', () => {
  assert.equal(coloreCliente({ id: 'abc', color: '#123456' }), '#123456');
});

test('senza colore lo ricava dall\'id, e non cambia mai', () => {
  const c = coloreCliente({ id: 'e7b1c0de-0000-4000-8000-000000000001' });
  assert.ok(PALETTE_CLIENTI.includes(c as typeof PALETTE_CLIENTI[number]));
  for (let i = 0; i < 50; i++) {
    assert.equal(coloreCliente({ id: 'e7b1c0de-0000-4000-8000-000000000001' }), c);
  }
});

test('id diversi si spargono sulla palette', () => {
  // 60 id realistici: se il ripiego ricadesse su pochi colori, la bacheca
  // tornerebbe indistinguibile proprio per i clienti creati dopo.
  const visti = new Set<string>();
  for (let i = 0; i < 60; i++) {
    visti.add(coloreCliente({ id: `e7b1c0de-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  }
  assert.ok(visti.size >= 8, `usati solo ${visti.size} colori su 12`);
});

test('senza cliente e senza id non esplode', () => {
  assert.ok(coloreCliente(null).startsWith('#'));
  assert.ok(coloreCliente(undefined).startsWith('#'));
  assert.ok(coloreCliente({}).startsWith('#'));
});
