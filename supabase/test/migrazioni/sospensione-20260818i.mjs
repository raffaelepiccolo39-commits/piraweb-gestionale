import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova della migration 20260818i, che porta in produzione la sospensione
 * delle mensilità — la parte della 20260716b che non era mai arrivata.
 *
 * Tocca i soldi dei clienti: rate, scadenze e coda del contratto. Qui si
 * costruisce un contratto vero, si sospende un mese e si controlla che il
 * conto torni, invece di fidarsi che il SQL "sembri giusto".
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

// Le tabelle dei contratti come sono in produzione (dalla 00012 e dalla 00013)
await db.exec(`
  DO $$ BEGIN CREATE TYPE contract_status AS ENUM ('active','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE client_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    monthly_fee NUMERIC(10,2) NOT NULL,
    duration_months INTEGER NOT NULL CHECK (duration_months IN (6, 12)),
    start_date DATE NOT NULL,
    status contract_status NOT NULL DEFAULT 'active',
    notes TEXT,
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
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(contract_id, month_index)
  );

  CREATE TABLE payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('paid', 'unpaid')),
    amount NUMERIC(10,2) NOT NULL,
    month_index INTEGER NOT NULL,
    due_date DATE NOT NULL,
    performed_by UUID NOT NULL REFERENCES profiles(id),
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

const ADMIN = '11111111-1111-1111-1111-111111111111';
await db.query(`SELECT set_config('test.uid', $1, false)`, [ADMIN]);

// Un cliente con un contratto da 6 mesi, 500 euro al mese, primo mese pagato
const { rows: [cliente] } = await db.query(
  `INSERT INTO clients (name, created_by) VALUES ('Cliente Prova', $1) RETURNING id`, [ADMIN]);
const { rows: [contratto] } = await db.query(
  `INSERT INTO client_contracts (client_id, monthly_fee, duration_months, start_date, created_by)
   VALUES ($1, 500, 6, '2026-01-01', $2) RETURNING id`, [cliente.id, ADMIN]);
await db.query(
  `INSERT INTO client_payments (contract_id, month_index, due_date, amount, is_paid)
   SELECT $1, i, (DATE '2026-01-01' + ((i - 1) || ' months')::interval)::date, 500, i = 1
   FROM generate_series(1, 6) AS i`, [contratto.id]);

console.log('\n=== Prima: com\'è oggi la produzione ===');
const { rows: [colonnaPrima] } = await db.query(
  `SELECT count(*)::int AS n FROM information_schema.columns
   WHERE table_name = 'client_payments' AND column_name = 'is_suspended'`);
verifica('la colonna is_suspended NON esiste', colonnaPrima.n === 0);

let erroreComeInProduzione = null;
try {
  await db.query(`SELECT amount FROM client_payments WHERE is_suspended = false`);
} catch (e) { erroreComeInProduzione = e.message; }
verifica('la query del CFO fallisce, come in produzione',
  !!erroreComeInProduzione && erroreComeInProduzione.includes('is_suspended'), String(erroreComeInProduzione));

console.log('\n=== La migration ===');
try {
  await db.exec(readFileSync(`${MIG}/20260818i_sospensione_mensilita.sql`, 'utf8'));
  console.log('  ok   eseguita senza errori'); ok++;
} catch (e) { console.log('  KO  ', e.message); ko++; }

console.log('\n=== Dopo ===');
const { rows: cfo } = await db.query(
  `SELECT amount FROM client_payments WHERE is_suspended = false`);
verifica('la query del CFO ora funziona', cfo.length === 6, `${cfo.length} rate`);

const { rows: vincolo } = await db.query(
  `SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_not_paid_and_suspended'`);
verifica('il vincolo "non pagata E sospesa" c\'è', vincolo.length === 1);

for (const f of ['toggle_payment_suspended', 'reconcile_contract_tail', 'toggle_payment_paid', 'get_client_financial_summary']) {
  const { rows } = await db.query(`SELECT 1 FROM pg_proc WHERE proname = $1`, [f]);
  verifica(`la procedura ${f} esiste`, rows.length === 1);
}

console.log('\n=== Il comportamento: si sospende davvero un mese? ===');
const { rows: [terza] } = await db.query(
  `SELECT id, due_date FROM client_payments WHERE contract_id = $1 AND month_index = 3`, [contratto.id]);

await db.query(`SELECT toggle_payment_suspended($1, $2, $3)`, [terza.id, ADMIN, 'cliente in pausa ad agosto']);

const { rows: [dopo] } = await db.query(
  `SELECT is_suspended, suspension_reason FROM client_payments WHERE id = $1`, [terza.id]);
verifica('la terza rata risulta sospesa', dopo.is_suspended === true, JSON.stringify(dopo));
verifica('con il motivo che le è stato dato', dopo.suspension_reason === 'cliente in pausa ad agosto');

const { rows: [conteggio] } = await db.query(
  `SELECT count(*)::int AS dovute FROM client_payments
   WHERE contract_id = $1 AND is_suspended = false`, [contratto.id]);
verifica('restano 6 mensilità dovute: una in coda compensa quella sospesa',
  conteggio.dovute === 6, `dovute ${conteggio.dovute}`);

const { rows: [somma] } = await db.query(
  `SELECT COALESCE(SUM(amount), 0)::numeric AS tot FROM client_payments
   WHERE contract_id = $1 AND is_suspended = false`, [contratto.id]);
verifica('e il totale dovuto resta 3000 €', Number(somma.tot) === 3000, `${somma.tot} €`);

// Il vincolo deve reggere anche a una scrittura diretta
let bloccato = null;
try {
  await db.query(`UPDATE client_payments SET is_paid = true WHERE id = $1`, [terza.id]);
} catch (e) { bloccato = e.message; }
verifica('una rata sospesa non si può segnare come pagata', !!bloccato, String(bloccato));

console.log('\n=== Riattivazione ===');
await db.query(`SELECT toggle_payment_suspended($1, $2, NULL)`, [terza.id, ADMIN]);
const { rows: [riattivata] } = await db.query(
  `SELECT is_suspended FROM client_payments WHERE id = $1`, [terza.id]);
verifica('la rata torna dovuta', riattivata.is_suspended === false);

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
