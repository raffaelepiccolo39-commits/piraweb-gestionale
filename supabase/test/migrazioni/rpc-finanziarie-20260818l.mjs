import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova della migration 20260818l: rimette la guardia del secondo fattore
 * sulle RPC finanziarie e insegna loro a ignorare le mensilità sospese.
 *
 * Due cose da dimostrare, non da dare per buone:
 *   1. senza secondo fattore le funzioni rifiutano, e col messaggio giusto —
 *      è il messaggio che ha permesso di scoprire che la 20260814g non era
 *      mai andata in produzione;
 *   2. una rata sospesa sparisce dai conti. Si costruisce un contratto vero,
 *      si guarda il cashflow, si sospende un mese e si riguarda.
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

  ALTER TABLE clients ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

  CREATE TABLE client_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    monthly_fee NUMERIC(10,2) NOT NULL,
    duration_months INTEGER NOT NULL CHECK (duration_months IN (6, 12)),
    start_date DATE NOT NULL,
    status contract_status NOT NULL DEFAULT 'active',
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    month_index INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT false,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(contract_id, month_index)
  );
  CREATE TABLE payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('paid','unpaid')),
    amount NUMERIC(10,2) NOT NULL,
    month_index INTEGER NOT NULL,
    due_date DATE NOT NULL,
    performed_by UUID NOT NULL REFERENCES profiles(id),
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE employee_compensation (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id),
    salary NUMERIC(10,2), contract_type TEXT, contract_start_date DATE
  );
  CREATE TABLE payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month DATE NOT NULL, lordo_mensile NUMERIC(10,2)
  );
  CREATE TABLE operating_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, category TEXT, amount NUMERIC(10,2),
    is_recurring BOOLEAN DEFAULT true, frequency TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
  );

  -- auth.jwt(): in produzione porta il livello di autenticazione. Qui lo
  -- pilotano i test tramite una variabile.
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT jsonb_build_object('aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal1'));
  $fn$;
`);

const ADMIN = '11111111-1111-1111-1111-111111111111';
await db.query(`SELECT set_config('test.uid', $1, false)`, [ADMIN]);

// Contratto da 6 mesi a 500 €, tutte le rate del 2026
const { rows: [cliente] } = await db.query(
  `INSERT INTO clients (name, created_by) VALUES ('Cliente Conti', $1) RETURNING id`, [ADMIN]);
const { rows: [contratto] } = await db.query(
  `INSERT INTO client_contracts (client_id, monthly_fee, duration_months, start_date, created_by)
   VALUES ($1, 500, 6, '2026-01-01', $2) RETURNING id`, [cliente.id, ADMIN]);
await db.query(
  `INSERT INTO client_payments (contract_id, month_index, due_date, amount, is_paid)
   SELECT $1, i, (DATE '2026-01-01' + ((i - 1) || ' months')::interval)::date, 500, false
   FROM generate_series(1, 6) AS i`, [contratto.id]);

// Prima la sospensione, poi le funzioni finanziarie: stesso ordine della produzione
await db.exec(readFileSync(`${MIG}/20260818i_sospensione_mensilita.sql`, 'utf8'));

console.log('\n=== La migration ===');
try {
  await db.exec(readFileSync(`${MIG}/20260818l_rpc_finanziarie_2fa_e_sospensioni.sql`, 'utf8'));
  console.log('  ok   eseguita senza errori'); ok++;
} catch (e) { console.log('  KO  ', e.message); ko++; }

console.log('\n=== La guardia del secondo fattore ===');
const guardate = ['get_cashflow_summary', 'get_cashflow_monthly', 'get_revenue_per_client',
                  'get_monthly_expenses', 'get_profit_loss_summary'];

await db.query(`SELECT set_config('test.aal', 'aal1', false)`);   // admin senza 2FA
for (const f of guardate) {
  let messaggio = null;
  try { await db.query(`SELECT * FROM ${f}()`); } catch (e) { messaggio = e.message; }
  verifica(`${f} rifiuta senza 2FA, col messaggio giusto`,
    !!messaggio && messaggio.includes('due passaggi (2FA)'), String(messaggio));
}

await db.query(`SELECT set_config('test.aal', 'aal2', false)`);   // admin col 2FA
for (const f of guardate) {
  let errore = null;
  try { await db.query(`SELECT * FROM ${f}()`); } catch (e) { errore = e.message; }
  verifica(`${f} risponde con il 2FA`, errore === null, String(errore));
}

console.log('\n=== I conti, prima e dopo una sospensione ===');
const cashflow = async () => {
  const { rows: [r] } = await db.query(
    `SELECT total_expected FROM get_cashflow_summary('2026-01-01', '2026-12-31')`);
  return Number(r.total_expected);
};

const prima = await cashflow();
verifica('atteso di partenza: 6 mesi × 500 = 3000 €', prima === 3000, `${prima} €`);

const { rows: [terza] } = await db.query(
  `SELECT id FROM client_payments WHERE contract_id = $1 AND month_index = 3`, [contratto.id]);
await db.query(`SELECT toggle_payment_suspended($1, $2, 'pausa concordata')`, [terza.id, ADMIN]);

const dopo = await cashflow();
verifica('sospeso un mese, l\'atteso NON conta quella rata',
  dopo === prima, `prima ${prima} €, dopo ${dopo} €`);

const { rows: [conteggio] } = await db.query(
  `SELECT count(*)::int AS n FROM client_payments WHERE contract_id = $1 AND is_suspended = false`,
  [contratto.id]);
verifica('perché una rata è stata aggiunta in coda a compensare', conteggio.n === 6, `${conteggio.n} rate dovute`);

const { rows: [ricavi] } = await db.query(
  `SELECT total_expected, months_total FROM get_revenue_per_client('2026-01-01', '2026-12-31') LIMIT 1`);
verifica('anche i ricavi per cliente ignorano la sospesa: 3000 € su 6 mesi',
  Number(ricavi?.total_expected ?? 0) === 3000 && Number(ricavi?.months_total ?? 0) === 6,
  JSON.stringify(ricavi));

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
