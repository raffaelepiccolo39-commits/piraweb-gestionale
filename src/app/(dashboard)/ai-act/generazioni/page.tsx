'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import { reportUnknown } from '@/lib/report-error';
import { ESITO_LABEL, ESITO_TONE, etichettaInSospeso, type AiGenerationRow, type AiSystemRow } from '@/lib/ai-act/db';
import type { EsitoEtichetta } from '@/lib/ai-act/tipi';
import { ArrowLeft, Tag, Check, Download, ShieldCheck } from 'lucide-react';

type FiltroEsito = 'tutti' | 'da_etichettare' | EsitoEtichetta;

export default function LogGenerazioni() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();

  const [righe, setRighe] = useState<AiGenerationRow[]>([]);
  const [sistemi, setSistemi] = useState<Map<string, string>>(new Map());
  const [utenti, setUtenti] = useState<Map<string, string>>(new Map());
  const [clienti, setClienti] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroEsito>('tutti');
  const [revisione, setRevisione] = useState<AiGenerationRow | null>(null);
  const [noteRev, setNoteRev] = useState('');
  const [saving, setSaving] = useState(false);

  const carica = useCallback(async () => {
    const [genRes, sisRes, profRes, cliRes] = await Promise.all([
      supabase.from('ai_generations').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('ai_systems').select('id, nome'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('clients').select('id, name, company'),
    ]);
    if (genRes.error) { reportUnknown(genRes.error, 'client', { stage: 'ai-gen' }); toast.error('Errore caricamento'); }
    setRighe((genRes.data ?? []) as AiGenerationRow[]);
    setSistemi(new Map((sisRes.data ?? []).map((s: Pick<AiSystemRow, 'id' | 'nome'>) => [s.id, s.nome])));
    setUtenti(new Map((profRes.data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])));
    setClienti(new Map((cliRes.data ?? []).map((c: { id: string; name: string; company: string | null }) => [c.id, c.company || c.name])));
    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => { carica(); }, [carica]);

  const filtrate = useMemo(() => {
    if (filtro === 'tutti') return righe;
    if (filtro === 'da_etichettare') return righe.filter(etichettaInSospeso);
    return righe.filter((r) => r.esito_etichetta === filtro);
  }, [righe, filtro]);

  const applicaRevisione = async () => {
    if (!revisione || !profile) return;
    setSaving(true);
    try {
      // La revisione editoriale esenta SOLO il testo di interesse pubblico (R5),
      // mai un deepfake: la transizione riflette il motore valutaEtichetta.
      const nuovoEsito: EsitoEtichetta =
        revisione.esito_etichetta === 'RICHIESTA_TESTO_INTERESSE_PUBBLICO'
          ? 'ESENTE_REVISIONE_EDITORIALE'
          : revisione.esito_etichetta;
      const { error } = await supabase.from('ai_generations').update({
        revisione_umana: true,
        revisore_id: profile.id,
        data_revisione: new Date().toISOString(),
        note_revisione: noteRev.trim() || null,
        esito_etichetta: nuovoEsito,
        regola_applicata: nuovoEsito === 'ESENTE_REVISIONE_EDITORIALE' ? 'REVISIONE_EDITORIALE' : revisione.regola_applicata,
      }).eq('id', revisione.id);
      if (error) throw error;
      toast.success('Revisione registrata');
      setRevisione(null); setNoteRev('');
      carica();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'ai-gen-revisione' });
      toast.error((e as { message?: string })?.message || 'Errore');
    } finally { setSaving(false); }
  };

  const esportaCsv = () => {
    const head = ['data', 'sistema', 'modello', 'tipo', 'utente', 'cliente', 'esito', 'revisionato', 'pubblicato'];
    const rows = filtrate.map((r) => [
      new Date(r.created_at).toISOString(), sistemi.get(r.sistema_id) ?? r.sistema_id, r.modello, r.tipo_output,
      utenti.get(r.utente_id) ?? r.utente_id, r.cliente_id ? (clienti.get(r.cliente_id) ?? '') : '',
      ESITO_LABEL[r.esito_etichetta], r.revisione_umana ? 'sì' : 'no', r.pubblicato ? 'sì' : 'no',
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `generazioni-ai.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const OPZIONI: { value: FiltroEsito; label: string }[] = [
    { value: 'tutti', label: 'Tutti gli esiti' },
    { value: 'da_etichettare', label: 'Da etichettare (in sospeso)' },
    { value: 'RICHIESTA_DEEPFAKE', label: ESITO_LABEL.RICHIESTA_DEEPFAKE },
    { value: 'RICHIESTA_TESTO_INTERESSE_PUBBLICO', label: ESITO_LABEL.RICHIESTA_TESTO_INTERESSE_PUBBLICO },
    { value: 'NON_RICHIESTA', label: ESITO_LABEL.NON_RICHIESTA },
  ];

  return (
    <div className="space-y-5 animate-slide-up">
      <Link href="/ai-act" className="inline-flex items-center gap-1 text-sm text-pw-text-muted hover:text-pw-text">
        <ArrowLeft size={15} /> Conformità IA
      </Link>
      <PageHeader
        eyebrow="Tracciabilità"
        title="Log delle generazioni"
        subtitle="Ogni contenuto generato con l'IA dal gestionale, con l'esito sull'obbligo di etichettatura. Il prompt è conservato solo come impronta (hash), mai in chiaro."
        actions={<Button variant="outline" onClick={esportaCsv}><Download size={15} /> CSV</Button>}
      />

      <div className="flex items-center gap-3">
        <div className="w-72"><Select id="filtro" value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroEsito)} options={OPZIONI} /></div>
        <span className="text-sm text-pw-text-muted">{filtrate.length} generazioni</span>
      </div>

      {loading ? (
        <p className="text-sm text-pw-text-muted">Caricamento…</p>
      ) : filtrate.length === 0 ? (
        <EmptyState icon={Tag} title="Nessuna generazione" description="Appena il team usa l'AI dal gestionale, ogni chiamata comparirà qui." />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pw-border text-left text-xs text-pw-text-muted">
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Sistema</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Utente</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Etichetta</th>
                <th className="px-3 py-2.5 font-medium">Revisione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pw-border">
              {filtrate.map((r) => (
                <tr key={r.id} className="hover:bg-pw-surface-2/50">
                  <td className="px-3 py-2 text-xs text-pw-text-muted tabular-nums whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-3 py-2 text-pw-text">{sistemi.get(r.sistema_id) ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-pw-text-muted">{r.tipo_output}</td>
                  <td className="px-3 py-2 text-pw-text-muted whitespace-nowrap">{utenti.get(r.utente_id) ?? '—'}</td>
                  <td className="px-3 py-2 text-pw-text-muted">{r.cliente_id ? (clienti.get(r.cliente_id) ?? '—') : '—'}</td>
                  <td className="px-3 py-2"><Badge tone={ESITO_TONE[r.esito_etichetta]} size="sm">{ESITO_LABEL[r.esito_etichetta]}</Badge></td>
                  <td className="px-3 py-2">
                    {r.revisione_umana ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={13} /> Revisionato</span>
                    ) : (
                      <button onClick={() => { setRevisione(r); setNoteRev(''); }} className="text-xs text-pw-accent hover:underline">Segna revisionato</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      <Modal open={!!revisione} onClose={() => setRevisione(null)} title="Revisione editoriale" size="sm">
        {revisione && (
          <div className="space-y-3">
            <p className="text-sm text-pw-text-muted">
              Registri la revisione umana di questo contenuto. Per un testo di interesse pubblico, la revisione con
              responsabilità editoriale lo <strong className="text-pw-text">esenta</strong> dall&apos;etichetta (art. 50).
              Per un deepfake, invece, l&apos;etichetta resta obbligatoria anche dopo revisione.
            </p>
            <Textarea id="note-rev" label="Note (opzionale)" value={noteRev} onChange={(e) => setNoteRev(e.target.value)} rows={2} placeholder="Cosa è stato controllato" />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setRevisione(null)} className="flex-1">Annulla</Button>
              <Button onClick={applicaRevisione} loading={saving} className="flex-1"><ShieldCheck size={15} /> Conferma revisione</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
