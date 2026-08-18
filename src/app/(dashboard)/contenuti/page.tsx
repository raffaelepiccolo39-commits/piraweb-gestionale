'use client';

import SocialCalendarPage from '../social-calendar/page';

/**
 * Contenuti = il piano editoriale, e basta.
 *
 * Era una pagina indice con cinque tab: Piano Editoriale, Brief Creativi,
 * AI Assistant, AI Contenuti e Template (più Automazioni, già nascosta
 * perché non aveva un motore di esecuzione). Nell'uso quotidiano si apriva
 * solo la prima. Le altre restano ai loro indirizzi, non sono state
 * cancellate: qui sparisce la barra dei tab, non il codice.
 *
 * Niente intestazione propria: il piano editoriale ha già la sua, e
 * sovrapporne una seconda che elencava tab inesistenti sarebbe stato peggio
 * che non averla.
 */
export default function ContenutiPage() {
  return <SocialCalendarPage />;
}
