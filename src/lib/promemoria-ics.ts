/**
 * Un promemoria da mettere nel proprio calendario.
 *
 * Il cliente tocca "Ricordamelo" e la scadenza finisce nel calendario del suo
 * telefono, che lo avvisa da solo tre giorni prima e la mattina stessa.
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

interface Promemoria {
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

export function creaIcs({ scadenza, titolo, descrizione }: Promemoria): string {
  const inizio = soloData(scadenza);
  const fine = giornoDopo(scadenza);
  const adesso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  // Deve restare lo stesso per la stessa scadenza: se il cliente tocca due
  // volte, il calendario aggiorna l'evento invece di crearne un doppione.
  const uid = `pagamento-${inizio}@piraweb.it`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pira Web//Portale Clienti//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${adesso}`,
    `DTSTART;VALUE=DATE:${inizio}`,
    `DTEND;VALUE=DATE:${fine}`,
    `SUMMARY:${proteggi(titolo)}`,
    `DESCRIPTION:${proteggi(descrizione)}`,
    'STATUS:CONFIRMED',
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
    'END:VCALENDAR',
  ].map(piega).join(CRLF) + CRLF;
}

/** Fa scaricare il promemoria. Sui telefoni apre direttamente il calendario. */
export function scaricaPromemoria(promemoria: Promemoria, nomeFile: string): void {
  const blob = new Blob([creaIcs(promemoria)], { type: 'text/calendar;charset=utf-8' });
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
