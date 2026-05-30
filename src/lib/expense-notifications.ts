import type { SupabaseClient } from '@supabase/supabase-js';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/constants';
import type { EmployeeExpense } from '@/types/database';

type Decision = 'approved' | 'rejected' | 'paid';

/**
 * Notifica al dipendente la decisione su una nota spese (approvata, rifiutata,
 * rimborsata). Fire-and-forget: errori loggati ma non bloccano il flusso.
 */
export async function notifyExpenseDecision(
  supabase: SupabaseClient,
  exp: Pick<EmployeeExpense, 'user_id' | 'category' | 'amount' | 'incurred_on'>,
  decision: Decision,
  reviewNote?: string | null,
) {
  const note = reviewNote?.trim();
  const titleMap: Record<Decision, string> = {
    approved: 'Nota spese approvata',
    rejected: 'Nota spese rifiutata',
    paid: 'Rimborso erogato',
  };
  const typeMap: Record<Decision, 'expense_approved' | 'expense_rejected' | 'expense_paid'> = {
    approved: 'expense_approved',
    rejected: 'expense_rejected',
    paid: 'expense_paid',
  };
  const message = `${EXPENSE_CATEGORY_LABELS[exp.category]} · ${formatCurrency(exp.amount)} del ${formatDate(exp.incurred_on)}${
    decision === 'rejected' && note ? ` — ${note}` : ''
  }`;

  const { error } = await supabase.rpc('create_notification', {
    p_user_id: exp.user_id,
    p_type: typeMap[decision],
    p_title: titleMap[decision],
    p_message: message,
    p_link: '/note-spese',
  });
  if (error) {
    console.error('[notifyExpenseDecision]', error.message);
    throw error;
  }
}
