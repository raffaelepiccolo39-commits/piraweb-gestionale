'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { ETICHETTE_SOURCE } from '@/types/database';
import { reportUnknown } from '@/lib/report-error';

interface Kpi {
  giorni: number;
  sales_cycle_giorni: number | null;
  close_rate: number | null;
  pct_con_next_action: number | null;
  per_source: { source: string; lead: number; won: number; canone_medio_won: number | null }[];
  per_stage: { stage: number; etichetta: string; giorni_medi: number }[];
}

/**
 * KPI commerciali (§10). Niente grafici in v1: bastano i numeri.
 *
 * Il primo che si legge è l'igiene della pipeline — la percentuale di
 * opportunità aperte con una prossima azione. Sotto il 95% gli altri numeri
 * valgono poco, perché descrivono dati che nessuno sta tenendo aggiornati.
 */
export function PannelloKpi() {
  const supabase = createClient();
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('crm_kpi', { p_giorni: 90 });
      if (error) { setErrore('Non è stato possibile calcolare i KPI'); return; }
      setKpi(data as Kpi);
    } catch (e) {
      reportUnknown(e, 'client', { route: '/crm', rpc: 'crm_kpi' });
      setErrore('Non è stato possibile calcolare i KPI');
    }
  }, [supabase]);

  useEffect(() => { void carica(); }, [carica]);

  if (errore) return <p className="text-sm text-pw-text-dim">{errore}</p>;
  if (!kpi) return <p className="text-sm text-pw-text-dim">Calcolo in corso…</p>;

  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const igiene = kpi.pct_con_next_action;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tessera
          etichetta="Con prossima azione"
          valore={pct(igiene)}
          nota={igiene != null && igiene < 0.95 ? 'Sotto il target del 95%' : 'Target: oltre il 95%'}
          allarme={igiene != null && igiene < 0.95}
        />
        <Tessera
          etichetta="Close rate"
          valore={pct(kpi.close_rate)}
          nota={`Ultimi ${kpi.giorni} giorni, storico escluso`}
        />
        <Tessera
          etichetta="Sales cycle"
          valore={kpi.sales_cycle_giorni == null ? '—' : `${kpi.sales_cycle_giorni} gg`}
          nota="Dalla creazione all'esito, sulle vinte"
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-pw-text">Per provenienza</h3>
        <ul className="divide-y divide-pw-border/60 overflow-hidden rounded-xl border border-pw-border/60 bg-pw-surface">
          {kpi.per_source.map((r) => (
            <li key={r.source} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="text-pw-text">{ETICHETTE_SOURCE[r.source] ?? r.source}</span>
              <span className="tabular-nums text-pw-text-dim">
                {r.lead} lead · {r.won} vinte
                {r.canone_medio_won != null && ` · ${formatCurrency(r.canone_medio_won)}/mese medio`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-pw-text">
          Dove si inceppa la pipeline
        </h3>
        <ul className="divide-y divide-pw-border/60 overflow-hidden rounded-xl border border-pw-border/60 bg-pw-surface">
          {kpi.per_stage.length === 0 ? (
            <li className="p-3 text-sm text-pw-text-dim">Ancora troppo poco storico per dirlo.</li>
          ) : kpi.per_stage.map((r) => (
            <li key={r.stage} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="text-pw-text">{r.etichetta}</span>
              <span className="tabular-nums text-pw-text-dim">{r.giorni_medi} giorni medi</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Tessera({ etichetta, valore, nota, allarme }: { etichetta: string; valore: string; nota: string; allarme?: boolean }) {
  return (
    <div className="rounded-xl border border-pw-border/60 bg-pw-surface p-3">
      <p className="text-xs text-pw-text-dim">{etichetta}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${allarme ? 'text-red-500' : 'text-pw-text'}`}>{valore}</p>
      <p className="mt-0.5 text-[11px] text-pw-text-dim">{nota}</p>
    </div>
  );
}
