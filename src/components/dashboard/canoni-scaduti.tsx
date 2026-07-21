'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError } from '@/lib/report-error';
import { Receipt, ArrowRight } from 'lucide-react';

/**
 * Canoni scaduti e non incassati, in dashboard (solo admin).
 *
 * La lista esisteva già in /crediti, ma bisognava ricordarsi di aprirla: le
 * rate di contratto non comparivano da nessuna parte finché non si andava a
 * cercarle, e il cron dei solleciti lavora sulle fatture, non su queste.
 * Il cliente il modo di pagare lo sa: quello che serviva era che ce ne
 * ricordassimo noi.
 *
 * Stesso schema dei rinnovi siti qui accanto — se non c'è niente da
 * incassare, la card non compare affatto.
 */

interface RataRow {
  id: string;
  due_date: string;
  amount: number;
  contract: {
    status: string;
    client: { name: string; company: string | null } | null;
  } | null;
}

/** Giorni da quando è scaduta (positivo = giorni di ritardo). */
function giorniDiRitardo(dateStr: string): number {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const scadenza = new Date(`${dateStr}T00:00:00`);
  return Math.round((oggi.getTime() - scadenza.getTime()) / 86_400_000);
}

function euro(n: number): string {
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`;
}

export function CanoniScaduti() {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();
  const [righe, setRighe] = useState<RataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [incasso, setIncasso] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
    const limite = ieri.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('client_payments')
      .select('id, due_date, amount, contract:client_contracts!client_payments_contract_id_fkey(status, client:clients(name, company))')
      .eq('is_paid', false)
      // Solo quelle già scadute: le rate del mese in corso non sono un
      // problema, e metterle qui renderebbe la card sempre piena — cioè
      // ignorabile.
      .lte('due_date', limite)
      .order('due_date', { ascending: true });

    if (error) { reportSupabaseError(error, 'dashboard-canoni-scaduti'); setLoading(false); return; }

    // I contratti chiusi o annullati non si inseguono più.
    const lista = ((data as unknown as RataRow[]) ?? []).filter((r) => r.contract?.status === 'active');
    setRighe(lista);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void carica(); }, [carica]);

  async function segnaIncassato(id: string) {
    if (!profile) return;
    setIncasso(id);
    const { error } = await supabase.rpc('toggle_payment_paid', { p_payment_id: id, p_performed_by: profile.id });
    setIncasso(null);
    if (error) { reportSupabaseError(error, 'dashboard-incassa-canone', { id }); toast.error('Errore, riprova'); return; }
    toast.success('Rata incassata');
    setRighe((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading || righe.length === 0) return null;

  const totale = righe.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-pw-text">
            <Receipt size={16} className="text-pw-accent" />
            Canoni da incassare
            <span className="text-xs font-normal text-pw-text-dim">
              {righe.length} {righe.length === 1 ? 'rata' : 'rate'} · {euro(totale)}
            </span>
          </h2>
          <Link href="/crediti" className="inline-flex items-center gap-1 text-xs text-pw-accent hover:underline">
            Crediti <ArrowRight size={12} />
          </Link>
        </div>

        <div className="space-y-1.5">
          {righe.map((r) => {
            const ritardo = giorniDiRitardo(r.due_date);
            const nomeCliente = r.contract?.client?.company || r.contract?.client?.name || 'Cliente';
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-pw-border bg-pw-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-pw-text">{nomeCliente}</p>
                  <p className="truncate text-xs text-pw-text-dim">
                    {euro(r.amount)} · mensilità di{' '}
                    <span className="capitalize">
                      {new Date(`${r.due_date}T00:00:00`).toLocaleDateString('it-IT', { month: 'long' })}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-pw-danger">
                  {ritardo === 1 ? 'da 1 giorno' : `da ${ritardo} giorni`}
                </span>
                <Button size="sm" variant="soft" loading={incasso === r.id} onClick={() => segnaIncassato(r.id)}>
                  Segna incassato
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
