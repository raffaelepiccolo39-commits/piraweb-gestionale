/**
 * Avvisare una persona, senza sapere come.
 *
 * La regola decisa: gli avvisi arrivano come notifica dell'app, non per mail.
 * Ma chi l'app non ce l'ha ancora installata resterebbe all'oscuro — e nel
 * caso dei solleciti di pagamento significa non incassare. Quindi: push a chi
 * ha un dispositivo registrato, mail solo a chi non ce l'ha.
 *
 * Chi chiama non deve decidere niente: passa il messaggio e, se esiste, la
 * mail di ripiego. La scelta la fa questo file, guardando `device_tokens`.
 *
 * Come parte davvero la push: scrivendo la riga in `notifications`. C'e' un
 * trigger sul database che da li' chiama la rotta di invio. Un solo canale,
 * quindi niente doppioni e niente due strade da tenere allineate.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/** I tipi ammessi dall'enum `notification_type` sul database. */
export type TipoAvviso =
  | 'task_assigned'
  | 'task_updated'
  | 'task_completed'
  | 'project_created'
  | 'post_created'
  | 'comment_added'
  | 'mention'
  | 'deadline_approaching'
  | 'ai_script_ready';

export interface Avviso {
  /** L'account da avvisare: vale sia per il team sia per i clienti. */
  utente: string;
  tipo: TipoAvviso;
  titolo: string;
  testo?: string;
  /** Dove porta il tocco sulla notifica, es. '/portale/contenuti'. */
  link?: string | null;
  /**
   * Il ripiego, per chi non ha l'app. Se non lo passi, chi non ce l'ha
   * semplicemente non viene avvisato — ed e' una scelta, non una svista.
   */
  mailDiRipiego?: () => Promise<unknown>;
}

export type ViaUsata = 'app' | 'mail' | 'nessuna';

/**
 * Restituisce per quale strada e' passato l'avviso. Non solleva mai: un avviso
 * mancato non deve far fallire l'operazione che lo ha generato.
 */
export async function avvisa(avviso: Avviso): Promise<ViaUsata> {
  try {
    const supabase = await createServiceRoleClient();

    const { count, error } = await supabase
      .from('device_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', avviso.utente);

    if (error) {
      await logError({ error, source: 'server', route: '/avvisa', context: { op: 'conta-dispositivi' } });
    }

    const haApp = (count ?? 0) > 0;

    if (haApp) {
      const { error: erroreNotifica } = await supabase.from('notifications').insert({
        user_id: avviso.utente,
        type: avviso.tipo,
        title: avviso.titolo,
        message: avviso.testo ?? null,
        link: avviso.link ?? null,
      });

      if (!erroreNotifica) return 'app';

      // Notifica non scritta: senza di quella non parte nemmeno la push,
      // quindi si ripiega sulla mail invece di lasciare la persona all'oscuro.
      await logError({
        error: erroreNotifica,
        source: 'server',
        route: '/avvisa',
        context: { op: 'scrivi-notifica', utente: avviso.utente },
      });
    }

    if (avviso.mailDiRipiego) {
      await avviso.mailDiRipiego();
      return 'mail';
    }

    return 'nessuna';
  } catch (err) {
    await logError({ error: err, source: 'server', route: '/avvisa', context: { op: 'avvisa' } });
    return 'nessuna';
  }
}

/**
 * Chi, tra questi, ha l'app installata.
 *
 * Serve dove il ripiego non e' "una mail a testa" ma una mail sola a un
 * indirizzo aziendale — i solleciti di fattura, per esempio: se nessuno dei
 * referenti ha l'app si manda quell'unica mail, non una per referente.
 */
export async function conDispositivo(utenti: string[]): Promise<string[]> {
  if (utenti.length === 0) return [];

  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from('device_tokens')
      .select('user_id')
      .in('user_id', utenti);

    if (error || !data) return [];
    return [...new Set(data.map((r) => r.user_id as string))];
  } catch {
    // Nel dubbio: nessuno ha l'app, quindi si ripiega sulla mail. Meglio una
    // mail di troppo che un avviso che non arriva.
    return [];
  }
}

/**
 * Per i casi in cui l'avviso vale per piu' persone (il team di un cliente,
 * gli admin). Ognuno riceve per la strada che gli spetta.
 */
export async function avvisaTutti(utenti: string[], avviso: Omit<Avviso, 'utente'>): Promise<void> {
  await Promise.all(utenti.map((utente) => avvisa({ ...avviso, utente })));
}
