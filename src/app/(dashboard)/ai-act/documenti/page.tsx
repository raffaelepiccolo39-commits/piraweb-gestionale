'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDate, todayLocal } from '@/lib/utils';
import { reportUnknown } from '@/lib/report-error';
import type { AiDocumentRow } from '@/lib/ai-act/db';
import type { TipoDocumentoAi } from '@/lib/ai-act/tipi';
import { ArrowLeft, FileText, Upload, Download, Check, Plus } from 'lucide-react';

const TIPI: { value: TipoDocumentoAi; label: string }[] = [
  { value: 'POLICY_INTERNA', label: 'Policy interna' },
  { value: 'ADDENDUM_CLIENTE', label: 'Addendum cliente' },
  { value: 'INFORMATIVA_UTENTI', label: 'Informativa utenti' },
  { value: 'VALUTAZIONE_RISCHIO', label: 'Valutazione rischio' },
];
const TIPO_LABEL = Object.fromEntries(TIPI.map((t) => [t.value, t.label])) as Record<string, string>;

async function sha256File(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Documenti() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<AiDocumentRow[]>([]);
  const [accettazioni, setAccettazioni] = useState<Set<string>>(new Set()); // documento_id accettati da me
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: 'POLICY_INTERNA' as TipoDocumentoAi, titolo: '', versione: '1.0' });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const carica = useCallback(async () => {
    const [docRes, accRes] = await Promise.all([
      supabase.from('ai_documents').select('*').eq('vigente', true).order('created_at', { ascending: false }),
      supabase.from('ai_document_acceptances').select('documento_id').eq('utente_id', profile?.id ?? ''),
    ]);
    setDocs((docRes.data ?? []) as AiDocumentRow[]);
    setAccettazioni(new Set((accRes.data ?? []).map((a: { documento_id: string }) => a.documento_id)));
    setLoading(false);
  }, [supabase, profile?.id]);

  useEffect(() => { if (profile) carica(); }, [carica, profile]);

  const carica_ = () => carica();

  const salva = async () => {
    if (!form.titolo.trim()) return toast.error('Titolo obbligatorio');
    if (!file) return toast.error('Scegli un file');
    setSaving(true);
    try {
      const hash = await sha256File(file);
      const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
      const path = `${form.tipo}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const { error: upErr } = await supabase.storage.from('ai-act-docs').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('ai_documents').insert({
        tipo: form.tipo, titolo: form.titolo.trim(), versione: form.versione.trim() || '1.0',
        file_url: path, file_hash: hash, data_vigore: todayLocal(), vigente: true,
      });
      if (error) throw error;
      toast.success('Documento caricato');
      setShowForm(false); setFile(null); setForm({ tipo: 'POLICY_INTERNA', titolo: '', versione: '1.0' });
      carica_();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'ai-doc-upload' });
      toast.error((e as { message?: string })?.message || 'Errore caricamento');
    } finally { setSaving(false); }
  };

  const scarica = async (d: AiDocumentRow) => {
    const { data, error } = await supabase.storage.from('ai-act-docs').createSignedUrl(d.file_url, 3600);
    if (error || !data) { toast.error('Documento non disponibile'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const accetta = async (d: AiDocumentRow) => {
    try {
      const { error } = await supabase.from('ai_document_acceptances').insert({ documento_id: d.id, utente_id: profile!.id });
      if (error) throw error;
      toast.success('Accettazione registrata');
      setAccettazioni((s) => new Set(s).add(d.id));
    } catch (e) { reportUnknown(e, 'client', { stage: 'ai-doc-accetta' }); toast.error('Errore'); }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <Link href="/ai-act" className="inline-flex items-center gap-1 text-sm text-pw-text-muted hover:text-pw-text">
        <ArrowLeft size={15} /> Conformità IA
      </Link>
      <PageHeader eyebrow="Documentazione" title="Documenti di conformità"
        subtitle="Policy interna, addendum ai clienti, informative e valutazioni. Ogni file è versionato e la sua impronta (hash) è registrata."
        actions={isAdmin ? <Button onClick={() => setShowForm(true)}><Plus size={16} /> Carica documento</Button> : undefined} />

      {loading ? <p className="text-sm text-pw-text-muted">Caricamento…</p> : docs.length === 0 ? (
        <EmptyState icon={FileText} title="Nessun documento" description={isAdmin ? 'Carica la policy interna per iniziare.' : 'Non ci sono ancora documenti pubblicati.'} />
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const accettato = accettazioni.has(d.id);
            const daAccettare = d.tipo === 'POLICY_INTERNA' && !d.cliente_id;
            return (
              <Card key={d.id}><CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pw-surface-2 text-pw-text-muted"><FileText size={17} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-pw-text">{d.titolo}</span>
                    <Badge tone="neutral" size="sm">{TIPO_LABEL[d.tipo] ?? d.tipo}</Badge>
                    <Badge tone="info" size="sm">v{d.versione}</Badge>
                  </div>
                  <p className="text-xs text-pw-text-muted">In vigore dal {formatDate(d.data_vigore)} · impronta {d.file_hash.slice(0, 12)}…</p>
                </div>
                {daAccettare && (accettato
                  ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={14} /> Accettata</span>
                  : <Button size="sm" variant="soft" onClick={() => accetta(d)}>Accetto</Button>)}
                <button onClick={() => scarica(d)} className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2" title="Scarica"><Download size={16} /></button>
              </CardContent></Card>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Carica documento" size="sm">
        <div className="space-y-3">
          <Select id="d-tipo" label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDocumentoAi })} options={TIPI} />
          <Input id="d-tit" label="Titolo" value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} placeholder="Es. Policy uso IA" />
          <Input id="d-ver" label="Versione" value={form.versione} onChange={(e) => setForm({ ...form, versione: e.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-pw-text">File (PDF o Word)</label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-pw-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-pw-surface-2 file:px-3 file:py-1.5 file:text-pw-text" />
            {file && <p className="mt-1 text-xs text-pw-text-dim">{file.name}</p>}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Annulla</Button>
            <Button onClick={salva} loading={saving} className="flex-1"><Upload size={15} /> Carica</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
