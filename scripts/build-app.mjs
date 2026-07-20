#!/usr/bin/env node
/**
 * Compila la versione da impacchettare come app iOS/Android.
 *
 * Il sito e l'app nascono dallo STESSO codice: cambia solo come viene
 * compilato. Qui si produce l'esportazione statica che Capacitor infila nel
 * pacchetto, dentro `out/`.
 *
 * Perché uno script e non solo una variabile d'ambiente: in modalità export
 * Next non tollera le route API né il middleware, che qui non servono —
 * restano su Vercel e l'app le chiama da remoto (vedi lib/api-origin.ts).
 * Quindi vengono spostate temporaneamente da parte e rimesse a posto alla
 * fine, anche se il build fallisce.
 *
 *   npm run build:app
 *
 * Richiede NEXT_PUBLIC_API_ORIGIN: l'indirizzo dove girano davvero le API.
 */

import { execSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const PARCHEGGIO = join(root, '.app-build-stash');

// [percorso reale, dove lo mettiamo al riparo]
//
// Nota su `proxy.ts`: in Next 16 il middleware si chiama così, non più
// `middleware.ts`. Cercare il nome vecchio non dà errore — semplicemente non
// trova nulla e il file resta al suo posto.
const DA_ESCLUDERE = [
  [join(root, 'src/app/api'), join(PARCHEGGIO, 'api')],
  [join(root, 'src/proxy.ts'), join(PARCHEGGIO, 'proxy.ts')],
];

function sposta(coppie) {
  for (const [da, a] of coppie) {
    if (existsSync(da)) renameSync(da, a);
  }
}

if (!process.env.NEXT_PUBLIC_API_ORIGIN) {
  console.error('\n  NEXT_PUBLIC_API_ORIGIN non impostato.');
  console.error('  Nel pacchetto le pagine sono file locali: senza questo indirizzo');
  console.error('  le chiamate a /api non saprebbero dove andare.\n');
  console.error('  Esempio: NEXT_PUBLIC_API_ORIGIN=https://gestionale.piraweb.it npm run build:app\n');
  process.exit(1);
}

if (existsSync(PARCHEGGIO)) {
  console.error(`\n  Trovato ${PARCHEGGIO}: un build precedente si è interrotto male.`);
  console.error('  Dentro ci sono src/app/api e src/middleware.ts: rimettili a mano prima di riprovare.\n');
  process.exit(1);
}

let esito = 0;
try {
  execSync(`mkdir -p "${PARCHEGGIO}"`);
  sposta(DA_ESCLUDERE);
  console.log('  API e middleware messi da parte (restano su Vercel)\n');

  execSync('next build', {
    stdio: 'inherit',
    env: { ...process.env, BUILD_TARGET: 'app' },
  });

  console.log('\n  Fatto: i file statici sono in out/');
  console.log('  Passo successivo: npx cap sync\n');
} catch (err) {
  console.error('\n  Build fallito:', err.message);
  esito = 1;
} finally {
  // Rimettere a posto è la parte che non deve mai saltare: se fallisce,
  // il progetto resta senza API e la cosa non sarebbe ovvia.
  sposta(DA_ESCLUDERE.map(([da, a]) => [a, da]));
  rmSync(PARCHEGGIO, { recursive: true, force: true });
  console.log('  API e middleware ripristinati');
}

process.exit(esito);
