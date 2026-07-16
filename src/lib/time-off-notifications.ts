import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import { reportSupabaseError } from '@/lib/report-error';
import type { TimeOffRequest } from '@/types/database';

type Decision = 'approved' | 'rejected';

type ReqInput = Pick<TimeOffRequest, 'user_id' | 'type' | 'start_date' | 'end_date'> & {
  user?: { full_name?: string } | null;
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
  const range =
    req.start_date === req.end_date
      ? formatDate(req.start_date)
      : `${formatDate(req.start_date)} → ${formatDate(req.end_date)}`;
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
    console.error('[notifyTimeOffDecision]', error.message);
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
      console.error('[notifyTimeOffDecision admin receipt]', rcptErr.message);
    }
  }
}
