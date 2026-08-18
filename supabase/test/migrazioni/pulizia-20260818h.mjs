import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova della migration 20260818h, quella che elimina i dati di Conformità
 * IA e dei Template.
 *
 * Una migration irreversibile non si consegna senza averla eseguita. Qui si
 * costruisce lo schema com'era, le si dà fuoco e si controllano due cose: che
 * sia sparito tutto quello che doveva sparire, e soprattutto che sia rimasto
 * in piedi quello che non c'entrava — `recurring_tasks` in testa, che il cron
 * giornaliero usa e che nasce dalla STESSA migration dei template.
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

// Lo schema di partenza (profiles, clients, ruoli, is_admin, update_updated_at)
await db.exec(readFileSync(`${TEST}/prereq.sql`, 'utf8'));

// Lo storage di Supabase, ridotto all'osso: la migration tocca policy,
// oggetti e bucket, e senza queste tabelle non si può provare niente.
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets(id), name text, owner uuid
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`);

// I progetti servono alla funzione dei template
await db.exec(`
  CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, status TEXT, color TEXT,
    client_id UUID REFERENCES clients(id), created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

console.log('\n=== Prima: si costruisce quello che va demolito ===');

// Conformità IA: la migration vera
try {
  await db.exec(readFileSync(`${MIG}/20260814d_ai_act.sql`, 'utf8'));
  console.log('  ok   20260814d_ai_act.sql applicata');
  ok++;
} catch (e) {
  console.log('  KO   20260814d_ai_act.sql:', e.message); ko++;
}

// Template: le due tabelle, la funzione e il bucket, nella forma che hanno in produzione
await db.exec(`
  CREATE TABLE project_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, description TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE template_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    title TEXT NOT NULL, position INTEGER DEFAULT 0
  );
  CREATE OR REPLACE FUNCTION create_project_from_template(
    p_template_id UUID, p_project_name TEXT, p_client_id UUID, p_created_by UUID
  ) RETURNS UUID LANGUAGE plpgsql AS $fn$
  DECLARE v_id UUID;
  BEGIN
    INSERT INTO projects (name, client_id, created_by) VALUES (p_project_name, p_client_id, p_created_by)
    RETURNING id INTO v_id;
    RETURN v_id;
  END $fn$;

  INSERT INTO storage.buckets (id, name, public) VALUES ('ai-act-docs', 'ai-act-docs', false);
`);
await db.exec(`
  DROP POLICY IF EXISTS "ai-act-docs read staff" ON storage.objects;
  CREATE POLICY "ai-act-docs read staff" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'ai-act-docs');
  CREATE POLICY "ai-act-docs write admin" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ai-act-docs');
  CREATE POLICY "ai-act-docs delete admin" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'ai-act-docs');
`);
console.log('  ok   template, funzione e bucket creati');
ok++;

// Le ricorrenti, che NON devono essere toccate
await db.exec(`
  CREATE TABLE recurring_tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL);
  CREATE OR REPLACE FUNCTION generate_recurring_tasks() RETURNS int LANGUAGE sql AS $fn$ SELECT 1 $fn$;
`);

const esiste = async (tab) => {
  const r = await db.query(`SELECT to_regclass($1) AS t`, [tab]);
  return r.rows[0].t !== null;
};
const tipoEsiste = async (nome) => {
  const r = await db.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [nome]);
  return r.rows.length > 0;
};

const tabelle = ['ai_systems','ai_generations','client_ai_systems','ai_training_modules',
                 'ai_training_sessions','ai_documents','ai_document_acceptances',
                 'project_templates','template_tasks'];
const presentiPrima = [];
for (const t of tabelle) if (await esiste(`public.${t}`)) presentiPrima.push(t);
verifica(`le ${tabelle.length} tabelle da eliminare esistono`, presentiPrima.length === tabelle.length,
  `presenti ${presentiPrima.length}: ${presentiPrima.join(', ')}`);

console.log('\n=== La migration di pulizia ===');
try {
  await db.exec(readFileSync(`${MIG}/20260818h_pulizia_ai_act_e_template.sql`, 'utf8'));
  console.log('  ok   eseguita senza errori');
  ok++;
} catch (e) {
  console.log('  KO   ', e.message); ko++;
}

console.log('\n=== Dopo ===');
const rimaste = [];
for (const t of tabelle) if (await esiste(`public.${t}`)) rimaste.push(t);
verifica('nessuna delle tabelle sopravvive', rimaste.length === 0, `rimaste: ${rimaste.join(', ')}`);

const tipi = ['ai_role','ai_risk','ai_output_type','ai_label_outcome','ai_document_type','ai_training_status'];
const tipiRimasti = [];
for (const t of tipi) if (await tipoEsiste(t)) tipiRimasti.push(t);
verifica('nessun tipo enum orfano', tipiRimasti.length === 0, `rimasti: ${tipiRimasti.join(', ')}`);

const { rows: fn } = await db.query(
  `SELECT 1 FROM pg_proc WHERE proname = 'create_project_from_template'`);
verifica('la funzione dei template è sparita', fn.length === 0);

const { rows: bucket } = await db.query(`SELECT 1 FROM storage.buckets WHERE id = 'ai-act-docs'`);
verifica('il bucket è sparito', bucket.length === 0);

const { rows: pol } = await db.query(
  `SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'ai-act-docs%'`);
verifica('nessuna policy dello storage rimasta', pol.length === 0, JSON.stringify(pol));

console.log('\n=== Quello che NON doveva essere toccato ===');
verifica('recurring_tasks è intatta', await esiste('public.recurring_tasks'));
const { rows: fn2 } = await db.query(`SELECT 1 FROM pg_proc WHERE proname = 'generate_recurring_tasks'`);
verifica('generate_recurring_tasks è intatta', fn2.length === 1);
verifica('projects è intatta', await esiste('public.projects'));
verifica('clients è intatta', await esiste('public.clients'));
verifica('profiles è intatta', await esiste('public.profiles'));
verifica('storage.objects è intatta', await esiste('storage.objects'));

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
