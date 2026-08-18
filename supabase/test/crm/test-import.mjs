import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..', '..', '..');
const require = createRequire(`${RADICE}/`);
const ts = require('typescript');

// Si compila il modulo vero, tolte le due righe che hanno senso solo dentro
// Next (server-only e l'alias @/), così il test gira sul codice di produzione
// e non su una copia.
const sorgente = readFileSync(
  resolve(RADICE, 'src/lib/crm/import-csv.ts'), 'utf8',
).replace("import 'server-only';", '');

const js = ts.transpileModule(sorgente, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compilato = resolve(QUI, 'import-csv.compilato.mjs');
writeFileSync(compilato, js);

const { analizzaCsv, rigaAOpportunita, csvDegliErrori } = await import(pathToFileURL(compilato).href);

let ok = 0, ko = 0;
const verifica = (nome, cond, dett = '') => {
  if (cond) { console.log(`  ok   ${nome}`); ok++; }
  else { console.log(`  KO   ${nome} ${dett}`); ko++; }
};

const stagePerCodice = new Map([
  ['lead', 0], ['contattato', 1], ['qualificato', 2], ['discovery_fissata', 3],
  ['discovery_fatta', 4], ['proposta_inviata', 5], ['negoziazione', 6],
  ['esito', 7], ['contratto', 8], ['onboarding', 9],
]);

console.log('\n=== §11 Import CSV ===');

const csv = [
  'azienda;contatto;email;telefono;source;referrer;stage;prossima_azione;data_prossima_azione;canone_proposto;una_tantum_proposto;note',
  'Alfa Srl;Mario Rossi;mario@alfa.it;3331112222;inbound;;qualificato;Richiamare;18/09/2026;800;1.500,00;Vecchia chat di gennaio',
  'Beta Spa;Luca Bianchi;luca@beta.it;;referral;;negoziazione;Mandare proposta;2026-09-01;1200;;Segnalato ma da chi?',
  'Gamma;Anna Verdi;anna@gamma.it;;paid;;lead;Primo contatto;2026-08-20;;;Lead da campagna',
].join('\n');

const { righe } = analizzaCsv(csv);
verifica('il parser legge 3 righe', righe.length === 3, `lette ${righe.length}`);

const esiti = righe.map((r) => rigaAOpportunita(r, stagePerCodice));
const validi = esiti.filter((e) => !('errore' in e));
const errori = esiti.filter((e) => 'errore' in e);

verifica('AC-15 due righe valide', validi.length === 2, `valide ${validi.length}`);
verifica('AC-15 una riga scartata (referral senza chi ha segnalato)',
  errori.length === 1 && errori[0].errore === 'Indica chi ha segnalato il contatto',
  JSON.stringify(errori));

verifica('data in formato italiano convertita', validi[0].dati.data_prossima_azione === '2026-09-18',
  String(validi[0].dati.data_prossima_azione));
verifica('importo con separatore italiano letto bene (1.500,00 -> 1500)',
  validi[0].dati.una_tantum_proposto === 1500, String(validi[0].dati.una_tantum_proposto));
verifica('lo stage arriva dal codice testuale', validi[0].dati.stage_id === 2, String(validi[0].dati.stage_id));
verifica('le righe importate sono marcate importato', validi.every((v) => v.dati.importato === true));

const csvErr = csvDegliErrori([{ numero: 3, azienda: 'Beta "Spa"', motivo: 'Indica chi ha segnalato il contatto' }]);
verifica('il CSV degli errori esce con intestazione e virgolette raddoppiate',
  csvErr.startsWith('riga;azienda;motivo') && csvErr.includes('"Beta ""Spa"""'), csvErr);

// Casi limite del parser
const conVirgolette = analizzaCsv('azienda;note\n"Delta; Srl";"Nota con ""virgolette"" dentro"');
verifica('il separatore dentro le virgolette non spezza il campo',
  conVirgolette.righe[0].dati.azienda === 'Delta; Srl', conVirgolette.righe[0].dati.azienda);
verifica('le virgolette raddoppiate si leggono come una sola',
  conVirgolette.righe[0].dati.note === 'Nota con "virgolette" dentro', conVirgolette.righe[0].dati.note);

const senzaAzione = analizzaCsv('azienda;source;stage;prossima_azione;data_prossima_azione\nEpsilon;inbound;qualificato;;');
const esitoV7 = rigaAOpportunita(senzaAzione.righe[0], stagePerCodice);
verifica('V7 vale anche in import',
  'errore' in esitoV7 && esitoV7.errore.includes('prossima azione'), JSON.stringify(esitoV7));

const sourceStrana = analizzaCsv('azienda;source\nZeta;passaparola');
const esitoSource = rigaAOpportunita(sourceStrana.righe[0], stagePerCodice);
verifica('una provenienza non prevista viene scartata',
  'errore' in esitoSource && esitoSource.errore.includes('non valida'), JSON.stringify(esitoSource));

console.log(`\n${ok} passati, ${ko} falliti`);
process.exit(ko ? 1 : 0);
