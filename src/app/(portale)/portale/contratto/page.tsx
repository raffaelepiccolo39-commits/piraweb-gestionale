'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { Loader2, FileText } from 'lucide-react';

/**
 * Il contratto del cliente, in sola lettura.
 *
 * Il PDF NON è scaricabile da qui: sta nel bucket privato "contracts", le
 * cui policy sono admin-only. Aprire il bucket sarebbe stato più veloce e
 * molto peggio; quando servirà, il download passerà da una route che genera
 * un link firmato dopo aver verificato current_client_id().
 */

interface Contract {
  id: string;
  monthly_fee: number;
  duration_months: number;
  start_date: string;
  status: string;
  payment_timing: string | null;
}

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n));

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

const STATUS_LABEL: Record<string, string> = {
  active: 'Attivo',
  completed: 'Concluso',
  cancelled: 'Annullato',
};

export default function PortaleContrattoPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  // Non uno solo: due clienti su quattordici hanno più di un contratto
  // (verificato sui dati veri il 20/07). Mostrarne uno solo ne nasconderebbe
  // metà proprio a chi ci ha dato più lavoro.
  const fetchContract = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_contracts')
      .select('id, monthly_fee, duration_months, start_date, status, payment_timing')
      .order('start_date', { ascending: false });

    if (error) reportSupabaseError(error, 'portale-contratto', {});
    setContracts((data as Contract[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchContract(); }, [fetchContract]);

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (contracts.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <FileText size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Nessun contratto registrato</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Qui troverai le condizioni del nostro accordo. Se ti aspettavi di vederlo, scrivici pure.
        </p>
      </div>
    );
  }

  const rowsFor = (c: Contract): Array<[string, string]> => {
    const rows: Array<[string, string]> = [
      ['Canone mensile', euro(c.monthly_fee)],
      ['Durata', c.duration_months ? `${c.duration_months} mesi` : 'Senza scadenza'],
      ['Inizio', formatDate(c.start_date)],
      ['Stato', STATUS_LABEL[c.status] || c.status],
    ];
    if (c.payment_timing) {
      rows.push(['Pagamento', c.payment_timing === 'inizio_mese' ? 'A inizio mese' : 'A fine mese']);
    }
    return rows;
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-pw-text">
          {contracts.length > 1 ? 'I nostri accordi' : 'Il nostro accordo'}
        </h2>
        <p className="text-sm text-pw-text-muted">
          {contracts.length > 1 ? `${contracts.length} contratti` : 'Le condizioni in vigore'}
        </p>
      </div>

      <div className="space-y-4">
        {contracts.map((c) => (
          <div key={c.id} className="rounded-2xl border border-pw-border bg-pw-surface divide-y divide-pw-border">
            {rowsFor(c).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <span className="text-sm text-pw-text-muted">{label}</span>
                <span className="text-sm font-medium text-pw-text text-right">{value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-pw-text-dim mt-5 text-center">
        Ti serve una copia firmata del contratto? Scrivici e te la mandiamo.
      </p>
    </>
  );
}
