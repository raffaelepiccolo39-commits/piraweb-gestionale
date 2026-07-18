import type { SupabaseClient } from '@supabase/supabase-js';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/constants';
import { reportSupabaseError } from '@/lib/report-error';
import type { EmployeeExpense } from '@/types/database';

type Decision = 'approved' | 'rejected' | 'paid';

type ExpInput = Pick<EmployeeExpense, 'user_id' | 'category' | 'amount' | 'incurred_on'> & {
  user?: { full_name?: string } | null;
};

/**
 * Notifica al dipendente la decisione su una nota spese (approvata, rifiutata,
 * rimborsata). Se `adminId` è passato ed è diverso dal richiedente, inserisce
 * anche una "ricevuta" per l'admin (audit log personale).
 */
export async function notifyExpenseDecision(
  supabase: SupabaseClient,
  exp: ExpInput,
  decision: Decision,
  reviewNote?: string | null,
  adminId?: string,
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
    reportSupabaseError(error, 'expense-notifica-decisione');
    throw error;
  }

  if (adminId && adminId !== exp.user_id) {
    const requesterName = exp.user?.full_name || 'il dipendente';
    const adminTitleMap: Record<Decision, string> = {
      approved: 'Hai approvato una nota spese',
      rejected: 'Hai rifiutato una nota spese',
      paid: 'Hai pagato un rimborso',
    };
    const adminMessage = `${requesterName} · ${EXPENSE_CATEGORY_LABELS[exp.category]} · ${formatCurrency(exp.amount)}`;
    const { error: rcptErr } = await supabase.rpc('create_notification', {
      p_user_id: adminId,
      p_type: typeMap[decision],
      p_title: adminTitleMap[decision],
      p_message: adminMessage,
      p_link: '/note-spese',
    });
    if (rcptErr) {
      reportSupabaseError(rcptErr, 'expense-ricevuta-admin');
    }
  }
}
