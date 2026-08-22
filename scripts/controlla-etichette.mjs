#!/usr/bin/env node
/**
 * Due controlli sui nomi accessibili: i bottoni e i campi dei moduli.
 *
 * ── 1. Bottoni con la sola icona e nessun nome.
 *
 * Un bottone che mostra solo un'icona non ha nome accessibile: chi usa
 * VoiceOver lo sente annunciare come "pulsante", e basta. Nel gestionale
 * questo capita su azioni non innocue — eliminare un progetto, per dirne una.
 *
 * Perché uno script e non una regola ESLint: `jsx-a11y/control-has-associated-label`
 * esiste, ma su questo codice produce 123 avvisi, quasi tutti `<input>` senza
 * `<label>`. È un difetto vero, ma diverso e molto più grande; accesa così
 * seppellirebbe i pochi casi che contano sotto il rumore, ed è esattamente il
 * modo in cui un controllo smette di essere letto.
 *
 * Il riconoscimento del testo è una euristica dichiarata, non un parser JSX:
 * un bottone conta come "con nome" se ha testo diretto, una stringa dentro
 * un'espressione, oppure un'espressione che finisce in label/title/text/nome.
 * Se un giorno sbaglia, meglio allargarla che spegnere il controllo.
 *
 * ── 2. Campi di modulo senza nome (input, select, textarea).
 *
 * Un campo senza <label> collegata e senza aria-label viene annunciato come
 * "casella di testo" e nient'altro: in un modulo di sei campi non si capisce
 * a quale si e' arrivati. Il segnaposto NON basta — sparisce appena scrivi.
 *
 * Un campo conta come a posto se: ha aria-label o aria-labelledby, oppure
 * ha un id a cui punta una <label htmlFor> (anche calcolato, tipo
 * id={`kb-${field.key}`}), oppure sta dentro una <label>. I type="hidden"
 * non si contano: non li vede nessuno, per definizione.
 *
 *   node scripts/controlla-etichette.mjs        elenca
 *   node scripts/controlla-etichette.mjs --ci   esce con 1 se trova qualcosa
 */

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RADICI = ['src/app', 'src/components'];

function file(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) file(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Fine del tag di apertura: il primo `>` fuori da stringhe e da graffe. */
function fineApertura(s, da) {
  let graffe = 0, virgoletta = null;
  for (let i = da; i < s.length; i++) {
    const c = s[i];
    if (virgoletta) { if (c === virgoletta && s[i - 1] !== '\\') virgoletta = null; continue; }
    if (c === '"' || c === "'" || c === '`') { virgoletta = c; continue; }
    if (c === '{') graffe++;
    else if (c === '}') graffe--;
    else if (c === '>' && graffe === 0) return i;
  }
  return -1;
}

// "titolo" e "descrizione" mancavano, e sono le parole che questo progetto
// usa davvero: un bottone con dentro {voce.titolo} veniva segnalato come
// senza nome. Un controllo che grida al lupo lo si smette di ascoltare.
const PAROLE_ETICHETTA = /\b(label|title|titolo|text|testo|nome|name|etichetta|descrizione)\b/i;

/** Solo punteggiatura JS: ` : `, ` && `, `, ` — non è testo per l'utente. */
const soloCodice = (t) => !/[A-Za-zÀ-ÿ]{2,}/.test(t.replace(/[?:(){}[\],;=>&|!.]/g, ' '));

/** Le espressioni `{...}` bilanciate di primo livello. */
function graffe(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}' && --d === 0) { out.push(s.slice(i, j + 1)); i = j; break; }
    }
  }
  return out;
}

/**
 * Il bottone mostra qualcosa di leggibile?
 *
 * Tre strade, perché il testo si nasconde in tre posti diversi:
 *   1. fuori dalle graffe        <Button><Save /> Salva</Button>
 *   2. dentro un frammento       {done ? <><Check /> Fatto</> : <X />}
 *   3. dentro una stringa        {inCorso ? 'Invio…' : 'Invia'}
 * Più il caso 4, un'espressione che *è* l'etichetta: {azione.label}.
 *
 * Il caso 2 è quello che mi ha ingannato la prima volta: il testo sta dentro
 * le graffe, ma è testo JSX, non codice. Si riconosce perché sta fra un `>`
 * e un `<`. Va distinto da ` : `, che sta anch'esso fra due tag ed è solo
 * l'operatore ternario — da qui soloCodice().
 */
function haNome(inner) {
  const espressioni = graffe(inner);
  let fuori = inner;
  for (const e of espressioni) fuori = fuori.replace(e, '');
  if (fuori.replace(/<[^>]*>/g, '').trim()) return true;              // 1

  for (const e of espressioni) {
    for (const [, t] of e.matchAll(/>([^<>{}]*)</g)) {                // 2
      if (t.trim() && !soloCodice(t)) return true;
    }
    const senzaTag = e.replace(/<[^>]*>/g, '');
    if (/['"`][^'"`]{2,}['"`]/.test(senzaTag)) return true;           // 3
    if (PAROLE_ETICHETTA.test(senzaTag)) return true;                 // 4
    // 5. Un'espressione che è solo un percorso di proprietà — {cal.displayName},
    // {item.content} — rende un valore, cioè testo. Senza operatori: così
    // {invio ? <A /> : <B />} resta scoperto, che è il caso che ci interessa.
    if (/^\s*[A-Za-z_$][\w$]*(\??\.[A-Za-z_$][\w$]*)*\s*$/.test(senzaTag.slice(1, -1))) return true;
  }
  return false;
}

const trovati = [];
for (const radice of RADICI) {
  for (const p of file(radice)) {
    const s = readFileSync(p, 'utf8');
    for (const tag of ['Button', 'button']) {
      const re = new RegExp(`<${tag}\\b`, 'g');
      let m;
      while ((m = re.exec(s))) {
        const apre = fineApertura(s, m.index);
        if (apre === -1) continue;
        const chiude = s.indexOf(`</${tag}>`, apre);
        if (chiude === -1 || chiude - apre > 800) continue;
        const attr = s.slice(m.index, apre);
        const inner = s.slice(apre + 1, chiude);
        if (haNome(inner)) continue;
        if (!/<[A-Z]\w+[\s/]/.test(inner)) continue;           // niente icona: non è il caso nostro
        if (/aria-label|title=|aria-labelledby/.test(attr)) continue;
        trovati.push({ file: p, riga: s.slice(0, m.index).split('\n').length,
                       icona: inner.match(/<([A-Z]\w+)[\s/]/)?.[1] ?? '?' });
      }
    }
  }
}

// ── 2. Campi di modulo senza nome ───────────────────────────
const campiNudi = [];
for (const radice of RADICI) {
  for (const p of file(radice)) {
    const s = readFileSync(p, 'utf8');
    // sia htmlFor="x" sia htmlFor={x} sia htmlFor={`x-${y}`}
    const bersagli = new Set([...s.matchAll(/htmlFor=(?:"([^"]+)"|\{([^}]+)\})/g)]
      .map((m) => (m[1] ?? m[2]).trim()));
    for (const tag of ['input', 'textarea', 'select']) {
      for (const m of s.matchAll(new RegExp(`<${tag}\\b`, 'g'))) {
        const fine = fineApertura(s, m.index);
        if (fine === -1) continue;
        const attr = s.slice(m.index, fine);
        if (/type=["']hidden["']/.test(attr)) continue;
        if (/aria-label(?:ledby)?=/.test(attr)) continue;

        const id = attr.match(/\bid="([^"]+)"/)?.[1] ?? attr.match(/\bid=\{([^}]+)\}/)?.[1]?.trim();
        if (id && bersagli.has(id)) continue;

        // avvolto in <label> ... </label>?
        const apre = s.lastIndexOf('<label', m.index);
        if (apre >= 0 && s.indexOf('</label>', apre) > m.index) continue;

        campiNudi.push({ file: p, riga: s.slice(0, m.index).split('\n').length, tag });
      }
    }
  }
}

// Il componente Button stesso: lo spinner interno non è un bottone dell'app.
const veri = trovati.filter((t) => !t.file.endsWith('ui/button.tsx'));

if (veri.length === 0) console.log('ok   nessun bottone a sola icona senza nome accessibile');
else {
  console.log(`KO   ${veri.length} bottoni mostrano solo un'icona e non hanno nome:\n`);
  for (const t of veri) console.log(`  ${t.file}:${t.riga}   <${t.icona} />`);
  console.log('\nAggiungi aria-label e title con la stessa parola che useresti a voce.');
}

if (campiNudi.length === 0) console.log('ok   nessun campo di modulo senza nome accessibile');
else {
  console.log(`\nKO   ${campiNudi.length} campi di modulo non hanno nome:\n`);
  for (const c of campiNudi) console.log(`  ${c.file}:${c.riga}   <${c.tag}>`);
  console.log('\nCollega la <label> con htmlFor/id, oppure aggiungi aria-label.');
}

const guasti = veri.length + campiNudi.length;
process.exit(guasti && process.argv.includes('--ci') ? 1 : 0);
