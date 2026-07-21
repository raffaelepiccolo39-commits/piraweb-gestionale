/**
 * Le scadenze del contratto, da mettere nel proprio calendario.
 *
 * Un tocco solo e TUTTE le rate ancora da pagare finiscono nel calendario del
 * cliente, ognuna col suo avviso tre giorni prima e la mattina stessa. Un
 * pulsante per ogni rata voleva dire ricordarsi di tornare a premerlo ogni
 * mese: esattamente la cosa che il promemoria doveva evitare.
 *
 * Un evento per scadenza e non una ripetizione mensile: le rate non cadono
 * sempre lo stesso giorno, e una regola di ricorrenza costringerebbe a fingere
 * una regolarita' che i contratti veri non hanno.
 *
 * Perché così e non un'email automatica dal gestionale: il promemoria non
 * dipende da noi. Continua a funzionare se cambia indirizzo, se la nostra
 * email finisce nello spam, se il cron non gira. E soprattutto è una cosa che
 * il cliente si è messo da solo, non un sollecito che gli arriva — la
 * differenza conta, quando si parla di soldi.
 *
 * Il file .ics è lo standard che aprono Calendario di iPhone, Google Calendar
 * e Outlook senza chiedere nulla.
 */

export interface Promemoria {
  /** Id della rata: diventa l'identificativo dell'evento, cosi' premendo due
   *  volte il calendario aggiorna invece di creare doppioni. */
  id: string;
  /** Giorno della scadenza, 'YYYY-MM-DD'. */
  scadenza: string;
  titolo: string;
  descrizione: string;
}

/** Le righe di un .ics vanno separate da CRLF, non da semplici a capo. */
const CRLF = '\r\n';

/** 'YYYY-MM-DD' → 'YYYYMMDD', il formato delle date intere nel calendario. */
function soloData(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

/** Il giorno dopo: un evento di un giorno intero finisce all'alba del successivo. */
function giornoDopo(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return soloData(d.toISOString());
}

/**
 * Virgole, punti e virgola e a capo hanno un significato nel formato: dentro
 * un testo libero vanno protetti, o il calendario legge male l'evento.
 */
function proteggi(testo: string): string {
  return testo
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Lo standard vuole righe non piu' lunghe di 75 byte: le successive vanno
 * spezzate e fatte ripartire con uno spazio. Quasi tutti i calendari
 * perdonano righe lunghe, ma i parser severi no — e una descrizione con
 * l'importo dentro le supera facilmente.
 *
 * Si conta in byte, non in caratteri: "€" ne occupa tre, e spezzare in mezzo
 * a un carattere produrrebbe un file illeggibile.
 */
function piega(riga: string): string {
  const byte = new TextEncoder().encode(riga);
  if (byte.length <= 75) return riga;

  const pezzi: string[] = [];
  let corrente = '';
  let lunghezza = 0;
  // Dalla seconda riga in poi lo spazio iniziale occupa un byte del limite.
  let limite = 75;

  for (const carattere of riga) {
    const quanti = new TextEncoder().encode(carattere).length;
    if (lunghezza + quanti > limite) {
      pezzi.push(corrente);
      corrente = '';
      lunghezza = 0;
      limite = 74;
    }
    corrente += carattere;
    lunghezza += quanti;
  }
  if (corrente) pezzi.push(corrente);

  return pezzi.join(`${CRLF} `);
}

export function creaIcs(promemorie: Promemoria[]): string {
  const adesso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const eventi = promemorie.flatMap(({ id, scadenza, titolo, descrizione }) => [
    'BEGIN:VEVENT',
    `UID:pagamento-${id}@piraweb.it`,
    `DTSTAMP:${adesso}`,
    `DTSTART;VALUE=DATE:${soloData(scadenza)}`,
    `DTEND;VALUE=DATE:${giornoDopo(scadenza)}`,
    `SUMMARY:${proteggi(titolo)}`,
    `DESCRIPTION:${proteggi(descrizione)}`,
    'STATUS:CONFIRMED',
    // Trasparente: sono promemoria, non impegni che occupano la giornata.
    'TRANSP:TRANSPARENT',
    // Tre giorni prima: il tempo di fare un bonifico senza correre.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-P3D',
    `DESCRIPTION:${proteggi(titolo)}`,
    'END:VALARM',
    // E la mattina stessa, alle 9.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER;RELATED=START:PT9H',
    `DESCRIPTION:${proteggi(titolo)}`,
    'END:VALARM',
    'END:VEVENT',
  ]);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pira Web//Portale Clienti//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventi,
    'END:VCALENDAR',
  ].map(piega).join(CRLF) + CRLF;
}

/** Fa scaricare i promemoria. Sui telefoni apre direttamente il calendario. */
export function scaricaPromemoria(promemorie: Promemoria[], nomeFile: string): void {
  const blob = new Blob([creaIcs(promemorie)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Senza, il blob resta in memoria finché non si chiude la scheda.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
