import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import type { TimeOffRequest } from '@/types/database';

type Decision = 'approved' | 'rejected';

/**
 * Inserisce una notifica per il dipendente quando una richiesta di ferie/permesso
 * viene approvata o rifiutata. Fire-and-forget: gli errori vengono loggati e non
 * bloccano il flusso di approvazione, perché la decisione è già stata persistita.
 */
export async function notifyTimeOffDecision(
  supabase: SupabaseClient,
  req: Pick<TimeOffRequest, 'user_id' | 'type' | 'start_date' | 'end_date'>,
  decision: Decision,
  reviewNote?: string | null,
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
}
