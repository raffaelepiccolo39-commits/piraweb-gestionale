import type { SupabaseClient } from '@supabase/supabase-js';
import { dateRangeLabel } from '@/lib/time-off';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import { reportSupabaseError } from '@/lib/report-error';
import type { TimeOffRequest } from '@/types/database';

type Decision = 'approved' | 'rejected';

type ReqInput = Pick<TimeOffRequest, 'user_id' | 'type' | 'start_date' | 'end_date'> & {
  user?: { full_name?: string } | null;
  // Facoltativi: le richieste vecchie non li hanno, e la notifica deve
  // funzionare lo stesso.
  start_half?: boolean;
  end_half?: boolean;
  start_half_period?: 'mattina' | 'pomeriggio' | null;
  end_half_period?: 'mattina' | 'pomeriggio' | null;
};

/**
 * Notifica al dipendente la decisione su una richiesta di ferie/permesso.
 * Se `adminId` è passato ed è diverso dal richiedente, inserisce anche una
 * "ricevuta" per l'admin (audit log personale di chi ha deciso cosa).
 * La notifica al dipendente throwa in caso di errore (la mostriamo all'admin
 * via toast); la ricevuta admin invece è fire-and-forget per non bloccare.
 */
export async function notifyTimeOffDecision(
  supabase: SupabaseClient,
  req: ReqInput,
  decision: Decision,
  reviewNote?: string | null,
  adminId?: string,
) {
  // Stessa etichetta dell'elenco, cosi' la notifica dice anche QUALE meta'
  // della giornata: "mezza giornata" da sola obbliga a chiedere.
  const range = dateRangeLabel({
    start_date: req.start_date,
    end_date: req.end_date,
    start_half: req.start_half ?? false,
    end_half: req.end_half ?? false,
    start_half_period: req.start_half_period ?? null,
    end_half_period: req.end_half_period ?? null,
  });
  const title = decision === 'approved' ? 'Richiesta ferie approvata' : 'Richiesta ferie rifiutata';
  const note = reviewNote?.trim();
  const message = `${TIME_OFF_TYPE_LABELS[req.type]} · ${range}${
    decision === 'rejected' && note ? ` — ${note}` : ''
  }`;

  const { error } = await supabase.rpc('create_notification', {
    p_user_id: req.user_id,
    p_type: decision === 'approved' ? 'time_off_approved' : 'time_off_rejected',
    p_title: title,
    p_message: message,
    p_link: '/ferie',
  });
  if (error) {
    reportSupabaseError(error, 'time-off-notifica-decisione');
    throw error;
  }

  // Ricevuta admin (audit log nel suo elenco notifiche)
  if (adminId && adminId !== req.user_id) {
    const requesterName = req.user?.full_name || 'il dipendente';
    const adminTitle = decision === 'approved' ? 'Hai approvato una richiesta' : 'Hai rifiutato una richiesta';
    const adminMessage = `${requesterName} · ${TIME_OFF_TYPE_LABELS[req.type]} · ${range}`;
    const { error: rcptErr } = await supabase.rpc('create_notification', {
      p_user_id: adminId,
      p_type: decision === 'approved' ? 'time_off_approved' : 'time_off_rejected',
      p_title: adminTitle,
      p_message: adminMessage,
      p_link: '/ferie',
    });
    if (rcptErr) {
      reportSupabaseError(rcptErr, 'time-off-ricevuta-admin');
    }
  }
}
