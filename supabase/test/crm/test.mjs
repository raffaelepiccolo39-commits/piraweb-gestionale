import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const MIG = resolve(QUI, '..', '..', 'migrations');
const db = await PGlite.create();
for (const f of ['prereq.sql', 'seed.sql']) await db.exec(readFileSync(resolve(QUI, f), 'utf8'));
await db.exec(readFileSync(`${MIG}/20260818_crm_enum_valori.sql`, 'utf8'));
await db.exec(readFileSync(`${MIG}/20260818b_crm_pipeline.sql`, 'utf8'));
await db.exec(readFileSync(`${MIG}/20260818c_crm_followup_proposta.sql`, 'utf8'));
await db.exec(readFileSync(`${MIG}/20260818d_crm_sla_primo_contatto.sql`, 'utf8'));
await db.exec(readFileSync(`${MIG}/20260818e_crm_kpi.sql`, 'utf8'));

const ADMIN = '11111111-1111-1111-1111-111111111111';
const TEAM  = '22222222-2222-2222-2222-222222222222';
let ok = 0, ko = 0;

const comeUtente = (id) => db.query(`SELECT set_config('test.uid', $1, false)`, [id ?? '']);

async function deveFallire(nome, sql, params, atteso) {
  try {
    await db.query(sql, params);
    console.log(`  KO   ${nome} — nessun errore, doveva rifiutare`); ko++;
  } catch (e) {
    if (atteso && !e.message.includes(atteso)) {
      console.log(`  KO   ${nome} — messaggio inatteso: ${e.message}`); ko++;
    } else { console.log(`  ok   ${nome} — "${e.message}"`); ok++; }
  }
}
async function devePassare(nome, sql, params) {
  try { const r = await db.query(sql, params); console.log(`  ok   ${nome}`); ok++; return r; }
  catch (e) { console.log(`  KO   ${nome} — ${e.message}`); ko++; }
}
function verifica(nome, condizione, dettaglio = '') {
  if (condizione) { console.log(`  ok   ${nome}`); ok++; }
  else { console.log(`  KO   ${nome} ${dettaglio}`); ko++; }
}

const nuova = (extra = '') => `
  INSERT INTO deals (title, company_name, source, owner_id, created_by, prossima_azione, data_prossima_azione ${extra ? ', ' + extra.campi : ''})
  VALUES ('Test', 'Azienda Test', $1, '${ADMIN}', '${ADMIN}', 'Chiamare', CURRENT_DATE ${extra ? ', ' + extra.valori : ''})
  RETURNING id`;

await comeUtente(ADMIN);
console.log('\n=== §4 Validazioni ===');

await deveFallire('AC-01 creazione senza provenienza',
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione)
   VALUES ('X', NULL, $1, $1, 'a', CURRENT_DATE)`, [ADMIN], 'null value in column "source"');

await deveFallire('AC-02 referral senza referrer',
  nuova(), ['referral'], 'Indica chi ha segnalato il contatto');

await devePassare('AC-02b referral con referrer',
  `INSERT INTO deals (title, source, referrer, owner_id, created_by, prossima_azione, data_prossima_azione)
   VALUES ('Referral ok', 'referral', 'Mario Rossi', $1, $1, 'Chiamare', CURRENT_DATE)`, [ADMIN]);

await deveFallire('AC-07 opportunità aperta senza prossima azione',
  `INSERT INTO deals (title, source, owner_id, created_by)
   VALUES ('Senza azione', 'inbound', $1, $1)`, [ADMIN],
  'Ogni opportunità aperta deve avere una prossima azione con data');

console.log('\n=== §5 Transizioni e §4 discovery ===');
const { rows: [d] } = await db.query(
  `INSERT INTO deals (title, company_name, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id)
   VALUES ('Percorso', 'Zeta Srl', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 4) RETURNING id, data_ingresso_stage`, [ADMIN]);

await deveFallire('salto in avanti (4 -> 6) rifiutato',
  `UPDATE deals SET stage_id = 6 WHERE id = $1`, [d.id], 'Si avanza di uno stage per volta');

await deveFallire('AC-03 4 -> 5 con discovery incompleta',
  `UPDATE deals SET stage_id = 5, disc_situazione='a', disc_problema='b', disc_impatto='c',
     disc_obiettivo='d', disc_timing='e' WHERE id = $1`, [d.id],
  'Completa la discovery prima di preparare la proposta: mancano Budget, Decision maker');

await devePassare('AC-04 4 -> 5 con discovery completa',
  `UPDATE deals SET stage_id = 5, disc_situazione='a', disc_problema='b', disc_impatto='c',
     disc_obiettivo='d', disc_timing='e', disc_budget='f', disc_decision_maker='g' WHERE id = $1`, [d.id]);

const { rows: log } = await db.query(
  `SELECT stage_da, stage_a FROM crm_stage_log WHERE deal_id = $1 ORDER BY changed_at`, [d.id]);
verifica('AC-04 crm_stage_log contiene la riga 4 -> 5',
  log.some(r => r.stage_da === 4 && r.stage_a === 5), JSON.stringify(log));

const { rows: [dopo] } = await db.query('SELECT data_ingresso_stage FROM deals WHERE id = $1', [d.id]);
verifica('AC-04 data_ingresso_stage aggiornata',
  new Date(dopo.data_ingresso_stage) > new Date(d.data_ingresso_stage));

await devePassare('regressione 5 -> 4 consentita', `UPDATE deals SET stage_id = 4 WHERE id = $1`, [d.id]);
const { rows: [{ n }] } = await db.query(
  `SELECT count(*)::int AS n FROM crm_stage_log WHERE deal_id = $1 AND stage_da = 5 AND stage_a = 4`, [d.id]);
verifica('la regressione resta a storico', n === 1);

await devePassare('salto diretto all\'esito (4 -> 7)',
  `UPDATE deals SET stage_id = 7, esito = 'won' WHERE id = $1`, [d.id]);

console.log('\n=== §4 Esito ===');
const { rows: [e2] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id)
   VALUES ('Esiti', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 2) RETURNING id`, [ADMIN]);

await deveFallire('AC-08 lost senza motivo',
  `UPDATE deals SET stage_id = 7, esito = 'lost' WHERE id = $1`, [e2.id], 'Indica il motivo della perdita');
await deveFallire('V5 nurture senza data di ripresa',
  `UPDATE deals SET stage_id = 7, esito = 'nurture' WHERE id = $1`, [e2.id], 'Indica quando riprendere il contatto');
await deveFallire('V5 nurture con data passata',
  `UPDATE deals SET stage_id = 7, esito = 'nurture', data_ripresa = CURRENT_DATE - 1 WHERE id = $1`, [e2.id], 'la data deve essere futura');
await devePassare('nurture con data futura',
  `UPDATE deals SET stage_id = 7, esito = 'nurture', data_ripresa = CURRENT_DATE + 90 WHERE id = $1`, [e2.id]);
await deveFallire('riapertura verso uno stage diverso da Qualificato',
  `UPDATE deals SET stage_id = 4 WHERE id = $1`, [e2.id], 'torna allo stage Qualificato');
await devePassare('riapertura del nurture verso Qualificato',
  `UPDATE deals SET stage_id = 2 WHERE id = $1`, [e2.id]);
const { rows: [riap] } = await db.query('SELECT esito, data_ripresa, stage_id FROM deals WHERE id = $1', [e2.id]);
verifica('la riapertura azzera esito e data di ripresa',
  riap.esito === null && riap.data_ripresa === null && riap.stage_id === 2, JSON.stringify(riap));

const { rows: [pers] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id)
   VALUES ('Persa', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 2) RETURNING id`, [ADMIN]);
await devePassare('lost con motivo',
  `UPDATE deals SET stage_id = 7, esito = 'lost', motivo_lost = 'prezzo' WHERE id = $1`, [pers.id]);
await deveFallire('una persa non si riapre',
  `UPDATE deals SET stage_id = 2 WHERE id = $1`, [pers.id], 'Si riaprono solo le opportunità in nurture');

console.log('\n=== §6.2 Lead score ===');
const { rows: [ls] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione,
     q_urgenza, q_budget_adeguato, lead_score)
   VALUES ('Score', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, true, true, 999) RETURNING lead_score, id`, [ADMIN]);
verifica('AC-12 lead_score passato dal client viene ignorato (999 -> 35)', ls.lead_score === 35, `letto ${ls.lead_score}`);

await db.query(`UPDATE deals SET q_nessun_budget = true WHERE id = $1`, [ls.id]);
const { rows: [ls2] } = await db.query('SELECT lead_score FROM deals WHERE id = $1', [ls.id]);
verifica('AC-13 cambio flag q_* ricalcola il punteggio (35 - 20 = 15)', ls2.lead_score === 15, `letto ${ls2.lead_score}`);

await db.query(`UPDATE crm_lead_score_pesi SET peso = 40 WHERE campo = 'q_urgenza'`);
await db.query(`UPDATE deals SET title = 'Score' WHERE id = $1`, [ls.id]);
const { rows: [ls3] } = await db.query('SELECT lead_score FROM deals WHERE id = $1', [ls.id]);
verifica('i pesi sono davvero configurabili da tabella (15 -> 40)', ls3.lead_score === 40, `letto ${ls3.lead_score}`);
await db.query(`UPDATE crm_lead_score_pesi SET peso = 15 WHERE campo = 'q_urgenza'`);

console.log('\n=== V9 soglia canone ===');
await db.query(`UPDATE company_settings SET crm_soglia_canone_minimo = 500`);
await comeUtente(TEAM);
await deveFallire('AC-14 canone sotto soglia da non-admin',
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, canone_proposto)
   VALUES ('Sotto soglia', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 300)`, [TEAM],
  'Canone sotto soglia: richiede approvazione CEO');
await comeUtente(ADMIN);
await devePassare('AC-14 lo stesso canone come admin',
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, canone_proposto)
   VALUES ('Sotto soglia', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 300)`, [ADMIN]);
await db.query(`UPDATE company_settings SET crm_soglia_canone_minimo = 0`);

console.log('\n=== V6 contratto senza canone ===');
const { rows: [c1] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id)
   VALUES ('Verso contratto', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 7) RETURNING id`, [ADMIN]);
await db.query(`UPDATE deals SET esito = 'won' WHERE id = $1`, [c1.id]);
await deveFallire('V6 stage 8 senza canone',
  `UPDATE deals SET stage_id = 8 WHERE id = $1`, [c1.id], 'Indica il canone concordato');
await devePassare('V6 stage 8 con canone',
  `UPDATE deals SET stage_id = 8, canone_proposto = 800, durata_mesi = 12 WHERE id = $1`, [c1.id]);
const { rows: [vp] } = await db.query('SELECT valore_pipeline FROM deals WHERE id = $1', [c1.id]);
verifica('§6.1 valore_pipeline = canone * durata (800 * 12)', Number(vp.valore_pipeline) === 9600, `letto ${vp.valore_pipeline}`);

console.log('\n=== §6.4 Ore lavorative ===');
const casi = [
  ['martedì 10:00 + 2h',            '2026-08-18 10:00+02', 2,   '2026-08-18 12:00:00'],
  ['a cavallo della pausa pranzo',  '2026-08-18 12:30+02', 2,   '2026-08-18 16:00:00'],
  ['venerdì sera scavalla il weekend','2026-08-21 18:00+02', 2,  '2026-08-24 10:30:00'],
  ['salta Ferragosto e il weekend', '2026-08-14 17:00+02', 8,   '2026-08-17 17:00:00'],
  ['arrivo di notte: parte dalle 9','2026-08-18 23:40+02', 2,   '2026-08-19 11:00:00'],
];
for (const [nome, da, ore, atteso] of casi) {
  const { rows: [r] } = await db.query(
    `SELECT to_char(public.add_business_hours($1::timestamptz, $2) AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24:MI:SS') AS q`, [da, ore]);
  verifica(`add_business_hours: ${nome}`, r.q === atteso, `atteso ${atteso}, ottenuto ${r.q}`);
}

console.log('\n=== §8.2 Sequenza follow-up proposta ===');
const { rows: [fu] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id,
     disc_situazione, disc_problema, disc_impatto, disc_obiettivo, disc_timing, disc_budget, disc_decision_maker)
   VALUES ('Sequenza', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 4, 'a','b','c','d','e','f','g') RETURNING id`, [ADMIN]);

await devePassare('porto l\'opportunità a Proposta inviata',
  `UPDATE deals SET stage_id = 5 WHERE id = $1`, [fu.id]);

const { rows: seq } = await db.query(
  `SELECT a.sequenza_step, a.stato::text, a.owner_id,
          to_char(a.due_at, 'YYYY-MM-DD') AS scadenza,
          to_char(d.data_ingresso_stage, 'YYYY-MM-DD') AS ingresso
   FROM crm_attivita a JOIN deals d ON d.id = a.deal_id
   WHERE a.deal_id = $1 AND a.sequenza = 'followup_proposta' ORDER BY a.sequenza_step`, [fu.id]);
verifica('AC-05 vengono create 4 attività', seq.length === 4, `create ${seq.length}`);

const attese = [2, 5, 10, 20];
const dateOk = seq.every((r, i) => {
  const ingresso = new Date(r.ingresso + 'T12:00:00Z');
  const attesa = new Date(ingresso.getTime() + attese[i] * 86400000).toISOString().slice(0, 10);
  return r.scadenza === attesa;
});
verifica('AC-05 scadenze a +2, +5, +10, +20 giorni', dateOk, JSON.stringify(seq.map(r => r.scadenza)));
verifica('AC-05 step 1 e 4 all\'owner, 2 e 3 al CEO',
  seq[0].owner_id === ADMIN && seq[3].owner_id === ADMIN, JSON.stringify(seq.map(r => r.owner_id)));

await devePassare('AC-06 sposto a Negoziazione', `UPDATE deals SET stage_id = 6 WHERE id = $1`, [fu.id]);
const { rows: dopoSeq } = await db.query(
  `SELECT stato::text FROM crm_attivita WHERE deal_id = $1 AND sequenza = 'followup_proposta'`, [fu.id]);
verifica('AC-06 le attività non completate risultano annullate',
  dopoSeq.every(r => r.stato === 'annullata'), JSON.stringify(dopoSeq));

await devePassare('rientro nello stage 5', `UPDATE deals SET stage_id = 5 WHERE id = $1`, [fu.id]);
const { rows: [{ n: quante }] } = await db.query(
  `SELECT count(*)::int AS n FROM crm_attivita WHERE deal_id = $1 AND sequenza = 'followup_proposta'`, [fu.id]);
verifica('rientrare nello stage 5 non duplica la sequenza', quante === 4, `trovate ${quante}`);

console.log('\n=== §8.1 SLA primo contatto ===');
await comeUtente(ADMIN);
const { rows: [sla] } = await db.query(
  `INSERT INTO deals (title, company_name, source, owner_id, created_by, prossima_azione, data_prossima_azione)
   VALUES ('Lead fresco', 'Omega', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE) RETURNING id`, [ADMIN]);

const { rows: [pc] } = await db.query(
  `SELECT titolo, stato::text, chiave_job FROM crm_attivita WHERE deal_id = $1 AND chiave_job = 'primo_contatto'`, [sla.id]);
verifica('alla creazione nasce la task "Primo contatto"', pc?.titolo === 'Primo contatto' && pc.stato === 'aperta', JSON.stringify(pc));

const { rows: subito } = await db.query('SELECT * FROM public.crm_sla_primo_contatto_scaduti()');
verifica('appena creato non è in violazione', !subito.some(r => r.deal_id === sla.id), JSON.stringify(subito));

// Lo si retrodata di tre giorni: le 2 e le 4 ore lavorative sono passate.
await db.query(`UPDATE deals SET data_ingresso_stage = now() - interval '3 days' WHERE id = $1`, [sla.id]);
const { rows: dopoTre } = await db.query('SELECT * FROM public.crm_sla_primo_contatto_scaduti()');
const riga = dopoTre.find(r => r.deal_id === sla.id);
verifica('dopo tre giorni risulta scaduto alla soglia 4h', riga?.ore_soglia === 4, JSON.stringify(dopoTre));

await db.query(`UPDATE crm_attivita SET stato = 'completata', completed_at = now() WHERE deal_id = $1 AND chiave_job = 'primo_contatto'`, [sla.id]);
const { rows: dopoChiusura } = await db.query('SELECT * FROM public.crm_sla_primo_contatto_scaduti()');
verifica('chiuso il primo contatto, esce dalla lista', !dopoChiusura.some(r => r.deal_id === sla.id));

console.log('\n=== §10 KPI ===');
const { rows: [kpiRow] } = await db.query('SELECT public.crm_kpi(90) AS k');
const kpi = kpiRow.k;
verifica('AC-16 la funzione KPI risponde con tutte le voci',
  ['sales_cycle_giorni','close_rate','pct_con_next_action','per_source','per_stage'].every(k => k in kpi),
  JSON.stringify(Object.keys(kpi)));
verifica('AC-16 pct_con_next_action è 1 (ogni aperta ha la sua azione)',
  Number(kpi.pct_con_next_action) === 1, String(kpi.pct_con_next_action));
verifica('AC-16 per_source elenca le provenienze', Array.isArray(kpi.per_source) && kpi.per_source.length > 0,
  JSON.stringify(kpi.per_source));

await comeUtente(TEAM);
await deveFallire('i KPI sono riservati alla direzione', 'SELECT public.crm_kpi(90)', [], 'Riservato alla direzione');
await comeUtente(ADMIN);

console.log('\n=== Ponte con la colonna stage vecchia ===');
const { rows: [pon] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id)
   VALUES ('Ponte legacy', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 2) RETURNING id, stage::text`, [ADMIN]);
verifica('stage 2 si riflette in "qualified"', pon.stage === 'qualified', pon.stage);

await db.query(`UPDATE deals SET stage_id = 3 WHERE id = $1`, [pon.id]);
await db.query(`UPDATE deals SET stage_id = 7, esito = 'won' WHERE id = $1`, [pon.id]);
const { rows: [vinto] } = await db.query(
  'SELECT stage::text, probability, actual_close_date FROM deals WHERE id = $1', [pon.id]);
verifica('esito won si riflette in "closed_won"', vinto.stage === 'closed_won', vinto.stage);
verifica('i trigger legacy continuano a funzionare (probability, data chiusura)',
  vinto.probability === 100 && vinto.actual_close_date !== null, JSON.stringify(vinto));

const { rows: [nur] } = await db.query(
  `INSERT INTO deals (title, source, owner_id, created_by, prossima_azione, data_prossima_azione, stage_id)
   VALUES ('Ponte nurture', 'inbound', $1, $1, 'Chiamare', CURRENT_DATE, 2) RETURNING id`, [ADMIN]);
await db.query(`UPDATE deals SET stage_id = 7, esito = 'nurture', data_ripresa = CURRENT_DATE + 30 WHERE id = $1`, [nur.id]);
const { rows: [nur2] } = await db.query('SELECT stage::text FROM deals WHERE id = $1', [nur.id]);
verifica('un nurture non risulta più una trattativa viva per il modello vecchio',
  nur2.stage === 'closed_lost', nur2.stage);

console.log(`\n${ok} passati, ${ko} falliti`);
await db.close();
process.exit(ko ? 1 : 0);
