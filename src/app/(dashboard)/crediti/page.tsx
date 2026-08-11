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
 * Crediti da recuperare (admin): tutte le rate scadute e non incassate, per
 * cliente. La lista di lavoro per gli incassi — "Segna incassato" quando il
 * cliente paga (RPC toggle_payment_paid) e la rata sparisce ed entra nel cashflow.
 */

interface Row {
  id: string;
  /** Importo pieno della rata. */
  amount: number;
  /** Quanto resta davvero da avere dopo gli acconti già incassati dal cliente. */
  residuo: number;
  due_date: string;
  client_id: string;
  client_name: string;
  contract_status: string;
}

/** Quanto acconto è stato usato per coprire le rate di un cliente. */
interface Copertura {
  applicato: number;
  rateCoperte: number;
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
  const [coperture, setCoperture] = useState<Map<string, Copertura>>(new Map());
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  // L'incasso entra nel cashflow e la rata sparisce dalla lista: prima si conferma.
  const [confirming, setConfirming] = useState<Row | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const [rateRes, accontiRes] = await Promise.all([
      supabase
        .from('client_payments')
        .select('id, amount, due_date, contract:client_contracts!client_payments_contract_id_fkey(status, client:clients(id, name, company))')
        .eq('is_paid', false)
        .lte('due_date', todayLocal())
        .order('due_date', { ascending: true }),
      // Acconti già incassati: sono soldi che il cliente ha versato su quanto
      // deve, quindi vanno scalati da qui. Le rate che coprono restano segnate
      // "da incassare" (è il modo in cui teniamo i conti), perciò senza questo
      // passaggio il cliente risultava debitore di soldi che ha già dato.
      supabase.from('client_installments').select('client_id, amount').not('paid_at', 'is', null),
    ]);

    const error = rateRes.error ?? accontiRes.error;
    if (error) { reportSupabaseError(error, 'crediti-carica'); setLoading(false); return; }

    const list: Row[] = ((rateRes.data as unknown as {
      id: string; amount: number; due_date: string;
      contract: { status: string; client: { id: string; name: string; company: string | null } | null } | null;
    }[]) ?? []).map((r) => ({
      id: r.id,
      amount: Number(r.amount) || 0,
      residuo: Number(r.amount) || 0,
      due_date: r.due_date,
      client_id: r.contract?.client?.id ?? '—',
      client_name: r.contract?.client?.company || r.contract?.client?.name || 'Cliente',
      contract_status: r.contract?.status ?? '—',
    }));

    // Credito disponibile per cliente = tutti i suoi acconti incassati.
    const credito = new Map<string, number>();
    for (const a of (accontiRes.data as { client_id: string; amount: number }[]) ?? []) {
      credito.set(a.client_id, (credito.get(a.client_id) ?? 0) + (Number(a.amount) || 0));
    }

    // Si scala dalle rate più vecchie: è l'ordine in cui un cliente salda.
    // Le rate interamente coperte spariscono (non c'è niente da recuperare),
    // quella a cavallo resta con il solo residuo.
    const copertura = new Map<string, Copertura>();
    for (const r of list) {
      const disponibile = credito.get(r.client_id) ?? 0;
      if (disponibile <= 0) continue;
      const usato = Math.min(disponibile, r.residuo);
      r.residuo -= usato;
      credito.set(r.client_id, disponibile - usato);
      const c = copertura.get(r.client_id) ?? { applicato: 0, rateCoperte: 0 };
      c.applicato += usato;
      if (r.residuo === 0) c.rateCoperte += 1;
      copertura.set(r.client_id, c);
    }

    setCoperture(copertura);
    // Sotto il centesimo è rumore di arrotondamento, non un credito.
    setRows(list.filter((r) => r.residuo > 0.005));
    setLoading(false);
  }, [supabase, isAdmin]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.residuo, 0), [rows]);

  // Raggruppa per cliente, ordinato per importo dovuto (chi deve di più in alto).
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; rows: Row[]; total: number; copertura?: Copertura }>();
    for (const r of rows) {
      const g = m.get(r.client_id) ?? { name: r.client_name, rows: [], total: 0, copertura: coperture.get(r.client_id) };
      g.rows.push(r); g.total += r.residuo;
      m.set(r.client_id, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows, coperture]);

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
        <EmptyState icon={CheckCircle2} title="Nessun credito in sospeso" description="Tutte le rate scadute risultano incassate, fra pagamenti e acconti. 🎉" />
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
                  <div className="border-b border-pw-border px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-pw-text">{g.name}</span>
                      <span className="text-sm font-semibold text-pw-danger tabular-nums">{euro(g.total)}</span>
                    </div>
                    {g.copertura && g.copertura.applicato > 0 && (
                      <p className="mt-1 text-xs text-green-600 dark:text-green-500">
                        {euro(g.copertura.applicato)} già arrivati come acconto, scalati qui
                        {g.copertura.rateCoperte > 0 && ` · ${g.copertura.rateCoperte} ${g.copertura.rateCoperte === 1 ? 'rata coperta' : 'rate coperte'}`}
                      </p>
                    )}
                  </div>
                  <div className="divide-y divide-pw-border">
                    {g.rows.map((r) => {
                      const dd = daysOverdue(r.due_date);
                      const tone = dd > 90 ? 'danger' : dd > 30 ? 'warning' : 'neutral';
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="w-24 shrink-0 text-sm text-pw-text-muted tabular-nums">{formatDate(r.due_date)}</span>
                          <Badge tone={tone} size="sm">{dd === 0 ? 'oggi' : `${dd}gg fa`}</Badge>
                          <span className="flex-1 min-w-0 truncate text-xs text-pw-text-dim">
                            {r.residuo < r.amount && `resto della rata da ${euro(r.amount)}`}
                          </span>
                          <span className="text-sm font-semibold text-pw-text tabular-nums">{euro(r.residuo)}</span>
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
            <AlertTriangle size={13} /> Gli acconti già incassati sono scalati dalle rate più vecchie. Include anche le rate di contratti già conclusi. Se una risulta pagata ma non segnata, "Segna incassato" la sistema.
          </p>
        </>
      )}

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={async () => { if (confirming) await markPaid(confirming.id); }}
        title="Confermi l'incasso?"
        variant="primary"
        icon={HandCoins}
        confirmLabel="Sì, incassato"
        description={confirming ? (
          <>
            Stai segnando come incassata la rata di{' '}
            <strong className="text-pw-text">{confirming.client_name}</strong> da{' '}
            <strong className="text-pw-text">{euro(confirming.amount)}</strong>, scaduta il{' '}
            {formatDate(confirming.due_date)}.
            <br />
            Sparisce dai crediti ed entra nel cashflow come entrata: fallo solo se i soldi
            sono arrivati davvero. Per annullarlo devi passare dalla scheda del cliente.
            {confirming.residuo < confirming.amount && (
              <>
                <br /><br />
                <strong className="text-amber-500">Attenzione:</strong> di questa rata restano{' '}
                <strong className="text-pw-text">{euro(confirming.residuo)}</strong>, il resto è già
                coperto da un acconto. Segnandola incassata conti l&apos;intera rata da{' '}
                {euro(confirming.amount)}, quindi quella parte finirebbe nel cashflow due volte.
                Se ti è arrivato solo il resto, registralo come nuovo acconto sulla scheda del cliente.
              </>
            )}
          </>
        ) : ''}
      />
    </div>
  );
}
