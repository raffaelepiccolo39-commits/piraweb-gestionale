'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { BadgeScore } from '@/components/crm/badge-score';
import { cn, formatCurrency, formatDate, todayLocal } from '@/lib/utils';
import type { CrmAttivita, CrmStage, CrmStageLog, Deal } from '@/types/database';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  opportunita: Deal[];
  stage: CrmStage[];
  onApri: (deal: Deal) => void;
  onAvanza: (deal: Deal) => Promise<string | null>;
  onNurture: (deal: Deal) => Promise<string | null>;
}

/**
 * Vista Sales Review (§7.3) — la schermata del lunedì.
 *
 * L'ordine delle sezioni non è estetico: si parte da quelle che dovrebbero
 * essere vuote. Se la prima lista ha righe, la riunione comincia da lì.
 */
export function SalesReview({ opportunita, stage, onApri, onAvanza, onNurture }: Props) {
  const supabase = createClient();
  const [followup, setFollowup] = useState<CrmAttivita[]>([]);
  const [movimenti, setMovimenti] = useState<CrmStageLog[]>([]);

  const carica = useCallback(async () => {
    // Le finestre temporali si calcolano qui e non durante il render: l'ora
    // corrente non è un valore stabile su cui far dipendere una vista.
    const adesso = Date.now();
    const settimanaFa = new Date(adesso - 7 * 86_400_000).toISOString();
    const fraSetteGiorni = new Date(adesso + 7 * 86_400_000).toISOString();

    const [att, log] = await Promise.all([
      supabase.from('crm_attivita').select('*')
        .eq('sequenza', 'followup_proposta').eq('stato', 'aperta')
        .lte('due_at', fraSetteGiorni).order('due_at'),
      supabase.from('crm_stage_log').select('*').gte('changed_at', settimanaFa),
    ]);
    setFollowup((att.data as CrmAttivita[]) ?? []);
    setMovimenti((log.data as CrmStageLog[]) ?? []);
  }, [supabase]);

  useEffect(() => { void carica(); }, [carica]);

  const oggi = todayLocal();
  const setteGiorniFa = new Date(new Date(`${oggi}T00:00:00`).getTime() - 7 * 86_400_000)
    .toISOString().slice(0, 10);

  const aperte = useMemo(() => opportunita.filter((d) => !d.esito && d.stage_id <= 6), [opportunita]);

  const senzaAzione = useMemo(
    () => aperte.filter((d) => !d.prossima_azione || !d.data_prossima_azione),
    [aperte],
  );

  const ferme = useMemo(
    () => aperte.filter((d) => d.flag_fermo && (!d.fermo_dal || d.fermo_dal <= setteGiorniFa)),
    [aperte, setteGiorniFa],
  );

  const nuoviLead = useMemo(() => aperte.filter((d) => d.stage_id <= 1), [aperte]);

  const perId = useMemo(() => new Map(opportunita.map((d) => [d.id, d])), [opportunita]);
  const etichetta = useCallback(
    (id: number | null) => stage.find((s) => s.id === id)?.etichetta ?? '—',
    [stage],
  );

  const movimentiPerStage = useMemo(() => {
    const mappa = new Map<number, { entrate: number; uscite: number }>();
    for (const s of stage) mappa.set(s.id, { entrate: 0, uscite: 0 });
    for (const m of movimenti) {
      const dentro = mappa.get(m.stage_a);
      if (dentro) dentro.entrate++;
      if (m.stage_da != null) {
        const fuori = mappa.get(m.stage_da);
        if (fuori) fuori.uscite++;
      }
    }
    return [...mappa.entries()].filter(([, v]) => v.entrate || v.uscite);
  }, [movimenti, stage]);

  return (
    <div className="space-y-6">
      <Sezione
        titolo="1. Opportunità senza prossima azione"
        nota="Deve essere una lista vuota."
        vuota={senzaAzione.length === 0}
        testoVuota="Nessuna: ogni opportunità aperta ha la sua prossima azione."
      >
        {senzaAzione.map((d) => (
          <Riga key={d.id} deal={d} onApri={onApri} />
        ))}
      </Sezione>

      <Sezione
        titolo="2. Ferme da oltre 7 giorni"
        nota="Decidere adesso: si avanza o si mette in nurture."
        vuota={ferme.length === 0}
        testoVuota="Nessuna opportunità ferma."
      >
        {ferme.map((d) => (
          <Riga key={d.id} deal={d} onApri={onApri}>
            <Button size="sm" variant="secondary" onClick={() => onAvanza(d)}>Avanza</Button>
            {/* Il salto diretto all'esito parte da Qualificato (§5): su un
                lead appena entrato il pulsante fallirebbe, meglio spiegarlo. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={d.stage_id < 2}
              title={d.stage_id < 2 ? 'Prima qualifica il lead: il nurture parte da Qualificato' : undefined}
              onClick={() => onNurture(d)}
            >
              Nurture
            </Button>
          </Riga>
        ))}
      </Sezione>

      <Sezione
        titolo="3. Follow-up proposta in scadenza"
        nota="Nei prossimi 7 giorni."
        vuota={followup.length === 0}
        testoVuota="Nessun follow-up in scadenza."
      >
        {followup.map((a) => {
          const deal = perId.get(a.deal_id);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 p-3">
              <button onClick={() => deal && onApri(deal)} className="min-w-0 flex-1 text-left">
                <span className="text-sm font-medium text-pw-text">
                  {deal?.company_name || deal?.title || 'Opportunità'}
                </span>
                <p className="truncate text-xs text-pw-text-dim">{a.titolo}</p>
              </button>
              {a.due_at && (
                <span className={cn(
                  'shrink-0 text-xs',
                  a.due_at.slice(0, 10) <= oggi ? 'font-medium text-red-500' : 'text-pw-text-dim',
                )}>
                  {formatDate(a.due_at)}
                </span>
              )}
            </li>
          );
        })}
      </Sezione>

      <Sezione
        titolo="4. Movimenti della settimana"
        nota="Entrate e uscite per stage negli ultimi 7 giorni."
        vuota={movimentiPerStage.length === 0}
        testoVuota="Nessun movimento: la pipeline è ferma."
      >
        {movimentiPerStage.map(([id, v]) => (
          <li key={id} className="flex items-center justify-between gap-2 p-3 text-sm">
            <span className="text-pw-text">{etichetta(id)}</span>
            <span className="tabular-nums text-pw-text-dim">
              <span className="text-green-600 dark:text-green-400">+{v.entrate}</span>
              {' / '}
              <span className="text-red-500">−{v.uscite}</span>
            </span>
          </li>
        ))}
      </Sezione>

      <Sezione
        titolo="5. Nuovi lead da qualificare"
        nota="Stage Lead e Contattato."
        vuota={nuoviLead.length === 0}
        testoVuota="Nessun lead in attesa di qualificazione."
      >
        {nuoviLead.map((d) => (
          <Riga key={d.id} deal={d} onApri={onApri} />
        ))}
      </Sezione>
    </div>
  );
}

function Sezione({
  titolo, nota, vuota, testoVuota, children,
}: {
  titolo: string; nota: string; vuota: boolean; testoVuota: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-pw-text">{titolo}</h3>
        <p className="text-xs text-pw-text-dim">{nota}</p>
      </div>
      {vuota ? (
        <p className="flex items-center gap-2 rounded-xl border border-pw-border/60 bg-pw-surface px-3 py-2.5 text-sm text-pw-text-dim">
          <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
          {testoVuota}
        </p>
      ) : (
        <ul className="divide-y divide-pw-border/60 overflow-hidden rounded-xl border border-pw-border/60 bg-pw-surface">
          {children}
        </ul>
      )}
    </section>
  );
}

function Riga({ deal, onApri, children }: { deal: Deal; onApri: (d: Deal) => void; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 p-3">
      <button onClick={() => onApri(deal)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-pw-text">{deal.company_name || deal.title}</span>
          <BadgeScore score={deal.lead_score} />
        </div>
        <p className="truncate text-xs text-pw-text-dim">
          {deal.prossima_azione
            ? `${deal.prossima_azione}${deal.data_prossima_azione ? ` · ${formatDate(deal.data_prossima_azione)}` : ''}`
            : 'Nessuna prossima azione'}
        </p>
      </button>
      {deal.canone_proposto != null && (
        <span className="shrink-0 text-sm tabular-nums text-pw-text-dim">
          {formatCurrency(deal.canone_proposto)}/mese
        </span>
      )}
      {children}
    </li>
  );
}
