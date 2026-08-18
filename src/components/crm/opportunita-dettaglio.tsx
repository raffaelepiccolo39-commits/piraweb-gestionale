'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { BadgeScore, IndicatoreDiscovery } from '@/components/crm/badge-score';
import { calcolaLeadScore, discoveryCompletata } from '@/lib/crm/regole';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import {
  CAMPI_DISCOVERY, ETICHETTE_ESITO, ETICHETTE_MOTIVO_LOST, ETICHETTE_SOURCE, SOURCE_ATTIVE,
} from '@/types/database';
import type { CrmAttivita, CrmPesoLeadScore, CrmStage, CrmStageLog, Deal, Profile } from '@/types/database';
import { ArrowRight, Clock } from 'lucide-react';

interface Props {
  deal: Deal;
  stage: CrmStage[];
  pesi: CrmPesoLeadScore[];
  membri: Profile[];
  onSalva: (patch: Record<string, unknown>) => Promise<string | null>;
}

type Riga = { chiave: string; quando: string; testo: string; dettaglio?: string | null; tipo: 'stage' | 'attivita' };

/**
 * Dettaglio dell'opportunità (§7.4): le sezioni seguono l'ordine del
 * processo commerciale, non l'ordine delle colonne nel database.
 */
export function OpportunitaDettaglio({ deal, stage, pesi, membri, onSalva }: Props) {
  const supabase = createClient();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [timeline, setTimeline] = useState<Riga[]>([]);

  // Il form non si azzera qui: il genitore monta questo componente con
  // key={deal.id}, quindi cambiare opportunità lo ricrea già pulito.

  const valore = useCallback(
    (campo: string) => (campo in form ? form[campo] : (deal as unknown as Record<string, unknown>)[campo]),
    [form, deal],
  );
  const set = (campo: string, v: unknown) => setForm((f) => ({ ...f, [campo]: v }));

  const statoCorrente = useMemo(
    () => ({ ...(deal as unknown as Record<string, unknown>), ...form }),
    [deal, form],
  );

  // AC-13: il punteggio si muove mentre si spuntano i flag, prima ancora di
  // salvare. A database lo riscrive comunque il trigger.
  const score = useMemo(() => calcolaLeadScore(statoCorrente, pesi), [statoCorrente, pesi]);
  const discovery = useMemo(() => discoveryCompletata(statoCorrente), [statoCorrente]);

  const caricaTimeline = useCallback(async () => {
    const [logs, attivita] = await Promise.all([
      supabase.from('crm_stage_log').select('*').eq('deal_id', deal.id).order('changed_at', { ascending: false }).limit(50),
      supabase.from('crm_attivita').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false }).limit(50),
    ]);

    const etichetta = (id: number | null) => stage.find((s) => s.id === id)?.etichetta ?? '—';

    const righe: Riga[] = [
      ...((logs.data as CrmStageLog[] | null) ?? []).map((l) => ({
        chiave: `s-${l.id}`,
        quando: l.changed_at,
        testo: l.stage_da == null ? `Creata in ${etichetta(l.stage_a)}` : `${etichetta(l.stage_da)} → ${etichetta(l.stage_a)}`,
        dettaglio: l.note,
        tipo: 'stage' as const,
      })),
      ...((attivita.data as CrmAttivita[] | null) ?? []).map((a) => ({
        chiave: `a-${a.id}`,
        quando: a.completed_at ?? a.created_at,
        testo: a.titolo,
        dettaglio: a.descrizione,
        tipo: 'attivita' as const,
      })),
    ].sort((x, y) => y.quando.localeCompare(x.quando));

    setTimeline(righe);
  }, [supabase, deal.id, stage]);

  useEffect(() => { void caricaTimeline(); }, [caricaTimeline]);

  async function salva() {
    if (Object.keys(form).length === 0) return;
    setSalvando(true);
    setErrore(null);
    const err = await onSalva(form);
    setSalvando(false);
    if (err) { setErrore(err); return; }
    setForm({});
    void caricaTimeline();
  }

  const stageCorrente = stage.find((s) => s.id === deal.stage_id);
  const aperto = stageCorrente?.is_aperto ?? false;

  return (
    <div className="space-y-6">
      {/* ── Anagrafica e provenienza ── */}
      <Sezione titolo="Anagrafica e provenienza">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Titolo" value={String(valore('title') ?? '')} onChange={(e) => set('title', e.target.value)} />
          <Input label="Azienda" value={String(valore('company_name') ?? '')} onChange={(e) => set('company_name', e.target.value)} />
          <Input label="Contatto" value={String(valore('contact_name') ?? '')} onChange={(e) => set('contact_name', e.target.value)} />
          <Input label="Email" type="email" value={String(valore('contact_email') ?? '')} onChange={(e) => set('contact_email', e.target.value)} />
          <Input label="Telefono" value={String(valore('contact_phone') ?? '')} onChange={(e) => set('contact_phone', e.target.value)} />
          <Select
            label="Provenienza"
            value={String(valore('source') ?? '')}
            onChange={(e) => set('source', e.target.value)}
            options={SOURCE_ATTIVE.map((s) => ({ value: s, label: ETICHETTE_SOURCE[s] }))}
          />
          {valore('source') === 'referral' && (
            <Input
              label="Chi ha segnalato"
              value={String(valore('referrer') ?? '')}
              onChange={(e) => set('referrer', e.target.value)}
            />
          )}
          <Select
            label="Owner"
            value={String(valore('owner_id') ?? '')}
            onChange={(e) => set('owner_id', e.target.value)}
            options={membri.map((m) => ({ value: m.id, label: m.full_name }))}
          />
        </div>

        {aperto && (
          <div className="mt-3 grid gap-3 rounded-xl border border-pw-border/60 bg-pw-surface-2/40 p-3 sm:grid-cols-[1fr_180px]">
            <Input
              label="Prossima azione"
              value={String(valore('prossima_azione') ?? '')}
              onChange={(e) => set('prossima_azione', e.target.value)}
              placeholder="Obbligatoria finché l'opportunità è aperta"
            />
            <Input
              label="Quando"
              type="date"
              value={String(valore('data_prossima_azione') ?? '')}
              onChange={(e) => set('data_prossima_azione', e.target.value)}
            />
          </div>
        )}
      </Sezione>

      {/* ── Qualificazione ── */}
      <Sezione
        titolo="Qualificazione"
        accanto={<BadgeScore score={score} />}
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          {pesi.map((p) => (
            <label
              key={p.campo}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-pw-text hover:bg-pw-surface-2/60"
            >
              <input
                type="checkbox"
                checked={valore(p.campo) === true}
                onChange={(e) => set(p.campo, e.target.checked)}
                className="h-4 w-4 accent-[var(--pw-accent)]"
              />
              <span className="flex-1">{p.etichetta}</span>
              <span className={cn('text-xs tabular-nums', p.peso < 0 ? 'text-red-500' : 'text-pw-text-dim')}>
                {p.peso > 0 ? `+${p.peso}` : p.peso}
              </span>
            </label>
          ))}
        </div>
      </Sezione>

      {/* ── Discovery ── */}
      <Sezione titolo="Discovery" accanto={<IndicatoreDiscovery fatti={discovery} />}>
        <p className="mb-2 text-xs text-pw-text-dim">
          Finché mancano campi, l&apos;avanzamento a Proposta inviata è bloccato.
        </p>
        <div className="space-y-2">
          {CAMPI_DISCOVERY.map((c) => (
            <Textarea
              key={c.campo}
              label={c.etichetta}
              rows={2}
              value={String(valore(c.campo) ?? '')}
              onChange={(e) => set(c.campo, e.target.value)}
            />
          ))}
        </div>
      </Sezione>

      {/* ── Proposta ── */}
      <Sezione titolo="Proposta">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Canone mensile €"
            type="number" step="0.01" min="0"
            value={String(valore('canone_proposto') ?? '')}
            onChange={(e) => set('canone_proposto', e.target.value === '' ? null : Number(e.target.value))}
          />
          <Input
            label="Durata mesi"
            type="number" min="0"
            value={String(valore('durata_mesi') ?? '')}
            onChange={(e) => set('durata_mesi', e.target.value === '' ? null : Number(e.target.value))}
          />
          <Input
            label="Una tantum €"
            type="number" step="0.01" min="0"
            value={String(valore('una_tantum_proposto') ?? '')}
            onChange={(e) => set('una_tantum_proposto', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <p className="mt-2 text-xs text-pw-text-dim">
          Valore di pipeline registrato: <span className="font-medium text-pw-text">{formatCurrency(deal.valore_pipeline || 0)}</span>
          {' '}(canone × durata + una tantum)
        </p>
      </Sezione>

      {/* ── Esito ── */}
      {deal.stage_id >= 7 && (
        <Sezione titolo="Esito">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Esito"
              value={String(valore('esito') ?? '')}
              onChange={(e) => set('esito', e.target.value || null)}
              placeholder="Da decidere"
              options={(Object.keys(ETICHETTE_ESITO) as (keyof typeof ETICHETTE_ESITO)[]).map((k) => ({
                value: k, label: ETICHETTE_ESITO[k],
              }))}
            />
            {valore('esito') === 'lost' && (
              <Select
                label="Motivo della perdita"
                value={String(valore('motivo_lost') ?? '')}
                onChange={(e) => set('motivo_lost', e.target.value || null)}
                placeholder="Scegli"
                options={(Object.keys(ETICHETTE_MOTIVO_LOST) as (keyof typeof ETICHETTE_MOTIVO_LOST)[]).map((k) => ({
                  value: k, label: ETICHETTE_MOTIVO_LOST[k],
                }))}
              />
            )}
            {valore('esito') === 'nurture' && (
              <Input
                label="Quando riprendere"
                type="date"
                value={String(valore('data_ripresa') ?? '')}
                onChange={(e) => set('data_ripresa', e.target.value || null)}
              />
            )}
          </div>
        </Sezione>
      )}

      {errore && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{errore}</p>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-pw-border/60 bg-pw-surface py-3">
        <Button onClick={salva} disabled={salvando || Object.keys(form).length === 0}>
          {salvando ? 'Salvataggio…' : 'Salva modifiche'}
        </Button>
      </div>

      {/* ── Timeline ── */}
      <Sezione titolo="Timeline">
        {timeline.length === 0 ? (
          <p className="text-sm text-pw-text-dim">Ancora nessun movimento.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((r) => (
              <li key={r.chiave} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-pw-text-dim">
                  {r.tipo === 'stage' ? <ArrowRight className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-pw-text">{r.testo}</p>
                  {r.dettaglio && <p className="text-xs text-pw-text-dim">{r.dettaglio}</p>}
                  <p className="text-[11px] text-pw-text-dim">{formatDateTime(r.quando)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Sezione>
    </div>
  );
}

function Sezione({ titolo, accanto, children }: { titolo: string; accanto?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-pw-text">{titolo}</h3>
        {accanto}
      </div>
      {children}
    </section>
  );
}
