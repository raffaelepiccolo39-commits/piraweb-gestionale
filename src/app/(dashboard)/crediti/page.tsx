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
import { useToast } from '@/components/ui/toast';
import { formatDate, todayLocal } from '@/lib/utils';
import { reportSupabaseError } from '@/lib/report-error';
import { HandCoins, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Crediti da recuperare (admin): tutte le rate scadute e non incassate, per
 * cliente. La lista di lavoro per gli incassi — "Segna incassato" quando il
 * cliente paga (RPC toggle_payment_paid) e la rata sparisce ed entra nel cashflow.
 */

interface Row {
  id: string;
  amount: number;
  due_date: string;
  client_id: string;
  client_name: string;
  contract_status: string;
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

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('client_payments')
      .select('id, amount, due_date, contract:client_contracts!client_payments_contract_id_fkey(status, client:clients(id, name, company))')
      .eq('is_paid', false)
      .lte('due_date', todayLocal())
      .order('due_date', { ascending: true });

    if (error) { reportSupabaseError(error, 'crediti-carica'); setLoading(false); return; }

    const list: Row[] = ((data as unknown as {
      id: string; amount: number; due_date: string;
      contract: { status: string; client: { id: string; name: string; company: string | null } | null } | null;
    }[]) ?? []).map((r) => ({
      id: r.id,
      amount: Number(r.amount) || 0,
      due_date: r.due_date,
      client_id: r.contract?.client?.id ?? '—',
      client_name: r.contract?.client?.company || r.contract?.client?.name || 'Cliente',
      contract_status: r.contract?.status ?? '—',
    }));
    setRows(list);
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

  async function markPaid(id: string) {
    if (!profile) return;
    setPaying(id);
    const { error } = await supabase.rpc('toggle_payment_paid', { p_payment_id: id, p_performed_by: profile.id });
    setPaying(null);
    if (error) { reportSupabaseError(error, 'crediti-segna-incassato', { id }); toast.error('Errore, riprova'); return; }
    toast.success('Rata incassata');
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  if (!isAdmin) {
    return <EmptyState icon={ShieldCheck} title="Area riservata" description="I crediti da recuperare sono visibili solo agli amministratori." />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader eyebrow="Business" title="Crediti da recuperare" subtitle="Rate scadute e non ancora incassate, per cliente" />

      {loading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nessun credito in sospeso" description="Tutte le rate scadute risultano incassate. 🎉" />
      ) : (
        <>
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pw-danger-soft">
                <HandCoins className="h-6 w-6 text-pw-danger" />
              </div>
              <div>
                <p className="text-2xl font-bold text-pw-text leading-none">{euro(total)}</p>
                <p className="mt-1 text-xs text-pw-text-dim">da recuperare · {rows.length} rate · {groups.length} clienti</p>
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
                          <span className="flex-1" />
                          <span className="text-sm font-semibold text-pw-text tabular-nums">{euro(r.amount)}</span>
                          <Button size="sm" variant="soft" loading={paying === r.id} onClick={() => markPaid(r.id)}>
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
            <AlertTriangle size={13} /> Include anche le rate di contratti già conclusi. Se una risulta pagata ma non segnata, "Segna incassato" la sistema.
          </p>
        </>
      )}
    </div>
  );
}
