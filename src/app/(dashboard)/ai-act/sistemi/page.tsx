'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDate, todayLocal } from '@/lib/utils';
import { reportUnknown } from '@/lib/report-error';
import { RUOLO_LABEL, RISCHIO_LABEL, RISCHIO_TONE, type AiSystemRow } from '@/lib/ai-act/db';
import type { RuoloAi, ClassificazioneRischio } from '@/lib/ai-act/tipi';
import { ArrowLeft, Cpu, Plus, Pencil } from 'lucide-react';

interface Membro { id: string; full_name: string }

const RUOLI: { value: RuoloAi; label: string }[] = [
  { value: 'DEPLOYER', label: 'Utilizzatore (deployer)' },
  { value: 'PROVIDER', label: 'Fornitore (provider)' },
  { value: 'ENTRAMBI', label: 'Entrambi' },
];
const RISCHI: { value: ClassificazioneRischio; label: string }[] = [
  { value: 'MINIMO', label: 'Minimo' },
  { value: 'LIMITATO', label: 'Limitato (art. 50)' },
  { value: 'ALTO', label: 'Alto (Allegato III)' },
  { value: 'VIETATO', label: 'Vietato (art. 5)' },
];

interface FormState {
  nome: string; fornitore: string; versione: string; finalita: string; descrizione_uso: string;
  ruolo_pira_web: RuoloAi; classif_rischio: ClassificazioneRischio; motivazione_rischio: string;
  responsabile_id: string; output_pubblicato: boolean; dati_personali: boolean; dati_art9: boolean;
  training_opt_out: boolean; url_doc_fornitore: string; attivo: boolean; data_attivazione: string;
}

const emptyForm = (): FormState => ({
  nome: '', fornitore: '', versione: '', finalita: '', descrizione_uso: '',
  ruolo_pira_web: 'DEPLOYER', classif_rischio: 'LIMITATO', motivazione_rischio: '',
  responsabile_id: '', output_pubblicato: false, dati_personali: false, dati_art9: false,
  training_opt_out: false, url_doc_fornitore: '', attivo: true, data_attivazione: todayLocal(),
});

export default function RegistroSistemi() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [sistemi, setSistemi] = useState<AiSystemRow[]>([]);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AiSystemRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const carica = useCallback(async () => {
    const [sisRes, memRes] = await Promise.all([
      supabase.from('ai_systems').select('*').order('nome'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    if (sisRes.error) { reportUnknown(sisRes.error, 'client', { stage: 'ai-sistemi' }); toast.error('Errore caricamento'); }
    setSistemi((sisRes.data ?? []) as AiSystemRow[]);
    setMembri((memRes.data ?? []) as Membro[]);
    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => { carica(); }, [carica]);

  const nomeMembro = (id: string) => membri.find((m) => m.id === id)?.full_name ?? '—';

  const apriNuovo = () => { setEditing(null); setForm({ ...emptyForm(), responsabile_id: profile?.id ?? '' }); setShowForm(true); };
  const apriModifica = (s: AiSystemRow) => {
    setEditing(s);
    setForm({
      nome: s.nome, fornitore: s.fornitore, versione: s.versione ?? '', finalita: s.finalita,
      descrizione_uso: s.descrizione_uso, ruolo_pira_web: s.ruolo_pira_web, classif_rischio: s.classif_rischio,
      motivazione_rischio: s.motivazione_rischio ?? '', responsabile_id: s.responsabile_id,
      output_pubblicato: s.output_pubblicato, dati_personali: s.dati_personali, dati_art9: s.dati_art9,
      training_opt_out: s.training_opt_out, url_doc_fornitore: s.url_doc_fornitore ?? '',
      attivo: s.attivo, data_attivazione: s.data_attivazione,
    });
    setShowForm(true);
  };

  const salva = async () => {
    if (!form.nome.trim() || !form.fornitore.trim() || !form.finalita.trim()) return toast.error('Nome, fornitore e finalità sono obbligatori');
    if (form.classif_rischio !== 'MINIMO' && !form.motivazione_rischio.trim())
      return toast.error('Motiva la classificazione di rischio: perché il sistema non è ad alto rischio?');
    if (form.classif_rischio === 'VIETATO' && form.attivo) return toast.error('Un sistema vietato non può risultare attivo');
    if (!form.responsabile_id) return toast.error('Indica un responsabile');
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(), fornitore: form.fornitore.trim(), versione: form.versione.trim() || null,
        finalita: form.finalita.trim(), descrizione_uso: form.descrizione_uso.trim() || form.finalita.trim(),
        ruolo_pira_web: form.ruolo_pira_web, classif_rischio: form.classif_rischio,
        motivazione_rischio: form.motivazione_rischio.trim() || null, responsabile_id: form.responsabile_id,
        output_pubblicato: form.output_pubblicato, dati_personali: form.dati_personali, dati_art9: form.dati_art9,
        training_opt_out: form.training_opt_out, url_doc_fornitore: form.url_doc_fornitore.trim() || null,
        attivo: form.attivo, data_attivazione: form.data_attivazione,
      };
      const { error } = editing
        ? await supabase.from('ai_systems').update(payload).eq('id', editing.id)
        : await supabase.from('ai_systems').insert(payload);
      if (error) throw error;
      toast.success(editing ? 'Sistema aggiornato' : 'Sistema aggiunto al registro');
      setShowForm(false);
      carica();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'ai-sistemi-save' });
      toast.error((e as { message?: string })?.message || 'Errore salvataggio');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <Link href="/ai-act" className="inline-flex items-center gap-1 text-sm text-pw-text-muted hover:text-pw-text">
        <ArrowLeft size={15} /> Conformità IA
      </Link>
      <PageHeader
        eyebrow="Registro"
        title="Sistemi di IA"
        subtitle="I sistemi di IA utilizzati e forniti da PIRA WEB, con ruolo e classificazione di rischio."
        actions={isAdmin ? <Button onClick={apriNuovo}><Plus size={16} /> Nuovo sistema</Button> : undefined}
      />

      {loading ? (
        <p className="text-sm text-pw-text-muted">Caricamento…</p>
      ) : sistemi.length === 0 ? (
        <EmptyState icon={Cpu} title="Registro vuoto" description="Aggiungi i sistemi di IA in uso per iniziare il censimento." />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pw-border text-left text-xs text-pw-text-muted">
                <th className="px-4 py-2.5 font-medium">Sistema</th>
                <th className="px-4 py-2.5 font-medium">Finalità</th>
                <th className="px-4 py-2.5 font-medium">Ruolo</th>
                <th className="px-4 py-2.5 font-medium">Rischio</th>
                <th className="px-4 py-2.5 font-medium">Responsabile</th>
                <th className="px-4 py-2.5 font-medium">Stato</th>
                {isAdmin && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-pw-border">
              {sistemi.map((s) => (
                <tr key={s.id} className="hover:bg-pw-surface-2/50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-pw-text">{s.nome}</div>
                    <div className="text-xs text-pw-text-dim">{s.fornitore}</div>
                  </td>
                  <td className="px-4 py-2.5 max-w-[260px] text-pw-text-muted">{s.finalita}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral" size="sm">{RUOLO_LABEL[s.ruolo_pira_web]}</Badge></td>
                  <td className="px-4 py-2.5"><Badge tone={RISCHIO_TONE[s.classif_rischio]} size="sm">{RISCHIO_LABEL[s.classif_rischio]}</Badge></td>
                  <td className="px-4 py-2.5 text-pw-text-muted">{nomeMembro(s.responsabile_id)}</td>
                  <td className="px-4 py-2.5">
                    {s.attivo ? <Badge tone="success" size="sm" dot>Attivo</Badge> : <Badge tone="neutral" size="sm">Dismesso</Badge>}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => apriModifica(s)} className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2" title="Modifica"><Pencil size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Modifica sistema' : 'Nuovo sistema di IA'} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input id="s-nome" label="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Es. Claude (API)" />
            <Input id="s-forn" label="Fornitore *" value={form.fornitore} onChange={(e) => setForm({ ...form, fornitore: e.target.value })} placeholder="Es. Anthropic PBC" />
          </div>
          <Input id="s-fin" label="Finalità *" value={form.finalita} onChange={(e) => setForm({ ...form, finalita: e.target.value })} placeholder="A cosa serve" />
          <Textarea id="s-desc" label="Descrizione d'uso" value={form.descrizione_uso} onChange={(e) => setForm({ ...form, descrizione_uso: e.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Select id="s-ruolo" label="Ruolo di PIRA WEB" value={form.ruolo_pira_web} onChange={(e) => setForm({ ...form, ruolo_pira_web: e.target.value as RuoloAi })} options={RUOLI} />
            <Select id="s-risk" label="Classificazione rischio" value={form.classif_rischio} onChange={(e) => setForm({ ...form, classif_rischio: e.target.value as ClassificazioneRischio })} options={RISCHI} />
          </div>
          {form.classif_rischio !== 'MINIMO' && (
            <Textarea id="s-mot" label="Motivazione del rischio *" value={form.motivazione_rischio} onChange={(e) => setForm({ ...form, motivazione_rischio: e.target.value })} rows={2}
              placeholder="Perché non è ad alto rischio (Allegato III)? Va motivato, non dato per scontato." />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Select id="s-resp" label="Responsabile" value={form.responsabile_id} onChange={(e) => setForm({ ...form, responsabile_id: e.target.value })}
              options={membri.map((m) => ({ value: m.id, label: m.full_name }))} placeholder="Seleziona…" />
            <Input id="s-data" label="Data attivazione" type="date" value={form.data_attivazione} onChange={(e) => setForm({ ...form, data_attivazione: e.target.value })} />
          </div>
          <Input id="s-url" label="Link documentazione fornitore" value={form.url_doc_fornitore} onChange={(e) => setForm({ ...form, url_doc_fornitore: e.target.value })} placeholder="https://…" />
          <div className="flex flex-wrap gap-4 pt-1 text-sm text-pw-text">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.output_pubblicato} onChange={(e) => setForm({ ...form, output_pubblicato: e.target.checked })} className="accent-pw-accent" /> Output pubblicato</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.dati_personali} onChange={(e) => setForm({ ...form, dati_personali: e.target.checked })} className="accent-pw-accent" /> Tratta dati personali</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.training_opt_out} onChange={(e) => setForm({ ...form, training_opt_out: e.target.checked })} className="accent-pw-accent" /> Opt-out training</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.attivo} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} className="accent-pw-accent" /> Attivo</label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Annulla</Button>
            <Button onClick={salva} loading={saving} className="flex-1">{editing ? 'Aggiorna' : 'Aggiungi al registro'}</Button>
          </div>
        </div>
      </Modal>

      <p className="text-xs text-pw-text-dim">Ultimo aggiornamento del registro: {sistemi[0] ? formatDate(sistemi.map((s) => s.updated_at).sort().reverse()[0]) : '—'}.</p>
    </div>
  );
}
