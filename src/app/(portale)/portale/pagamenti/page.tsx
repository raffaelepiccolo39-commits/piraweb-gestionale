'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Loader2, Receipt, Check, Clock } from 'lucide-react';

/**
 * Le rate del cliente. Sola lettura: la RLS
 * ("Il cliente vede le proprie rate") restringe già al proprio contratto.
 *
 * Tono volutamente neutro: mostriamo cosa risulta pagato e cosa deve ancora
 * scadere, senza allarmi rossi. Una rata risulta non pagata anche solo
 * perché non è ancora stata spuntata in gestionale, e un cliente che ha
 * appena bonificato non deve trovarsi un cartello "NON PAGATO".
 */

interface Payment {
  id: string;
  month_index: number;
  due_date: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
}

// Simbolo davanti e punto delle migliaia, come in fattura. useGrouping
// esplicito: in italiano il separatore sotto le cinque cifre non si mette,
// quindi 1000 diventerebbe "1000,00".
const euro = (n: number) =>
  `€ ${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Number(n))}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * La mensilità a cui la rata si riferisce.
 *
 * "3ª rata" non dice nulla a chi paga: quello che vuole sapere è di quale
 * mese si tratta. Il mese è quello della scadenza, che è come viene emessa.
 */
const mensilita = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

export default function PortalePagamentiPage() {
  const supabase = createClient();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_payments')
      .select('id, month_index, due_date, amount, is_paid, paid_at')
      .order('due_date', { ascending: false });

    if (error) reportSupabaseError(error, 'portale-pagamenti', {});
    setPayments((data as Payment[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <Receipt size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Nessuna rata registrata</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Qui troverai il riepilogo dei pagamenti del tuo abbonamento.
        </p>
      </div>
    );
  }

  const paid = payments.filter((p) => p.is_paid);
  const totalPaid = paid.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-pw-text">Pagamenti</h2>
        <p className="text-sm text-pw-text-muted">
          {paid.length} {paid.length === 1 ? 'rata saldata' : 'rate saldate'} · {euro(totalPaid)}
        </p>
      </div>

      <div className="space-y-2">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-pw-border bg-pw-surface p-4">
            <div className="min-w-0">
              {/* L'importo per primo: e' la cosa che si cerca guardando
                  l'elenco. Sotto il mese, perche' "3ª rata" non dice a chi
                  paga di quale mensilita si tratti. */}
              <p className="text-lg font-bold text-pw-text tabular-nums leading-tight">
                {euro(p.amount)}
              </p>
              <p className="text-sm text-pw-text-muted capitalize mt-0.5">
                Mensilità di {mensilita(p.due_date)}
              </p>
              <p className="text-xs text-pw-text-dim mt-0.5">
                {p.is_paid && p.paid_at
                  ? `Ricevuta il ${formatDate(p.paid_at)}`
                  : `In scadenza il ${formatDate(p.due_date)}`}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium',
                p.is_paid
                  ? 'bg-green-500/10 text-green-500'
                  : new Date(p.due_date) < new Date()
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-pw-surface-2 text-pw-text-dim'
              )}
            >
              {p.is_paid
                ? <><Check size={12} /> Saldata</>
                : new Date(p.due_date) < new Date()
                  ? <><Clock size={12} /> Scaduta</>
                  : <><Clock size={12} /> Da saldare</>}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-pw-text-dim mt-5 text-center">
        Se hai già pagato una rata che qui risulta da saldare, può essere solo che non l&apos;abbiamo ancora registrata.
      </p>
    </>
  );
}
