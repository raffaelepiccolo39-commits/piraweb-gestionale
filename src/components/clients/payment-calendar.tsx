'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { ClientPayment } from '@/types/database';
import { Check, Clock, AlertTriangle } from 'lucide-react';

interface PaymentCalendarProps {
  payments: ClientPayment[];
  onTogglePaid: (payment: ClientPayment) => void;
}

function formatMonthLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

type PaymentAlert = 'none' | 'warning' | 'danger';

function getPaymentAlert(payment: ClientPayment): PaymentAlert {
  if (payment.is_paid) return 'none';

  const now = new Date();
  const due = new Date(payment.due_date);

  // Payment is for a past month (due date already passed)
  const dueMonth = due.getFullYear() * 12 + due.getMonth();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();

  if (dueMonth > currentMonth) return 'none'; // future month, no alert

  if (dueMonth < currentMonth) return 'danger'; // past month, not paid = red

  // Current month: check day
  const dayOfMonth = now.getDate();
  if (dayOfMonth > 5) return 'danger'; // after 5th = red
  if (dayOfMonth >= 1) return 'warning'; // 1st-5th = yellow warning

  return 'none';
}

export function PaymentCalendar({ payments, onTogglePaid }: PaymentCalendarProps) {
  const [confirmPayment, setConfirmPayment] = useState<ClientPayment | null>(null);

  const handleConfirm = () => {
    if (!confirmPayment) return;
    onTogglePaid(confirmPayment);
    setConfirmPayment(null);
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {payments.map((payment) => {
          const alert = getPaymentAlert(payment);

          return (
            <button
              key={payment.id}
              onClick={() => setConfirmPayment(payment)}
              className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                payment.is_paid
                  ? 'border-green-500/30 bg-green-500/10'
                  : alert === 'danger'
                  ? 'border-red-500/30 bg-red-500/10'
                  : alert === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-pw-border bg-pw-surface-2 hover:border-pw-accent/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-pw-text-muted uppercase">
                  Mese {payment.month_index + 1}
                </span>
                {payment.is_paid ? (
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <Check size={14} className="text-white" />
                  </div>
                ) : alert === 'danger' ? (
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                    <AlertTriangle size={12} className="text-white" />
                  </div>
                ) : alert === 'warning' ? (
                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                    <AlertTriangle size={12} className="text-white" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-pw-surface-3 flex items-center justify-center">
                    <Clock size={14} className="text-pw-text-muted" />
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-pw-text capitalize">
                {formatMonthLabel(payment.due_date)}
              </p>
              <p className={`text-lg font-bold mt-1 ${
                payment.is_paid
                  ? 'text-green-400'
                  : alert === 'danger'
                  ? 'text-red-400'
                  : alert === 'warning'
                  ? 'text-amber-400'
                  : 'text-pw-text'
              }`}>
                {formatCurrency(payment.amount)}
              </p>
              {payment.is_paid && payment.paid_at && (
                <p className="text-[10px] text-green-400 mt-1">
                  Pagato il {new Date(payment.paid_at).toLocaleDateString('it-IT')}
                </p>
              )}
              {!payment.is_paid && alert === 'danger' && (
                <p className="text-[10px] text-red-400 mt-1 font-medium">
                  Pagamento in ritardo!
                </p>
              )}
              {!payment.is_paid && alert === 'warning' && (
                <p className="text-[10px] text-amber-400 mt-1 font-medium">
                  In scadenza
                </p>
              )}
              {!payment.is_paid && alert === 'none' && (
                <p className="text-[10px] text-pw-text-dim mt-1">
                  Clicca per segnare come pagato
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Confirmation modal */}
      <Modal
        open={!!confirmPayment}
        onClose={() => setConfirmPayment(null)}
        title={confirmPayment?.is_paid ? 'Annulla Pagamento' : 'Conferma Pagamento'}
        size="sm"
      >
        {confirmPayment && (
          <div>
            {confirmPayment.is_paid ? (
              <>
                <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-amber-500/10">
                  <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-400">
                    Stai per annullare il pagamento registrato
                  </p>
                </div>
                <p className="text-pw-text-muted text-sm mb-1">
                  <strong className="capitalize">{formatMonthLabel(confirmPayment.due_date)}</strong>
                </p>
                <p className="text-2xl font-bold text-pw-text mb-4">
                  {formatCurrency(confirmPayment.amount)}
                </p>
                <p className="text-sm text-pw-text-muted mb-6">
                  Sei sicuro di voler segnare questa mensilità come <strong>non pagata</strong>?
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-green-500/10">
                  <Check size={20} className="text-green-500 shrink-0" />
                  <p className="text-sm text-green-400">
                    Stai per registrare il pagamento
                  </p>
                </div>
                <p className="text-pw-text-muted text-sm mb-1">
                  <strong className="capitalize">{formatMonthLabel(confirmPayment.due_date)}</strong>
                </p>
                <p className="text-2xl font-bold text-pw-text mb-4">
                  {formatCurrency(confirmPayment.amount)}
                </p>
                <p className="text-sm text-pw-text-muted mb-6">
                  Confermi di aver ricevuto il pagamento per questa mensilità?
                </p>
              </>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmPayment(null)} className="flex-1">
                Annulla
              </Button>
              <Button
                onClick={handleConfirm}
                variant={confirmPayment.is_paid ? 'danger' : 'primary'}
                className="flex-1"
              >
                {confirmPayment.is_paid ? 'Rimuovi Pagamento' : 'Conferma Pagamento'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
