/**
 * Invito al portale via WhatsApp.
 *
 * L'email c'e' e resta, ma i clienti spesso non la leggono: un messaggio su
 * WhatsApp lo aprono tutti, e in quel messaggio ci sta tutto quello che serve
 * — dove scaricare l'app e il link per entrare la prima volta.
 *
 * Non si manda niente da qui: si apre WhatsApp col testo gia' scritto, e a
 * premere invio e' una persona. Nessun numero verde, nessuna API, nessun
 * costo — e il cliente riceve il messaggio da un numero che conosce.
 */

/** Dove si scarica l'app. Il link iOS e' quello della scheda "non in elenco". */
export const LINK_APP_IOS = 'https://apps.apple.com/it/app/pira-web/id6793584368';
export const LINK_APP_ANDROID = 'https://play.google.com/store/apps/details?id=it.piraweb.gestionale';

interface DatiInvito {
  /** Come si chiama il cliente, per aprire il messaggio con il suo nome. */
  nome?: string | null;
  /** Il nome dell'agenzia che invita. */
  agenzia?: string;
  /** Link di primo accesso: e' quello che scade, quindi va usato subito. */
  link: string;
}

/**
 * Il testo dell'invito. Scritto come lo scriverebbe una persona, non come una
 * notifica di sistema: chi lo riceve deve capire in tre righe cos'e' e cosa
 * fare, senza gergo.
 */
export function testoInvito({ nome, agenzia = 'Pira Web', link }: DatiInvito): string {
  const saluto = nome?.trim() ? `Ciao ${nome.trim().split(' ')[0]}!` : 'Ciao!';

  return [
    `${saluto} Da oggi puoi seguire i tuoi contenuti e i lavori direttamente dall'app di ${agenzia}.`,
    '',
    '1) Scarica l\'app:',
    `iPhone: ${LINK_APP_IOS}`,
    `Android: ${LINK_APP_ANDROID}`,
    '',
    '2) Poi apri questo link per impostare la tua password ed entrare:',
    link,
    '',
    'Il link di accesso vale poche ore: se scade scrivimi e te ne mando un altro.',
  ].join('\n');
}

/**
 * Il numero come lo vuole WhatsApp: solo cifre, con prefisso internazionale.
 * I numeri italiani in rubrica sono spesso scritti "333 123 4567" o
 * "+39 333-1234567": senza questa pulizia il link non apre niente.
 */
export function numeroPerWhatsApp(telefono?: string | null): string | null {
  if (!telefono) return null;

  let cifre = telefono.replace(/[^\d+]/g, '');
  if (cifre.startsWith('+')) cifre = cifre.slice(1);
  else if (cifre.startsWith('00')) cifre = cifre.slice(2);
  else if (cifre.length === 10 && cifre.startsWith('3')) cifre = `39${cifre}`;

  return cifre.length >= 8 ? cifre : null;
}

/**
 * Il link che apre WhatsApp col messaggio pronto. Senza numero apre la scelta
 * del contatto: capita spesso che il cellulare del referente non sia lo stesso
 * scritto nella scheda del cliente.
 */
export function linkWhatsApp(testo: string, telefono?: string | null): string {
  const numero = numeroPerWhatsApp(telefono);
  const messaggio = encodeURIComponent(testo);
  return numero
    ? `https://wa.me/${numero}?text=${messaggio}`
    : `https://wa.me/?text=${messaggio}`;
}
