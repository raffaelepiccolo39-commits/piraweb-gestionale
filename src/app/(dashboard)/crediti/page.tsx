'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatDate, todayLocal } from '@/lib/utils';
import { reportSupabaseError } from '@/lib/report-error';
import { HandCoins, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Crediti da recuperare (admin): tutto quello che è scaduto e non incassato,
 * per cliente. La lista di lavoro per gli incassi — "Segna incassato" quando il
 * cliente paga e la voce sparisce ed entra nel cashflow.
 *
 * Due fonti: le rate del canone (client_payments, via RPC toggle_payment_paid)
 * e gli acconti dei lavori one-shot (client_installments, che si segnano
 * scrivendo paid_at). Gli acconti senza scadenza non compaiono: senza una data
 * non c'è modo di dirli in ritardo.
 */

type TipoCredito = 'rata' | 'acconto';

interface Row {
  id: string;
  kind: TipoCredito;
  /** Descrizione dell'acconto ("Acconto 1", "Saldo"). Vuota per le rate. */
  label: string;
  amount: number;
  due_date: string;
  client_id: string;
  client_name: string;
}

function euro(n: number): string {
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`;
}

function daysOverdue(due: string): number {
  const d = new Date(`${due}T00:00:00`);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((t.getTime() - d.getTime()) / 86_400_000));
}

export default function CreditiPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  // L'incasso entra nel cashflow e la rata sparisce dalla lista: prima si conferma.
  const [confirming, setConfirming] = useState<Row | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const oggi = todayLocal();
    const [rateRes, accontiRes] = await Promise.all([
      supabase
        .from('client_payments')
        .select('id, amount, due_date, contract:client_contracts!client_payments_contract_id_fkey(status, client:clients(id, name, company))')
        .eq('is_paid', false)
        .lte('due_date', oggi)
        .order('due_date', { ascending: true }),
      supabase
        .from('client_installments')
        .select('id, amount, due_date, label, client:clients(id, name, company)')
        .is('paid_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', oggi)
        .order('due_date', { ascending: true }),
    ]);

    const error = rateRes.error ?? accontiRes.error;
    if (error) { reportSupabaseError(error, 'crediti-carica'); setLoading(false); return; }

    const rate: Row[] = ((rateRes.data as unknown as {
      id: string; amount: number; due_date: string;
      contract: { status: string; client: { id: string; name: string; company: string | null } | null } | null;
    }[]) ?? []).map((r) => ({
      id: r.id,
      kind: 'rata' as const,
      label: '',
      amount: Number(r.amount) || 0,
      due_date: r.due_date,
      client_id: r.contract?.client?.id ?? '—',
      client_name: r.contract?.client?.company || r.contract?.client?.name || 'Cliente',
    }));

    const acconti: Row[] = ((accontiRes.data as unknown as {
      id: string; amount: number; due_date: string; label: string;
      client: { id: string; name: string; company: string | null } | null;
    }[]) ?? []).map((r) => ({
      id: r.id,
      kind: 'acconto' as const,
      label: r.label,
      amount: Number(r.amount) || 0,
      due_date: r.due_date,
      client_id: r.client?.id ?? '—',
      client_name: r.client?.company || r.client?.name || 'Cliente',
    }));

    setRows([...rate, ...acconti].sort((a, b) => a.due_date.localeCompare(b.due_date)));
    setLoading(false);
  }, [supabase, isAdmin]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  // Raggruppa per cliente, ordinato per importo dovuto (chi deve di più in alto).
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; rows: Row[]; total: number }>();
    for (const r of rows) {
      const g = m.get(r.client_id) ?? { name: r.client_name, rows: [], total: 0 };
      g.rows.push(r); g.total += r.amount;
      m.set(r.client_id, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  async function markPaid(row: Row) {
    if (!profile) return;
    setPaying(row.id);
    // Due tabelle, due modi di segnare l'incasso: la rata passa dalla RPC (che
    // scrive anche il log pagamenti), l'acconto è un semplice paid_at — il suo
    // audit lo fa il trigger su client_installments.
    const { error } = row.kind === 'acconto'
      ? await supabase.from('client_installments').update({ paid_at: new Date().toISOString() }).eq('id', row.id)
      : await supabase.rpc('toggle_payment_paid', { p_payment_id: row.id, p_performed_by: profile.id });
    setPaying(null);
    if (error) { reportSupabaseError(error, 'crediti-segna-incassato', { id: row.id, kind: row.kind }); toast.error('Errore, riprova'); return; }
    toast.success(row.kind === 'acconto' ? 'Acconto incassato' : 'Rata incassata');
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  if (!isAdmin) {
    return <EmptyState icon={ShieldCheck} title="Area riservata" description="I crediti da recuperare sono visibili solo agli amministratori." />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader eyebrow="Business" title="Crediti da recuperare" subtitle="Rate e acconti scaduti e non ancora incassati, per cliente" />

      {loading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nessun credito in sospeso" description="Tutte le rate e gli acconti scaduti risultano incassati. 🎉" />
      ) : (
        <>
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pw-danger-soft">
                <HandCoins className="h-6 w-6 text-pw-danger" />
              </div>
              <div>
                <p className="text-2xl font-bold text-pw-text leading-none">{euro(total)}</p>
                <p className="mt-1 text-xs text-pw-text-dim">da recuperare · {rows.length} voci · {groups.length} clienti</p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {groups.map((g) => (
              <Card key={g.name}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-pw-border px-4 py-3">
                    <span className="font-semibold text-pw-text">{g.name}</span>
                    <span className="text-sm font-semibold text-pw-danger tabular-nums">{euro(g.total)}</span>
                  </div>
                  <div className="divide-y divide-pw-border">
                    {g.rows.map((r) => {
                      const dd = daysOverdue(r.due_date);
                      const tone = dd > 90 ? 'danger' : dd > 30 ? 'warning' : 'neutral';
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="w-24 shrink-0 text-sm text-pw-text-muted tabular-nums">{formatDate(r.due_date)}</span>
                          <Badge tone={tone} size="sm">{dd === 0 ? 'oggi' : `${dd}gg fa`}</Badge>
                          <span className="flex-1 min-w-0 truncate text-sm text-pw-text-muted">
                            {r.kind === 'acconto' && (r.label || 'Acconto')}
                          </span>
                          <span className="text-sm font-semibold text-pw-text tabular-nums">{euro(r.amount)}</span>
                          <Button size="sm" variant="soft" loading={paying === r.id} onClick={() => setConfirming(r)}>
                            <CheckCircle2 size={14} /> Segna incassato
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="flex items-center gap-2 text-xs text-pw-text-dim">
            <AlertTriangle size={13} /> Include le rate di contratti già conclusi e gli acconti scaduti dei lavori a progetto. Se una voce risulta pagata ma non segnata, "Segna incassato" la sistema.
          </p>
        </>
      )}

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={async () => { if (confirming) await markPaid(confirming); }}
        title="Confermi l'incasso?"
        variant="primary"
        icon={HandCoins}
        confirmLabel="Sì, incassato"
        description={confirming ? (
          <>
            Stai segnando come incassato {confirming.kind === 'acconto' ? `l'acconto "${confirming.label || 'Acconto'}"` : 'la rata'} di{' '}
            <strong className="text-pw-text">{confirming.client_name}</strong> da{' '}
            <strong className="text-pw-text">{euro(confirming.amount)}</strong>, scaduta il{' '}
            {formatDate(confirming.due_date)}.
            <br />
            Sparisce dai crediti ed entra nel cashflow come entrata: fallo solo se i soldi
            sono arrivati davvero. Per annullarlo devi passare dalla scheda del cliente.
          </>
        ) : ''}
      />
    </div>
  );
}
