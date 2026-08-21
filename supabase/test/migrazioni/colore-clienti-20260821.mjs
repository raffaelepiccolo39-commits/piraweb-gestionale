import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova della migration 20260821, che dà un colore a ogni cliente.
 *
 * La colonna in sé non può sbagliare. Quello che può sbagliare è il
 * RIEMPIMENTO, ed è l'unica cosa che rende utile la migration: se i colori
 * non fossero distribuiti, i clienti resterebbero indistinguibili come
 * prima e la modifica sarebbe inutile pur essendo "riuscita".
 *
 * Si controlla quindi che: i colori vengano assegnati a tutti, che due
 * clienti vicini nell'elenco non abbiano lo stesso colore, e che chi un
 * colore ce l'aveva già non se lo veda cambiare.
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const MIG = resolve(QUI, '..', '..', 'migrations');
const TEST = resolve(QUI, '..', 'crm');
const db = await PGlite.create();

let ok = 0, ko = 0;
const verifica = (nome, cond, dett = '') => {
  if (cond) { console.log(`  ok   ${nome}`); ok++; }
  else { console.log(`  KO   ${nome} ${dett}`); ko++; }
};

for (const f of ['prereq.sql', 'seed.sql']) await db.exec(readFileSync(resolve(TEST, f), 'utf8'));

// Venti clienti, uno dei quali ha già un colore scelto a mano.
const nomi = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango'];
const ADMIN = '11111111-1111-1111-1111-111111111111';
for (const n of nomi) {
  await db.query(
    `INSERT INTO clients (name, company, is_active, created_by) VALUES ($1, $1, true, $2)`, [n, ADMIN]);
}

console.log('\n=== Prima ===');
const { rows: [pre] } = await db.query(`
  SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_name = 'clients' AND column_name = 'color'`);
verifica('la colonna color non esiste ancora', pre.n === 0);

console.log('\n=== La migration ===');
try {
  await db.exec(readFileSync(`${MIG}/20260821_clients_colore.sql`, 'utf8'));
  console.log('  ok   eseguita senza errori'); ok++;
} catch (e) { console.log('  KO  ', e.message); ko++; }

console.log('\n=== Dopo ===');
const { rows: [senza] } = await db.query(`SELECT count(*)::int AS n FROM clients WHERE color IS NULL`);
verifica('nessun cliente è rimasto senza colore', senza.n === 0, `${senza.n} senza`);

const { rows: malformati } = await db.query(
  `SELECT name, color FROM clients WHERE color !~ '^#[0-9a-f]{6}$'`);
verifica('i colori sono esadecimali validi', malformati.length === 0,
  JSON.stringify(malformati.slice(0, 3)));

// Il punto della migration: due clienti consecutivi nell'elenco devono
// distinguersi, altrimenti tanto valeva non farla.
const { rows: ordinati } = await db.query(
  `SELECT COALESCE(company, name) AS etichetta, color FROM clients ORDER BY COALESCE(company, name), id`);
let attaccati = 0;
for (let i = 1; i < ordinati.length; i++) {
  if (ordinati[i].color === ordinati[i - 1].color) attaccati++;
}
verifica('due clienti vicini non hanno lo stesso colore', attaccati === 0, `${attaccati} coppie`);

const { rows: [distinti] } = await db.query(`SELECT count(DISTINCT color)::int AS n FROM clients`);
verifica('sono stati usati tutti e 12 i colori', distinti.n === 12, `usati ${distinti.n}`);

console.log('\n=== Rilanciarla non deve rovinare le scelte fatte ===');
await db.query(`UPDATE clients SET color = '#000000' WHERE name = 'Alfa'`);
await db.exec(readFileSync(`${MIG}/20260821_clients_colore.sql`, 'utf8'));
const { rows: [alfa] } = await db.query(`SELECT color FROM clients WHERE name = 'Alfa'`);
verifica('un colore scelto a mano resta quello', alfa.color === '#000000', alfa.color);

console.log('\n=== Un cliente nuovo ===');
await db.query(
  `INSERT INTO clients (name, company, is_active, created_by) VALUES ('Uniform', 'Uniform', true, $1)`, [ADMIN]);
const { rows: [nuovo] } = await db.query(`SELECT color FROM clients WHERE name = 'Uniform'`);
// Deliberatamente NULL: il colore lo ricava l'applicazione dall'id, così un
// cliente creato dopo la migration non resta invisibile in attesa che
// qualcuno gliene scelga uno.
verifica('nasce senza colore, lo ricava l\'applicazione', nuovo.color === null, String(nuovo.color));

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
