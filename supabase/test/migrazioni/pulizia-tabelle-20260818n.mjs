import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova della migration 20260818n, che elimina le tabelle morte.
 *
 * Di una pulizia irreversibile contano due cose in egual misura: che
 * sparisca quello che deve sparire, e che RESTI tutto il resto. La seconda
 * è quella che fa danni se sbagliata — `festivita` e `recurring_tasks`
 * sembrano morte e invece le usano funzioni del database, e `business_control`
 * contiene un piano ricavi scritto a mano.
 *
 * Si ricostruiscono anche le chiavi esterne, perché l'ordine dei DROP è
 * l'unica cosa che può far fallire questa migration.
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

// Le tabelle da eliminare, con le chiavi esterne che hanno in produzione.
await db.exec(`
  CREATE TABLE chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL
  );
  CREATE TABLE chat_channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id),
    user_id UUID NOT NULL REFERENCES profiles(id)
  );
  CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id),
    author_id UUID REFERENCES profiles(id), body TEXT
  );

  CREATE TABLE deal_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deals(id), file_name TEXT
  );

  CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT
  );
  CREATE TABLE post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id), body TEXT
  );
  CREATE TABLE post_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id), emoji TEXT
  );

  CREATE TABLE user_totp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id), secret TEXT, enabled BOOLEAN
  );

  CREATE TABLE "app ufficio" (id UUID PRIMARY KEY DEFAULT gen_random_uuid());

  CREATE VIEW v_client_open_installments AS SELECT id FROM clients WHERE false;
  CREATE VIEW v_project_payment_summary AS SELECT id FROM clients WHERE false;

  -- Le policy incrociate della chat, come in produzione (00021 e 00030):
  -- quella su chat_channels interroga chat_channel_members, che a sua volta
  -- ha una chiave esterna verso chat_channels. Si tengono in ostaggio a
  -- vicenda, ed è esattamente ciò che ha fatto fallire la prima versione
  -- della migration nel SQL Editor.
  ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
  ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can view their channels" ON chat_channels FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = id AND user_id = auth.uid()));
  CREATE POLICY "Users can view channel members" ON chat_channel_members FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM chat_channel_members cm WHERE cm.channel_id = chat_channel_members.channel_id AND cm.user_id = auth.uid()));

  -- La funzione orfana del vecchio CRM: il suo trigger è già stato tolto.
  CREATE OR REPLACE FUNCTION log_deal_stage_change() RETURNS TRIGGER
    LANGUAGE plpgsql AS $fn$ BEGIN RETURN NEW; END $fn$;
`);

// Quelle che NON devono essere toccate, benché sembrino morte.
await db.exec(`
  CREATE TABLE festivita (data DATE PRIMARY KEY, descrizione TEXT NOT NULL);
  CREATE TABLE recurring_tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT);
  CREATE TABLE installment_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), action TEXT);
  CREATE TABLE business_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INT, section TEXT, label TEXT, months JSONB
  );
  CREATE TABLE social_posts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT);

  CREATE OR REPLACE FUNCTION generate_recurring_tasks() RETURNS int
    LANGUAGE sql AS $fn$ SELECT count(*)::int FROM recurring_tasks $fn$;
`);

// Dati veri dentro le tabelle che stiamo per buttare: se l'ordine dei DROP
// fosse sbagliato, le chiavi esterne lo farebbero fallire proprio qui.
const ADMIN = '11111111-1111-1111-1111-111111111111';
await db.query(`INSERT INTO chat_channels (id, name) VALUES ('00000000-0000-0000-0000-0000000000c1', 'generale')`);
await db.query(`INSERT INTO chat_channel_members (channel_id, user_id) VALUES ('00000000-0000-0000-0000-0000000000c1', $1)`, [ADMIN]);
await db.query(`INSERT INTO chat_messages (channel_id, author_id, body) VALUES ('00000000-0000-0000-0000-0000000000c1', $1, 'ciao')`, [ADMIN]);
await db.query(`INSERT INTO posts (id, title) VALUES ('00000000-0000-0000-0000-0000000000p1'::uuid, 'x')`).catch(() => {});
await db.query(`INSERT INTO business_control (year, section, label, months) VALUES (2026, 'ricavi_agenzia', 'E-Commerce One Shot', '[0,0,0]')`);
await db.query(`INSERT INTO festivita (data, descrizione) VALUES ('2026-12-25', 'Natale')`);

const esiste = async (nome) => {
  const r = await db.query(`SELECT to_regclass($1) AS t`, [nome]);
  return r.rows[0].t !== null;
};

const DA_ELIMINARE = ['chat_messages', 'chat_channel_members', 'chat_channels', 'deal_activities',
  'deal_files', 'posts', 'post_comments', 'post_reactions', 'user_totp',
  'v_client_open_installments', 'v_project_payment_summary', 'app ufficio'];
const DA_TENERE = ['festivita', 'recurring_tasks', 'installment_logs', 'business_control',
  'social_posts', 'deals', 'clients', 'profiles'];

console.log('\n=== Prima ===');
const prima = [];
for (const t of DA_ELIMINARE) if (await esiste(`public."${t}"`)) prima.push(t);
verifica(`le ${DA_ELIMINARE.length} da eliminare ci sono tutte`, prima.length === DA_ELIMINARE.length,
  `mancano: ${DA_ELIMINARE.filter((t) => !prima.includes(t)).join(', ')}`);

console.log('\n=== La migration ===');
try {
  await db.exec(readFileSync(`${MIG}/20260818n_pulizia_tabelle_morte.sql`, 'utf8'));
  console.log('  ok   eseguita senza errori (ordine delle chiavi esterne corretto)'); ok++;
} catch (e) { console.log('  KO  ', e.message); ko++; }

console.log('\n=== Dopo: quello che doveva sparire ===');
const rimaste = [];
for (const t of DA_ELIMINARE) if (await esiste(`public."${t}"`)) rimaste.push(t);
verifica('nessuna sopravvive', rimaste.length === 0, `rimaste: ${rimaste.join(', ')}`);

const { rows: fn } = await db.query(`SELECT 1 FROM pg_proc WHERE proname = 'log_deal_stage_change'`);
verifica('la funzione orfana del vecchio CRM è sparita', fn.length === 0);

console.log('\n=== Dopo: quello che NON doveva essere toccato ===');
for (const t of DA_TENERE) {
  verifica(`${t} è intatta`, await esiste(`public."${t}"`));
}

const { rows: [bc] } = await db.query(`SELECT count(*)::int AS n FROM business_control`);
verifica('il piano ricavi ha ancora le sue righe', bc.n === 1, `${bc.n} righe`);

const { rows: [rt] } = await db.query(`SELECT generate_recurring_tasks() AS n`);
verifica('generate_recurring_tasks() funziona ancora', rt.n === 0, String(rt.n));

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
