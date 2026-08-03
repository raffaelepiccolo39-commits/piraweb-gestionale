/**
 * Notifiche push: il lato telefono.
 *
 * Il sistema operativo (APNs su iOS, FCM su Android) rilascia un token che
 * identifica quell'installazione dell'app su quel dispositivo. Noi lo
 * conserviamo su Supabase legandolo all'utente: il server, quando c'e' da
 * avvisare qualcuno, cerca i suoi token e manda li'.
 *
 * Nel browser questo file non fa niente. I plugin nativi si importano solo a
 * richiesta (`await import`), altrimenti finirebbero nel pacchetto del sito
 * dove non hanno nulla da fare.
 */

import { isPackagedApp } from '@/lib/api-origin';
import { createClient } from '@/lib/supabase/client';
import { reportUnknown } from '@/lib/report-error';

/** Il token dell'ultima registrazione, per poterlo cancellare all'uscita. */
const CHIAVE_TOKEN = 'pw-push-token';

let registrazioneAvviata = false;

/**
 * Chiede il permesso (una volta sola: se l'utente ha gia' detto no, iOS non
 * ripropone la richiesta e non ha senso insistere) e registra il dispositivo.
 *
 * Va chiamata a utente gia' dentro, non all'avvio: una richiesta di permesso
 * che arriva prima di aver capito cos'e' l'app viene rifiutata quasi sempre,
 * e su iOS quel "no" e' definitivo.
 */
export async function registraDispositivo(): Promise<void> {
  if (!isPackagedApp() || registrazioneAvviata) return;
  registrazioneAvviata = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { Capacitor } = await import('@capacitor/core');

    const piattaforma = Capacitor.getPlatform();
    if (piattaforma !== 'ios' && piattaforma !== 'android') return;

    let permesso = await PushNotifications.checkPermissions();
    if (permesso.receive === 'prompt' || permesso.receive === 'prompt-with-rationale') {
      permesso = await PushNotifications.requestPermissions();
    }
    if (permesso.receive !== 'granted') return;

    // Il token non arriva da register(): arriva dopo, sull'evento. Va quindi
    // ascoltato PRIMA di chiamare register, altrimenti si perde.
    await PushNotifications.addListener('registration', async (token) => {
      try {
        const supabase = createClient();
        const { error } = await supabase.rpc('register_device_token', {
          p_token: token.value,
          p_platform: piattaforma,
        });
        if (error) {
          reportUnknown(error, 'client', { op: 'push-registra-token' });
          return;
        }
        window.localStorage.setItem(CHIAVE_TOKEN, token.value);
      } catch (err) {
        reportUnknown(err, 'client', { op: 'push-registra-token' });
      }
    });

    await PushNotifications.addListener('registrationError', (err) => {
      reportUnknown(err, 'client', { op: 'push-registrazione-fallita' });
    });

    // Tocco sulla notifica: si va dove la notifica puntava. Il link e' lo
    // stesso che la campanella usa in-app, quindi non c'e' una seconda mappa
    // di destinazioni da tenere allineata.
    await PushNotifications.addListener('pushNotificationActionPerformed', (evento) => {
      const link = evento.notification.data?.link;
      if (typeof link === 'string' && link.startsWith('/')) {
        window.location.assign(link);
      }
    });

    await PushNotifications.register();
  } catch (err) {
    // Un telefono senza notifiche resta un telefono che lavora: qui non si
    // rompe niente, si registra e si va avanti.
    reportUnknown(err, 'client', { op: 'push-avvio' });
  }
}

/**
 * All'uscita il dispositivo va staccato dall'utente, altrimenti chi esce
 * continua a ricevere le notifiche di chi era prima su quel telefono.
 */
export async function dimenticaDispositivo(): Promise<void> {
  if (!isPackagedApp()) return;

  try {
    const token = window.localStorage.getItem(CHIAVE_TOKEN);
    if (!token) return;

    const supabase = createClient();
    await supabase.from('device_tokens').delete().eq('token', token);
    window.localStorage.removeItem(CHIAVE_TOKEN);
    registrazioneAvviata = false;
  } catch {
    // L'uscita non deve fallire per colpa di una pulizia.
  }
}
