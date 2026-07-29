'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError } from '@/lib/report-error';
import { Globe, ArrowRight } from 'lucide-react';

/**
 * Promemoria rinnovi siti in dashboard (solo admin): elenca i rinnovi non
 * ancora incassati in scadenza entro 30 giorni (e quelli già scaduti). È
 * l'avviso "30 giorni prima": lo vedi appena apri il gestionale. "Segna
 * incassato" chiude il rinnovo e genera in automatico quello dell'anno dopo.
 */

interface RenewalRow {
  id: string;
  due_date: string;
  amount: number;
  website: {
    status: string;
    site_url: string | null;
    client: { name: string; company: string | null } | null;
  } | null;
}

/** Giorni tra oggi e la scadenza (negativo = già scaduto). */
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function euro(n: number): string {
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`;
}

export function WebsiteRenewals() {
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    const limit = new Date(); limit.setDate(limit.getDate() + 30);
    const limitStr = limit.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('website_renewals')
      .select('id, due_date, amount, website:website_managements(status, site_url, client:clients(name, company))')
      .eq('is_paid', false)
      .lte('due_date', limitStr)
      .order('due_date', { ascending: true });

    if (error) { reportSupabaseError(error, 'dashboard-website-renewals'); setLoading(false); return; }

    const list = ((data as unknown as RenewalRow[]) ?? []).filter((r) => r.website?.status === 'active');
    setRows(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  async function markPaid(id: string) {
    setPaying(id);
    const { error } = await supabase.rpc('pay_website_renewal', { p_renewal_id: id });
    setPaying(null);
    if (error) { reportSupabaseError(error, 'dashboard-pay-website-renewal', { id }); toast.error('Errore, riprova'); return; }
    toast.success('Rinnovo incassato — prossimo anno programmato');
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  // Niente da mostrare (e nessun errore) → non ingombrare la dashboard.
  if (loading || rows.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-pw-text">
            <Globe size={16} className="text-pw-accent" />
            Rinnovi siti in scadenza
          </h2>
          <Link href="/gestione-siti" className="inline-flex items-center gap-1 text-xs text-pw-accent hover:underline">
            Gestione siti <ArrowRight size={12} />
          </Link>
        </div>

        <div className="space-y-1.5">
          {rows.map((r) => {
            const d = daysUntil(r.due_date);
            const overdue = d < 0;
            const clientName = r.website?.client?.company || r.website?.client?.name || 'Cliente';
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-pw-border bg-pw-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-pw-text">{clientName}</p>
                  <p className="truncate text-xs text-pw-text-dim">
                    {r.website?.site_url || 'Sito web'} · {euro(r.amount)}
                  </p>
                </div>
                <span className={overdue ? 'shrink-0 text-xs font-semibold text-pw-danger' : 'shrink-0 text-xs font-medium text-pw-text-muted'}>
                  {overdue ? `scaduto da ${-d}g` : d === 0 ? 'scade oggi' : `tra ${d}g`}
                </span>
                <Button size="sm" variant="soft" loading={paying === r.id} onClick={() => markPaid(r.id)}>
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
