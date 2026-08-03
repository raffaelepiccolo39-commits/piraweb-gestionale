/**
 * Notifiche push: il lato server.
 *
 * Un solo punto d'ingresso — `inviaPush` — che prende l'utente da avvisare e
 * il messaggio, cerca i suoi dispositivi e li serve tutti: iPhone via APNs,
 * Android via FCM. Chi chiama non deve sapere niente di token e certificati.
 *
 * Regola: un invio fallito non deve mai far fallire l'operazione che l'ha
 * scatenata. Se le notifiche sono spente o una chiave e' sbagliata, la task
 * viene assegnata lo stesso e il problema finisce nel registro errori.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { inviaAdApns, apnsConfigurato } from './apns';
import { inviaAFcm, fcmConfigurato } from './fcm';

export interface MessaggioPush {
  titolo: string;
  testo: string;
  /** Dove portare chi tocca la notifica, es. '/tasks/scheda?id=...'. */
  link?: string | null;
}

export interface EsitoPush {
  inviate: number;
  fallite: number;
  tokenRimossi: number;
}

export function pushAttive(): boolean {
  return apnsConfigurato() || fcmConfigurato();
}

/**
 * Manda un messaggio a tutti i dispositivi di una o piu' persone.
 * Restituisce sempre un esito: non solleva mai.
 */
export async function inviaPush(
  utenti: string | string[],
  messaggio: MessaggioPush,
): Promise<EsitoPush> {
  const esito: EsitoPush = { inviate: 0, fallite: 0, tokenRimossi: 0 };
  const destinatari = Array.isArray(utenti) ? utenti : [utenti];
  if (destinatari.length === 0 || !pushAttive()) return esito;

  try {
    const supabase = await createServiceRoleClient();

    const { data: dispositivi, error } = await supabase
      .from('device_tokens')
      .select('token, platform, user_id')
      .in('user_id', destinatari);

    if (error) {
      await logError({ error, source: 'server', route: '/push', context: { op: 'push-lettura-token' } });
      return esito;
    }
    if (!dispositivi || dispositivi.length === 0) return esito;

    const daRimuovere: string[] = [];

    // In parallelo: sono chiamate di rete indipendenti, e una persona con
    // telefono + tablet non deve aspettare due giri.
    await Promise.all(dispositivi.map(async (d) => {
      const risultato = d.platform === 'ios'
        ? await inviaAdApns(d.token, { titolo: messaggio.titolo, testo: messaggio.testo, link: messaggio.link })
        : await inviaAFcm(d.token, { titolo: messaggio.titolo, testo: messaggio.testo, link: messaggio.link });

      if (risultato.ok) {
        esito.inviate++;
        return;
      }

      esito.fallite++;
      if (risultato.tokenMorto) daRimuovere.push(d.token);
    }));

    if (daRimuovere.length > 0) {
      // Token di app disinstallate: tenerli significa ritentare per sempre.
      await supabase.from('device_tokens').delete().in('token', daRimuovere);
      esito.tokenRimossi = daRimuovere.length;
    }

    return esito;
  } catch (err) {
    await logError({ error: err, source: 'server', route: '/push', context: { op: 'push-invio' } });
    return esito;
  }
}
