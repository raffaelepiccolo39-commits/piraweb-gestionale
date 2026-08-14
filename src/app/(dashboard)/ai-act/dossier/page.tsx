'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import { RUOLO_LABEL, RISCHIO_LABEL, ESITO_LABEL, etichettaInSospeso, type AiSystemRow, type AiGenerationRow, type AiDocumentRow, type AiTrainingSessionRow } from '@/lib/ai-act/db';
import { ArrowLeft, FileCheck, Printer } from 'lucide-react';

const PIRA = { ragione: 'PIRA WEB S.R.L.', comune: 'Casapesenna (CE)' };

interface Dossier {
  da: string; a: string;
  sistemi: AiSystemRow[];
  policy: AiDocumentRow | null;
  accettazioni: number;
  membri: number;
  formazioneOk: number;
  generazioni: AiGenerationRow[];
  nomiUtenti: Map<string, string>;
  nomiClienti: Map<string, string>;
}

export default function DossierPage() {
  const supabase = createClient();
  const toast = useToast();
  const oggi = new Date();
  const inizioAnno = new Date(oggi.getFullYear(), 0, 1);
  const [da, setDa] = useState(inizioAnno.toISOString().slice(0, 10));
  const [a, setA] = useState(oggi.toISOString().slice(0, 10));
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);

  const genera = async () => {
    setLoading(true);
    try {
      const [sisRes, polRes, accRes, memRes, sesRes, genRes, profRes, cliRes] = await Promise.all([
        supabase.from('ai_systems').select('*').order('nome'),
        supabase.from('ai_documents').select('*').eq('tipo', 'POLICY_INTERNA').eq('vigente', true).order('created_at', { ascending: false }).limit(1),
        supabase.from('ai_document_acceptances').select('documento_id'),
        supabase.from('profiles').select('id').eq('is_active', true),
        supabase.from('ai_training_sessions').select('*'),
        supabase.from('ai_generations').select('*').gte('created_at', da).lte('created_at', `${a}T23:59:59`).order('created_at'),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('clients').select('id, name, company'),
      ]);
      const policy = (polRes.data?.[0] ?? null) as AiDocumentRow | null;
      const accPolicy = policy ? (accRes.data ?? []).filter((x: { documento_id: string }) => x.documento_id === policy.id).length : 0;
      const sessioni = (sesRes.data ?? []) as AiTrainingSessionRow[];
      const oggiIso = new Date().toISOString();
      const formOk = sessioni.filter((s) => s.stato === 'PRESA_VISIONE' && (!s.scadenza || s.scadenza > oggiIso)).length;
      setDossier({
        da, a,
        sistemi: (sisRes.data ?? []) as AiSystemRow[],
        policy, accettazioni: accPolicy,
        membri: (memRes.data ?? []).length, formazioneOk: formOk,
        generazioni: (genRes.data ?? []) as AiGenerationRow[],
        nomiUtenti: new Map((profRes.data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])),
        nomiClienti: new Map((cliRes.data ?? []).map((c: { id: string; name: string; company: string | null }) => [c.id, c.company || c.name])),
      });
    } catch {
      toast.error('Errore nella generazione del dossier');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="print:hidden">
        <Link href="/ai-act" className="inline-flex items-center gap-1 text-sm text-pw-text-muted hover:text-pw-text">
          <ArrowLeft size={15} /> Conformità IA
        </Link>
        <PageHeader eyebrow="Export" title="Dossier di conformità"
          subtitle="Il documento da consegnare in caso di richiesta dell'autorità (ACN) o di audit cliente. Autoconsistente e leggibile da un non tecnico." />
        <Card className="mt-3"><CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div><Input id="da" label="Dal" type="date" value={da} onChange={(e) => setDa(e.target.value)} /></div>
          <div><Input id="a" label="Al" type="date" value={a} onChange={(e) => setA(e.target.value)} /></div>
          <Button onClick={genera} loading={loading}><FileCheck size={16} /> Genera dossier</Button>
          {dossier && <Button variant="outline" onClick={() => window.print()}><Printer size={15} /> Stampa / Salva PDF</Button>}
        </CardContent></Card>
      </div>

      {dossier && <DossierStampa d={dossier} />}
    </div>
  );
}

function Sez({ n, titolo, children }: { n: number; titolo: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="mb-2 border-b border-pw-border pb-1 text-sm font-bold uppercase tracking-wide text-pw-text">{n}. {titolo}</h2>
      {children}
    </section>
  );
}

function DossierStampa({ d }: { d: Dossier }) {
  const perCliente = new Map<string, number>();
  for (const g of d.generazioni) {
    const k = g.cliente_id ? (d.nomiClienti.get(g.cliente_id) ?? 'Cliente') : 'Interno / nessun cliente';
    perCliente.set(k, (perCliente.get(k) ?? 0) + 1);
  }
  const etichettati = d.generazioni.filter((g) => g.esito_etichetta.startsWith('RICHIESTA_') || g.esito_etichetta.startsWith('ESENTE_'));
  const inSospeso = d.generazioni.filter(etichettaInSospeso).length;

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-pw-border bg-pw-surface p-8 text-sm text-pw-text print:border-0 print:p-0">
      {/* 1. Copertina */}
      <div className="text-center">
        <FileCheck size={36} className="mx-auto text-pw-accent" />
        <h1 className="mt-3 text-2xl font-bold">Dossier di conformità AI Act</h1>
        <p className="mt-1 text-pw-text-muted">Reg. (UE) 2024/1689 — {PIRA.ragione}</p>
        <p className="mt-3 text-sm text-pw-text-muted">
          Periodo: {formatDate(d.da)} — {formatDate(d.a)}<br />
          {PIRA.comune} · generato il {formatDate(new Date().toISOString())}
        </p>
      </div>

      <Sez n={1} titolo="Registro dei sistemi di IA">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-pw-text-muted"><th className="py-1">Sistema</th><th>Fornitore</th><th>Ruolo</th><th>Rischio</th><th>Stato</th></tr></thead>
          <tbody>
            {d.sistemi.map((s) => (
              <tr key={s.id} className="border-t border-pw-border">
                <td className="py-1 pr-2">{s.nome}</td><td className="pr-2">{s.fornitore}</td>
                <td className="pr-2">{RUOLO_LABEL[s.ruolo_pira_web]}</td><td className="pr-2">{RISCHIO_LABEL[s.classif_rischio]}</td>
                <td>{s.attivo ? 'Attivo' : 'Dismesso'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sez>

      <Sez n={2} titolo="Policy interna e accettazioni">
        {d.policy ? (
          <p>Policy vigente: <strong>{d.policy.titolo}</strong> (v{d.policy.versione}), in vigore dal {formatDate(d.policy.data_vigore)}.
            Impronta SHA-256: <span className="font-mono text-xs">{d.policy.file_hash.slice(0, 24)}…</span><br />
            Accettata da <strong>{d.accettazioni}</strong> membri del team su {d.membri}.</p>
        ) : <p className="text-pw-danger">Nessuna policy interna vigente caricata.</p>}
      </Sez>

      <Sez n={3} titolo="Formazione del team (art. 4)">
        <p>Membri attivi: <strong>{d.membri}</strong>. In regola con la formazione: <strong>{d.formazioneOk}</strong>
          {' '}({d.membri ? Math.round((d.formazioneOk / d.membri) * 100) : 0}%).</p>
      </Sez>

      <Sez n={4} titolo="Generazioni del periodo, per cliente">
        <p className="mb-1">Totale generazioni tracciate: <strong>{d.generazioni.length}</strong>.</p>
        <table className="w-full text-xs">
          <tbody>
            {[...perCliente.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => (
              <tr key={k} className="border-t border-pw-border"><td className="py-1">{k}</td><td className="text-right">{v}</td></tr>
            ))}
          </tbody>
        </table>
      </Sez>

      <Sez n={5} titolo="Contenuti soggetti a trasparenza (art. 50)">
        {etichettati.length === 0 ? <p>Nessun contenuto ha richiesto valutazione di etichettatura nel periodo.</p> : (
          <>
            <p className="mb-1">{etichettati.length} contenuti valutati; {inSospeso > 0 ? <span className="text-pw-danger">{inSospeso} con etichetta ancora da applicare</span> : 'nessuno in sospeso'}.</p>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-pw-text-muted"><th className="py-1">Data</th><th>Esito</th><th>Regola</th><th>Etichettato</th></tr></thead>
              <tbody>
                {etichettati.slice(0, 60).map((g) => (
                  <tr key={g.id} className="border-t border-pw-border">
                    <td className="py-1 pr-2">{formatDate(g.created_at)}</td>
                    <td className="pr-2">{ESITO_LABEL[g.esito_etichetta]}</td>
                    <td className="pr-2">{g.regola_applicata ?? '—'}</td>
                    <td>{g.esito_etichetta.startsWith('ESENTE') ? 'esente' : g.etichetta_applicata ? 'sì' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Sez>

      <p className="mt-8 border-t border-pw-border pt-3 text-[11px] text-pw-text-dim">
        {PIRA.ragione} — documento generato automaticamente dal gestionale. I prompt delle generazioni sono conservati solo come impronta (hash), mai in chiaro. Non costituisce consulenza legale.
      </p>
    </div>
  );
}
