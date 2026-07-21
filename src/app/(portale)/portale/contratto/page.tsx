'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { Loader2, FileText, Download } from 'lucide-react';

/**
 * Il contratto del cliente, in sola lettura.
 *
 * Il PDF sta nel bucket privato "contracts", con policy admin-only: il
 * download passa da /api/portal/contratto/[id], che firma il link per un
 * minuto dopo che l'RLS ha confermato che il contratto è di chi lo chiede.
 * Aprire il bucket sarebbe stato più veloce e molto peggio.
 */

interface Contract {
  id: string;
  monthly_fee: number;
  duration_months: number;
  start_date: string;
  status: string;
  payment_timing: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
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
      .select('id, monthly_fee, duration_months, start_date, status, payment_timing, attachment_url, attachment_name')
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
          Qui troverai le condizioni del nostro accordo.
        </p>
        <a href="/portale/messaggi" className="inline-block mt-4 text-sm font-medium text-pw-accent hover:underline">
          Te lo aspettavi? Scrivici
        </a>
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

            {/* Il file sta in un bucket privato: il link passa da una route che
                lo firma per un minuto dopo aver verificato che sia suo. */}
            {c.attachment_url && (
              <a
                href={`/api/portal/contratto/${c.id}`}
                className="flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium text-pw-accent hover:bg-pw-surface-2 transition-colors rounded-b-2xl"
              >
                <Download size={16} /> Scarica il contratto
              </a>
            )}
          </div>
        ))}
      </div>

      {!contracts.some((c) => c.attachment_url) && (
        <p className="text-[11px] text-pw-text-dim mt-5 text-center">
          Ti serve una copia firmata? <a href="/portale/messaggi" className="text-pw-accent hover:underline">Scrivici</a> e te la mandiamo.
        </p>
      )}
    </>
  );
}
