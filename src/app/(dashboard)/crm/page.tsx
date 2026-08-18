'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PipelineKanban } from '@/components/crm/pipeline-kanban';
import { VistaOggi } from '@/components/crm/vista-oggi';
import { OpportunitaDettaglio } from '@/components/crm/opportunita-dettaglio';
import { NuovaOpportunita } from '@/components/crm/nuova-opportunita';
import { SalesReview } from '@/components/crm/sales-review';
import { PannelloKpi } from '@/components/crm/pannello-kpi';
import { ImportStorico } from '@/components/crm/import-storico';
import { cn, formatCurrency } from '@/lib/utils';
import { ETICHETTE_SOURCE, SOURCE_ATTIVE } from '@/types/database';
import type { CrmPesoLeadScore, CrmStage, Deal, Profile } from '@/types/database';
import { reportUnknown } from '@/lib/report-error';
import { Plus, Lock, Upload } from 'lucide-react';

type Vista = 'oggi' | 'pipeline' | 'review' | 'kpi';

const ETICHETTE_VISTA: Record<Vista, string> = {
  oggi: 'Oggi',
  pipeline: 'Pipeline',
  review: 'Sales Review',
  kpi: 'KPI',
};

/**
 * CRM commerciale — pipeline a 10 stage (specifica v1).
 *
 * La sezione è riservata alla direzione: la pipeline contiene prezzi, motivi
 * di perdita e note di trattativa, cioè esattamente quello che non deve
 * uscire dall'azienda. La RLS su `deals` dice la stessa cosa; qui si evita
 * solo di mostrare una pagina vuota a chi non può leggerla.
 */
export default function CRMPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [vista, setVista] = useState<Vista>('oggi');
  const [caricamento, setCaricamento] = useState(true);
  const [opportunita, setOpportunita] = useState<Deal[]>([]);
  const [stage, setStage] = useState<CrmStage[]>([]);
  const [pesi, setPesi] = useState<CrmPesoLeadScore[]>([]);
  const [membri, setMembri] = useState<Profile[]>([]);
  // Si tiene l'id, non l'oggetto: così il dettaglio segue da solo i dati
  // ricaricati dopo un salvataggio, senza un effetto che li risincronizzi.
  const [apertaId, setApertaId] = useState<string | null>(null);
  const [creazione, setCreazione] = useState(false);
  const [importazione, setImportazione] = useState(false);

  // Filtri (§7.1)
  const [filtroOwner, setFiltroOwner] = useState('');
  const [filtroSource, setFiltroSource] = useState('');
  const [filtroFascia, setFiltroFascia] = useState('');
  const [soloFerme, setSoloFerme] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const carica = useCallback(async () => {
    if (!isAdmin) { setCaricamento(false); return; }

    const [opp, stg, pes, prof] = await Promise.all([
      supabase.from('deals').select('*').order('updated_at', { ascending: false }),
      supabase.from('crm_stage').select('*').order('ordine'),
      supabase.from('crm_lead_score_pesi').select('*').order('ordine'),
      supabase.from('profiles').select('id, full_name, role, email').eq('is_active', true).order('full_name'),
    ]);

    setOpportunita((opp.data as Deal[]) ?? []);
    setStage((stg.data as CrmStage[]) ?? []);
    setPesi((pes.data as CrmPesoLeadScore[]) ?? []);
    setMembri((prof.data as Profile[]) ?? []);
    setCaricamento(false);
  }, [supabase, isAdmin]);

  useEffect(() => { void carica(); }, [carica]);

  const aperta = useMemo(
    () => opportunita.find((d) => d.id === apertaId) ?? null,
    [opportunita, apertaId],
  );

  const filtrate = useMemo(() => {
    return opportunita.filter((d) => {
      if (filtroOwner && d.owner_id !== filtroOwner) return false;
      if (filtroSource && d.source !== filtroSource) return false;
      if (soloFerme && !d.flag_fermo) return false;
      if (filtroFascia === 'alta' && d.lead_score < 50) return false;
      if (filtroFascia === 'standard' && (d.lead_score < 20 || d.lead_score >= 50)) return false;
      if (filtroFascia === 'bassa' && d.lead_score >= 20) return false;
      return true;
    });
  }, [opportunita, filtroOwner, filtroSource, filtroFascia, soloFerme]);

  const aperte = useMemo(() => filtrate.filter((d) => !d.esito), [filtrate]);
  const valoreTotale = useMemo(
    () => aperte.reduce((s, d) => s + Number(d.valore_pipeline || 0), 0),
    [aperte],
  );

  /** Ogni scrittura passa dalle rotte API: lì vivono permessi e V8. */
  const chiama = useCallback(async (url: string, metodo: string, corpo: unknown): Promise<{ errore?: string; avviso?: string }> => {
    try {
      const risposta = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dati = await risposta.json().catch(() => ({}));
      if (!risposta.ok) return { errore: dati.error || 'Salvataggio non riuscito' };
      await carica();
      return { avviso: dati.avviso?.messaggio };
    } catch (errore) {
      reportUnknown(errore, 'client', { route: '/crm', url });
      return { errore: 'Connessione non riuscita' };
    }
  }, [carica]);

  const sposta = useCallback(async (deal: Deal, stageId: number) => {
    const { errore } = await chiama(`/api/crm/opportunita/${deal.id}`, 'PATCH', { stage_id: stageId });
    if (errore) toast.error(errore);
    return errore ?? null;
  }, [chiama, toast]);

  const salvaDettaglio = useCallback(async (patch: Record<string, unknown>) => {
    if (!aperta) return 'Nessuna opportunità aperta';
    const { errore } = await chiama(`/api/crm/opportunita/${aperta.id}`, 'PATCH', patch);
    if (!errore) toast.success('Salvato');
    return errore ?? null;
  }, [aperta, chiama, toast]);

  const completaAzione = useCallback(async (deal: Deal, dati: { prossima_azione: string; data_prossima_azione: string; nota: string }) => {
    const { errore } = await chiama(`/api/crm/opportunita/${deal.id}/azione`, 'POST', dati);
    if (!errore) toast.success('Azione chiusa');
    return errore ?? null;
  }, [chiama, toast]);

  /** "Avanza" della Sales Review: uno stage in avanti, come da §5. */
  const avanza = useCallback(async (deal: Deal) => {
    const { errore } = await chiama(`/api/crm/opportunita/${deal.id}`, 'PATCH', { stage_id: deal.stage_id + 1 });
    if (errore) toast.error(errore); else toast.success('Avanzata');
    return errore ?? null;
  }, [chiama, toast]);

  /** "Nurture": si chiude e si torna a sentirli fra 90 giorni. */
  const nurture = useCallback(async (deal: Deal) => {
    const fra90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const { errore } = await chiama(`/api/crm/opportunita/${deal.id}`, 'PATCH', {
      stage_id: 7, esito: 'nurture', data_ripresa: fra90,
    });
    if (errore) toast.error(errore); else toast.success('Messa in nurture, ripresa fra 90 giorni');
    return errore ?? null;
  }, [chiama, toast]);

  const crea = useCallback(async (dati: Record<string, unknown>) => {
    return chiama('/api/crm/opportunita', 'POST', dati);
  }, [chiama]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Sezione riservata"
        description="La pipeline commerciale è visibile alla sola direzione."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Pipeline commerciale"
        subtitle={`${aperte.length} opportunità aperte · ${formatCurrency(valoreTotale)} di pipeline`}
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-pw-border">
              {(['oggi', 'pipeline', 'review', 'kpi'] as Vista[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    vista === v ? 'bg-pw-accent text-[#0A263A]' : 'text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text',
                  )}
                >
                  {ETICHETTE_VISTA[v]}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setImportazione(true)}>
              <Upload size={14} />
              Importa
            </Button>
            <Button variant="primary" onClick={() => setCreazione(true)}>
              <Plus size={14} />
              Nuova
            </Button>
          </>
        }
      />

      {vista === 'pipeline' && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Select
            className="min-w-[150px]"
            value={filtroOwner}
            onChange={(e) => setFiltroOwner(e.target.value)}
            placeholder="Tutti gli owner"
            options={membri.map((m) => ({ value: m.id, label: m.full_name }))}
          />
          <Select
            className="min-w-[150px]"
            value={filtroSource}
            onChange={(e) => setFiltroSource(e.target.value)}
            placeholder="Tutte le provenienze"
            options={SOURCE_ATTIVE.map((s) => ({ value: s, label: ETICHETTE_SOURCE[s] }))}
          />
          <Select
            className="min-w-[150px]"
            value={filtroFascia}
            onChange={(e) => setFiltroFascia(e.target.value)}
            placeholder="Tutte le fasce"
            options={[
              { value: 'alta', label: 'Score alto' },
              { value: 'standard', label: 'Score standard' },
              { value: 'bassa', label: 'Score basso' },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-2 px-1 py-2 text-sm text-pw-text">
            <input
              type="checkbox"
              checked={soloFerme}
              onChange={(e) => setSoloFerme(e.target.checked)}
              className="h-4 w-4 accent-[var(--pw-accent)]"
            />
            Solo ferme
          </label>
        </div>
      )}

      {caricamento ? (
        <SkeletonList />
      ) : vista === 'oggi' ? (
        <VistaOggi opportunita={filtrate} onApri={(d) => setApertaId(d.id)} onCompleta={completaAzione} />
      ) : vista === 'review' ? (
        <SalesReview
          opportunita={filtrate}
          stage={stage}
          onApri={(d) => setApertaId(d.id)}
          onAvanza={avanza}
          onNurture={nurture}
        />
      ) : vista === 'kpi' ? (
        <PannelloKpi />
      ) : (
        <PipelineKanban
          opportunita={filtrate}
          stage={stage}
          membri={membri}
          onApri={(d) => setApertaId(d.id)}
          onSposta={sposta}
        />
      )}

      <Modal
        open={!!aperta}
        onClose={() => setApertaId(null)}
        title={aperta ? (aperta.company_name || aperta.title) : ''}
        size="xl"
      >
        {aperta && (
          <OpportunitaDettaglio
            key={aperta.id}
            deal={aperta}
            stage={stage}
            pesi={pesi}
            membri={membri}
            onSalva={salvaDettaglio}
          />
        )}
      </Modal>

      <ImportStorico
        open={importazione}
        onClose={() => setImportazione(false)}
        onFatto={() => { void carica(); }}
      />

      <NuovaOpportunita
        open={creazione}
        membri={membri}
        ownerPredefinito={profile?.id ?? ''}
        onClose={() => setCreazione(false)}
        onCrea={crea}
      />
    </div>
  );
}
