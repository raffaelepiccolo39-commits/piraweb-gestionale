import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova della migration 20260818m: la salute dei clienti smette di misurare
 * `updated_at` — che dice quando abbiamo toccato la riga — e misura i fatti.
 *
 * Si costruisce lo scenario esatto che ha rivelato il difetto: una task
 * consegnata IN TEMPO e archiviata settimane dopo la scadenza. Con la
 * vecchia logica risulta in ritardo, con la nuova no. E un cliente fermo da
 * mesi le cui task sono state archiviate ieri non deve sembrare vivo.
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

await db.exec(`
  DO $$ BEGIN CREATE TYPE contract_status AS ENUM ('active','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, client_id UUID REFERENCES clients(id),
    created_by UUID REFERENCES profiles(id)
  );
  CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status task_status NOT NULL DEFAULT 'todo',
    deadline DATE,
    estimated_hours NUMERIC(5,1),
    logged_hours NUMERIC(7,2) DEFAULT 0,
    completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE client_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    monthly_fee NUMERIC(10,2) NOT NULL,
    duration_months INTEGER NOT NULL,
    start_date DATE NOT NULL,
    status contract_status NOT NULL DEFAULT 'active',
    created_by UUID NOT NULL REFERENCES profiles(id)
  );
  CREATE TABLE client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    month_index INTEGER NOT NULL, due_date DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL, is_paid BOOLEAN NOT NULL DEFAULT false
  );
`);

const ADMIN = '11111111-1111-1111-1111-111111111111';
await db.query(`SELECT set_config('test.uid', $1, false)`, [ADMIN]);

/** Un cliente col suo progetto. */
async function cliente(nome) {
  const { rows: [c] } = await db.query(
    `INSERT INTO clients (name, created_by) VALUES ($1, $2) RETURNING id`, [nome, ADMIN]);
  const { rows: [p] } = await db.query(
    `INSERT INTO projects (name, client_id, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [`Progetto ${nome}`, c.id, ADMIN]);
  return { clienteId: c.id, progettoId: p.id };
}

// ── Puntuale: consegnata in tempo, archiviata molto dopo ────
const puntuale = await cliente('Puntuale');
await db.query(
  `INSERT INTO tasks (title, project_id, status, deadline, completed_at, archived_at, created_at, updated_at)
   VALUES ('Consegna in tempo', $1, 'done',
           (now() - interval '40 days')::date,   -- scadenza
           now() - interval '45 days',           -- consegnata PRIMA
           now() - interval '3 days',            -- archiviata molto dopo
           now() - interval '60 days',
           now() - interval '3 days')`, [puntuale.progettoId]);

// ── Ritardataria: consegnata davvero dopo la scadenza ───────
const tardi = await cliente('Ritardataria');
await db.query(
  `INSERT INTO tasks (title, project_id, status, deadline, completed_at, created_at, updated_at)
   VALUES ('Consegna in ritardo', $1, 'done',
           (now() - interval '40 days')::date,
           now() - interval '20 days',           -- consegnata DOPO
           now() - interval '60 days', now() - interval '20 days')`, [tardi.progettoId]);

// ── Ferma: nessun lavoro da mesi, ma archiviata ieri ────────
const ferma = await cliente('Ferma da mesi');
await db.query(
  `INSERT INTO tasks (title, project_id, status, deadline, completed_at, archived_at, created_at, updated_at)
   VALUES ('Vecchio lavoro', $1, 'done', (now() - interval '200 days')::date,
           now() - interval '200 days', now() - interval '1 day',
           now() - interval '220 days', now() - interval '1 day')`, [ferma.progettoId]);

// ── Sconosciuto: nessuna rata, nessuna task ─────────────────
const sconosciuto = await cliente('Mai iniziato');

const salute = async () => {
  const { rows } = await db.query(`SELECT * FROM calculate_all_clients_health()`);
  return Object.fromEntries(rows.map((r) => [r.client_id, r]));
};

console.log('\n=== Com\'era prima (logica su updated_at) ===');
await db.exec(readFileSync(`${MIG}/20260718e_all_clients_health.sql`, 'utf8'));
const prima = await salute();
verifica('la task puntuale risulta IN RITARDO: consegne 0',
  prima[puntuale.clienteId].delivery_score === 0,
  `consegne ${prima[puntuale.clienteId].delivery_score}`);
verifica('il cliente fermo da mesi sembra attivissimo: attività 25',
  prima[ferma.clienteId].engagement_score === 25,
  `attività ${prima[ferma.clienteId].engagement_score}`);

console.log('\n=== La migration ===');
try {
  await db.exec(readFileSync(`${MIG}/20260818m_salute_clienti_su_fatti_veri.sql`, 'utf8'));
  console.log('  ok   eseguita senza errori'); ok++;
} catch (e) { console.log('  KO  ', e.message); ko++; }

console.log('\n=== Dopo ===');
const dopo = await salute();

verifica('la task puntuale ora conta come consegnata in tempo: consegne 25',
  dopo[puntuale.clienteId].delivery_score === 25,
  `consegne ${dopo[puntuale.clienteId].delivery_score}`);
verifica('la ritardataria resta in ritardo: consegne 0',
  dopo[tardi.clienteId].delivery_score === 0,
  `consegne ${dopo[tardi.clienteId].delivery_score}`);
verifica('il cliente fermo non sembra più vivo: attività 3',
  dopo[ferma.clienteId].engagement_score === 3,
  `attività ${dopo[ferma.clienteId].engagement_score}`);
verifica('chi non ha dati viene dichiarato tale',
  dopo[sconosciuto.clienteId].senza_dati === true,
  JSON.stringify(dopo[sconosciuto.clienteId]));
verifica('chi ha dati NON viene dichiarato senza dati',
  dopo[puntuale.clienteId].senza_dati === false && dopo[tardi.clienteId].senza_dati === false);

// I pesi e le soglie non devono essere cambiati
verifica('i pagamenti restano su 25 quando non c\'è nulla di scaduto',
  dopo[puntuale.clienteId].payment_score === 25);
verifica('il punteggio resta la somma dei quattro criteri',
  dopo[tardi.clienteId].health_score ===
    dopo[tardi.clienteId].payment_score + dopo[tardi.clienteId].delivery_score
    + dopo[tardi.clienteId].budget_score + dopo[tardi.clienteId].engagement_score);

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
