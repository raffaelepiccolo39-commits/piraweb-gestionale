import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Chi vede e chi scrive.
 *
 * Le altre due suite girano da superutente, e da superutente la RLS non
 * scatta: passavano anche con le policy sbagliate. Il 18/08/2026 una prova
 * in produzione con un account content_creator ha mostrato che si potevano
 * attaccare attività a trattative altrui. Questa suite esiste perché quella
 * cosa non torni senza che nessuno se ne accorga.
 *
 * Il trucco è `SET ROLE authenticated`: da lì in poi le policy valgono,
 * esattamente come per una richiesta che arriva dal browser.
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const MIG = resolve(QUI, '..', '..', 'migrations');
const db = await PGlite.create();

for (const f of ['prereq.sql', 'seed.sql']) await db.exec(readFileSync(resolve(QUI, f), 'utf8'));
for (const m of [
  '20260818_crm_enum_valori.sql',
  '20260818b_crm_pipeline.sql',
  '20260818c_crm_followup_proposta.sql',
  '20260818d_crm_sla_primo_contatto.sql',
  '20260818e_crm_kpi.sql',
  '20260818f_crm_permessi_stretti.sql',
]) await db.exec(readFileSync(`${MIG}/${m}`, 'utf8'));

// Su Supabase questi grant ci sono già: il ruolo `authenticated` arriva alle
// tabelle e poi è la RLS a decidere. Qui vanno dati a mano.
await db.exec(`
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
`);

const ADMIN = '11111111-1111-1111-1111-111111111111';
const TEAM  = '22222222-2222-2222-2222-222222222222';  // content_creator, come Manuela
let ok = 0, ko = 0;

const verifica = (nome, cond, dett = '') => {
  if (cond) { console.log(`  ok   ${nome}`); ok++; }
  else { console.log(`  KO   ${nome} ${dett}`); ko++; }
};

/** Esegue una query nei panni di un utente autenticato, con la RLS attiva. */
async function come(utente, sql, params = []) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('test.uid', $1, false)`, [utente]);
  await db.exec('SET ROLE authenticated');
  try {
    const r = await db.query(sql, params);
    return { righe: r.rows, errore: null };
  } catch (e) {
    return { righe: null, errore: e.message };
  } finally {
    await db.exec('RESET ROLE');
  }
}

// Un'opportunità della direzione su cui provare a mettere le mani.
await db.query(`SELECT set_config('test.uid', $1, false)`, [ADMIN]);
const { rows: [dellaDirezione] } = await db.query(
  `INSERT INTO deals (title, company_name, source, owner_id, created_by, prossima_azione, data_prossima_azione)
   VALUES ('Trattativa riservata', 'Riservata Srl', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE)
   RETURNING id`, [ADMIN]);

console.log('\n=== Una dipendente (content_creator) ===');

const lettura = await come(TEAM, 'SELECT id FROM deals');
verifica('non vede nessuna opportunità', lettura.righe?.length === 0,
  `viste ${lettura.righe?.length}`);

const creazione = await come(TEAM,
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione)
   VALUES ('mia', 'inbound', $1, $1, 'x', CURRENT_DATE)`, [TEAM]);
verifica('non può creare opportunità', creazione.errore?.includes('row-level security'),
  String(creazione.errore));

const modifica = await come(TEAM,
  `UPDATE deals SET title = 'INTRUSIONE' WHERE id = $1 RETURNING id`, [dellaDirezione.id]);
verifica('non può modificare quelle della direzione', modifica.righe?.length === 0,
  `righe toccate ${modifica.righe?.length}`);

// La falla vera trovata in produzione.
const attivita = await come(TEAM,
  `INSERT INTO crm_attivita (deal_id, tipo, titolo, owner_id)
   VALUES ($1, 'nota', 'intrusione', $2)`, [dellaDirezione.id, TEAM]);
verifica('non può attaccare attività a trattative altrui',
  attivita.errore?.includes('row-level security'), String(attivita.errore));

const storico = await come(TEAM, 'SELECT id FROM crm_stage_log');
verifica('non vede lo storico degli stage', storico.righe?.length === 0,
  `viste ${storico.righe?.length}`);

const kpi = await come(TEAM, 'SELECT public.crm_kpi(90)');
verifica('non può leggere i KPI', kpi.errore?.includes('Riservato alla direzione'), String(kpi.errore));

// Le tabelle di lookup invece servono a tutto il team e non contengono nulla
// di riservato: etichette degli stage, pesi, festività.
const lookup = await come(TEAM, 'SELECT id FROM crm_stage');
verifica('le etichette degli stage restano leggibili', (lookup.righe?.length ?? 0) === 10,
  `viste ${lookup.righe?.length}`);

const pesi = await come(TEAM, `UPDATE crm_lead_score_pesi SET peso = 99 WHERE campo = 'q_urgenza' RETURNING campo`);
verifica('non può ritoccare i pesi del lead score', pesi.righe?.length === 0,
  `righe toccate ${pesi.righe?.length}`);

console.log('\n=== La direzione ===');

const lettoDaAdmin = await come(ADMIN, 'SELECT id FROM deals');
verifica('vede tutta la pipeline', (lettoDaAdmin.righe?.length ?? 0) > 0,
  `viste ${lettoDaAdmin.righe?.length}`);

const creaAdmin = await come(ADMIN,
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione)
   VALUES ('sua', 'inbound', $1, $1, 'x', CURRENT_DATE) RETURNING id`, [ADMIN]);
verifica('può creare', creaAdmin.righe?.length === 1, String(creaAdmin.errore));

const attivitaAdmin = await come(ADMIN,
  `INSERT INTO crm_attivita (deal_id, tipo, titolo, owner_id)
   VALUES ($1, 'nota', 'nota mia', $2) RETURNING id`, [dellaDirezione.id, ADMIN]);
verifica('può annotare le proprie trattative', attivitaAdmin.righe?.length === 1, String(attivitaAdmin.errore));

const kpiAdmin = await come(ADMIN, 'SELECT public.crm_kpi(90) AS k');
verifica('legge i KPI', !!kpiAdmin.righe?.[0]?.k, String(kpiAdmin.errore));

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
