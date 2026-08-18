'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { ClientPayment } from '@/types/database';
import { Check, Clock, AlertTriangle, MessageCircle, Pause, Play, PauseCircle } from 'lucide-react';

interface PaymentCalendarProps {
  payments: ClientPayment[];
  onTogglePaid: (payment: ClientPayment, paidAt?: string) => void;
  onToggleSuspended: (payment: ClientPayment, reason?: string) => void;
  clientPhone?: string | null;
  clientName?: string | null;
}

function formatMonthLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

// Data odierna in formato YYYY-MM-DD per il default dell'input date (ora locale)
function todayISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

// "Mese N" = posizione fra le sole mensilità dovute. month_index è lo slot di
// calendario e salta i mesi sospesi, quindi i due numeri divergono appena c'è
// una sospensione: su Apr→Set con Agosto sospeso, Settembre è mese 5, non 6.
function buildDueOrdinals(payments: ClientPayment[]): Map<string, number> {
  const ordinals = new Map<string, number>();
  let n = 0;
  for (const payment of payments) {
    if (payment.is_suspended) continue;
    n += 1;
    ordinals.set(payment.id, n);
  }
  return ordinals;
}

// Mese che verrebbe aggiunto in coda sospendendo una rata: l'ultimo slot + 1.
function nextTailMonthLabel(payments: ClientPayment[]): string | null {
  const last = payments[payments.length - 1];
  if (!last) return null;
  const due = new Date(last.due_date);
  due.setMonth(due.getMonth() + 1);
  return due.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

type PaymentAlert = 'none' | 'warning' | 'danger';

function getPaymentAlert(payment: ClientPayment): PaymentAlert {
  if (payment.is_paid) return 'none';
  // Una mensilità sospesa non è dovuta: non può essere in ritardo.
  if (payment.is_suspended) return 'none';

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

export function PaymentCalendar({ payments, onTogglePaid, onToggleSuspended, clientPhone, clientName }: PaymentCalendarProps) {
  const [confirmPayment, setConfirmPayment] = useState<ClientPayment | null>(null);
  const [suspendPayment, setSuspendPayment] = useState<ClientPayment | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [paidDate, setPaidDate] = useState(todayISO());

  const dueOrdinals = buildDueOrdinals(payments);
  const suspendedCount = payments.filter((p) => p.is_suspended).length;

  const openConfirm = (payment: ClientPayment) => {
    // La data di pagamento parte sempre da oggi (modificabile in fase di conferma)
    setPaidDate(todayISO());
    setConfirmPayment(payment);
  };

  const openSuspend = (payment: ClientPayment) => {
    setSuspendReason('');
    setSuspendPayment(payment);
  };

  const handleConfirm = () => {
    if (!confirmPayment) return;
    const wasPaid = confirmPayment.is_paid;
    // Passa la data scelta solo quando si sta registrando il pagamento
    onTogglePaid(confirmPayment, wasPaid ? undefined : paidDate);

    // Send WhatsApp message when marking as paid
    if (!wasPaid && sendWhatsapp && clientPhone) {
      const month = new Date(confirmPayment.due_date).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      const message = `Buongiorno${clientName ? ` ${clientName}` : ''}, la informiamo che il pagamento per la mensilità di ${month} è stato registrato con successo. Grazie! 🙏`;
      const phone = clientPhone.replace(/\s+/g, '').replace(/^\+/, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    }

    setConfirmPayment(null);
  };

  const handleConfirmSuspend = () => {
    if (!suspendPayment) return;
    onToggleSuspended(suspendPayment, suspendPayment.is_suspended ? undefined : suspendReason);
    setSuspendPayment(null);
  };

  const tailMonth = nextTailMonthLabel(payments);

  return (
    <>
      {suspendedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-pw-surface-2 border border-pw-border">
          <PauseCircle size={16} className="text-pw-text-muted shrink-0" />
          <p className="text-xs text-pw-text-muted">
            {suspendedCount === 1 ? '1 mensilità sospesa' : `${suspendedCount} mensilità sospese`}: non
            {suspendedCount === 1 ? ' è dovuta' : ' sono dovute'} e il contratto si è allungato di{' '}
            {suspendedCount === 1 ? 'un mese' : `${suspendedCount} mesi`}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {payments.map((payment) => {
          const alert = getPaymentAlert(payment);
          const ordinal = dueOrdinals.get(payment.id);

          return (
            <div key={payment.id} className="relative">
              <button
                onClick={() => openConfirm(payment)}
                disabled={payment.is_suspended}
                className={`w-full h-full p-4 rounded-xl border-2 text-left transition-all ${
                  payment.is_suspended
                    ? 'border-dashed border-pw-border bg-pw-surface-2/50 cursor-default'
                    : payment.is_paid
                    ? 'border-green-500/30 bg-green-500/10 hover:shadow-md hover-glow'
                    : alert === 'danger'
                    ? 'border-red-500/30 bg-red-500/10 hover:shadow-md hover-glow'
                    : alert === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/10 hover:shadow-md hover-glow'
                    : 'border-pw-border bg-pw-surface-2 hover:border-pw-accent/30 hover:shadow-md hover-glow'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-pw-text-muted uppercase">
                    {payment.is_suspended ? 'Sospesa' : `Mese ${ordinal}`}
                  </span>
                  {payment.is_suspended ? (
                    <div className="w-6 h-6 rounded-full bg-pw-surface-3 flex items-center justify-center">
                      <Pause size={12} className="text-pw-text-muted" />
                    </div>
                  ) : payment.is_paid ? (
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
                <p className={`text-sm font-medium capitalize ${payment.is_suspended ? 'text-pw-text-muted' : 'text-pw-text'}`}>
                  {formatMonthLabel(payment.due_date)}
                </p>
                <p className={`text-lg font-bold mt-1 ${
                  payment.is_suspended
                    ? 'text-pw-text-dim line-through'
                    : payment.is_paid
                    ? 'text-green-400'
                    : alert === 'danger'
                    ? 'text-red-400'
                    : alert === 'warning'
                    ? 'text-amber-400'
                    : 'text-pw-text'
                }`}>
                  {formatCurrency(payment.amount)}
                </p>
                {payment.is_suspended ? (
                  <p className="text-[10px] text-pw-text-dim mt-1 pr-8 truncate">
                    {payment.suspension_reason || 'Non dovuta — riattivala per rimetterla in conto'}
                  </p>
                ) : payment.is_paid && payment.paid_at ? (
                  <p className="text-[10px] text-green-400 mt-1 pr-8">
                    Pagato il {new Date(payment.paid_at).toLocaleDateString('it-IT')}
                  </p>
                ) : alert === 'danger' ? (
                  <p className="text-[10px] text-red-400 mt-1 font-medium pr-8">
                    Pagamento in ritardo!
                  </p>
                ) : alert === 'warning' ? (
                  <p className="text-[10px] text-amber-400 mt-1 font-medium pr-8">
                    In scadenza
                  </p>
                ) : (
                  <p className="text-[10px] text-pw-text-dim mt-1 pr-8">
                    Clicca per segnare come pagato
                  </p>
                )}
              </button>

              {/* Sospendi/riattiva: fuori dalla card perché un button non può
                  stare dentro un altro button. Nascosto sulle rate pagate:
                  vanno prima stornate. */}
              {!payment.is_paid && (
                <button
                  type="button"
                  onClick={() => openSuspend(payment)}
                  title={payment.is_suspended ? 'Riattiva mensilità' : 'Sospendi mensilità'}
                  aria-label={`${payment.is_suspended ? 'Riattiva' : 'Sospendi'} la mensilità di ${formatMonthLabel(payment.due_date)}`}
                  className="absolute bottom-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center text-pw-text-muted hover:text-pw-accent hover:bg-pw-surface-3 transition-colors duration-200 ease-out"
                >
                  {payment.is_suspended ? <Play size={14} /> : <Pause size={14} />}
                </button>
              )}
            </div>
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
                <p className="text-sm text-pw-text-muted mb-4">
                  Confermi di aver ricevuto il pagamento per questa mensilità?
                </p>
                {/* Data effettiva del pagamento (default oggi, modificabile per arretrati) */}
                <label className="block mb-4">
                  <span className="text-sm text-pw-text-muted block mb-1">Data del pagamento</span>
                  <input
                    type="date"
                    value={paidDate}
                    max={todayISO()}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:outline-none focus:border-pw-accent"
                  />
                </label>
              </>
            )}
            {/* WhatsApp option - only when confirming payment */}
            {!confirmPayment.is_paid && clientPhone && (
              <label className="flex items-center gap-2 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={sendWhatsapp}
                  onChange={(e) => setSendWhatsapp(e.target.checked)}
                  className="w-4 h-4 rounded border-pw-border bg-pw-surface-2 accent-green-500"
                />
                <MessageCircle size={16} className="text-green-500" />
                <span className="text-sm text-pw-text">Invia conferma su WhatsApp</span>
              </label>
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

      {/* Sospensione mensilità */}
      <Modal
        open={!!suspendPayment}
        onClose={() => setSuspendPayment(null)}
        title={suspendPayment?.is_suspended ? 'Riattiva Mensilità' : 'Sospendi Mensilità'}
        size="sm"
      >
        {suspendPayment && (
          <div>
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-pw-surface-2">
              {suspendPayment.is_suspended ? (
                <Play size={20} className="text-pw-accent shrink-0" />
              ) : (
                <Pause size={20} className="text-pw-text-muted shrink-0" />
              )}
              <p className="text-sm text-pw-text-muted">
                {suspendPayment.is_suspended
                  ? 'Stai per rimettere in conto questa mensilità'
                  : 'Il cliente è fermo: questa mensilità non sarà dovuta'}
              </p>
            </div>

            <p className="text-pw-text-muted text-sm mb-1">
              <strong className="capitalize">{formatMonthLabel(suspendPayment.due_date)}</strong>
            </p>
            <p className="text-2xl font-bold text-pw-text mb-4">
              {formatCurrency(suspendPayment.amount)}
            </p>

            <div className="text-sm text-pw-text-muted mb-4 p-3 rounded-xl border border-pw-border">
              {suspendPayment.is_suspended ? (
                <>
                  Tornerà dovuta e il contratto si accorcerà di un mese: l&apos;ultima mensilità
                  aggiunta in coda viene rimossa. Se nel frattempo è già stata pagata o toccata,
                  resta dov&apos;è e il contratto mantiene il mese in più.
                </>
              ) : (
                <>
                  Non risulterà più in ritardo né nel cashflow, e il contratto si allungherà di un
                  mese{tailMonth ? <>: viene aggiunta <strong className="capitalize">{tailMonth}</strong> in coda</> : null}.
                  Il Valore Contratto non cambia.
                </>
              )}
            </div>

            {!suspendPayment.is_suspended && (
              <label className="block mb-4">
                <span className="text-sm text-pw-text-muted block mb-1">Motivo (facoltativo)</span>
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Es. cliente fermo per ferie"
                  maxLength={120}
                  className="w-full px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:outline-none focus:border-pw-accent"
                />
              </label>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setSuspendPayment(null)} className="flex-1">
                Annulla
              </Button>
              <Button onClick={handleConfirmSuspend} variant="primary" className="flex-1">
                {suspendPayment.is_suspended ? 'Riattiva Mensilità' : 'Sospendi Mensilità'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
