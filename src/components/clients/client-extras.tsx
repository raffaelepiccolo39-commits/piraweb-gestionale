'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, todayLocal } from '@/lib/utils';
import { Plus, Check, Pencil, Trash2, Sparkles } from 'lucide-react';
import type { ClientExtra } from '@/types/database';
import { reportUnknown } from '@/lib/report-error';
import { totaleExtra } from '@/lib/lavori-extra';

/**
 * Lavori extra fatturati al cliente fuori dal canone. Alzano quanto il cliente
 * deve; gli incassi NON si segnano qui ma come acconto, così i soldi entrano
 * nei conti da un punto solo. Vedi src/lib/lavori-extra.ts.
 */

const formatEur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

interface Props {
  clientId: string;
  /** Chiamata a ogni ricarica: la scheda ci somma il "ti deve in tutto". */
  onTotaleChange?: (totale: number) => void;
}

interface FormState {
  label: string;
  amount: string;
  work_date: string;
  due_date: string;
  notes: string;
  project_id: string;
}

const emptyForm = (): FormState => ({
  label: '',
  amount: '',
  work_date: todayLocal(),
  due_date: '',
  notes: '',
  project_id: '',
});

export function ClientExtras({ clientId, onTotaleChange }: Props) {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [items, setItems] = useState<ClientExtra[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClientExtra | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // In un ref: se finisse fra le dipendenze, un genitore che passa la callback
  // inline farebbe ripartire la fetch a ogni render.
  const onTotaleChangeRef = useRef(onTotaleChange);
  onTotaleChangeRef.current = onTotaleChange;

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_extras')
      .select('*, project:projects(id, name)')
      .eq('client_id', clientId)
      .order('work_date', { ascending: false });
    if (error) {
      reportUnknown(error, 'client', { stage: 'fetch_extras' });
      toast.error('Errore caricamento lavori extra');
    } else {
      const righe = (data as ClientExtra[]) || [];
      setItems(righe);
      onTotaleChangeRef.current?.(totaleExtra(righe));
    }
    setLoading(false);
  }, [supabase, clientId, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('client_id', clientId)
        .order('name');
      if (error) { reportUnknown(error, 'client', { stage: 'fetch_projects_extras' }); return; }
      if (!annullato) setProjects((data as { id: string; name: string }[]) || []);
    })();
    return () => { annullato = true; };
  }, [supabase, clientId]);

  const totale = totaleExtra(items);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowForm(true); };

  const openEdit = (it: ClientExtra) => {
    setEditing(it);
    setForm({
      label: it.label,
      amount: String(it.amount),
      work_date: it.work_date,
      due_date: it.due_date || '',
      notes: it.notes || '',
      project_id: it.project_id || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return toast.error('Scrivi che lavoro è (es. "Landing Black Friday")');
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Importo non valido');
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        project_id: form.project_id || null,
        label: form.label.trim(),
        amount: amt,
        work_date: form.work_date || todayLocal(),
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        ...(editing ? {} : { created_by: profile?.id ?? null }),
      };
      const { error } = editing
        ? await supabase.from('client_extras').update(payload).eq('id', editing.id)
        : await supabase.from('client_extras').insert(payload);
      if (error) throw error;
      toast.success(editing ? 'Lavoro extra aggiornato' : 'Lavoro extra aggiunto');
      setShowForm(false);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'save_extra' });
      toast.error((e as { message?: string })?.message || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('client_extras').delete().eq('id', deletingId);
      if (error) throw error;
      toast.success('Lavoro extra eliminato');
      setDeletingId(null);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'delete_extra' });
      toast.error('Errore eliminazione');
    }
  };

  if (!isAdmin) return null;
  if (loading) return <div className="text-sm text-pw-text-muted">Caricamento lavori extra…</div>;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-pw-text-muted uppercase tracking-wide">Totale lavori extra</div>
          <div className="text-lg font-semibold text-pw-text tabular-nums">{formatEur(totale)}</div>
          <p className="text-xs text-pw-text-dim mt-1">
            Si sommano al valore del contratto in &quot;ti deve in tutto&quot;. Quando il cliente paga,
            registra un acconto: non c&apos;è una spunta &quot;pagato&quot; qui.
          </p>
        </CardContent></Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-pw-text flex items-center gap-2">
          <Sparkles size={15} className="text-pw-text-muted" /> Lavori extra
          {items.length > 0 && <span className="text-xs text-pw-text-dim font-normal">({items.length})</span>}
        </h3>
        <Button variant="primary" onClick={openCreate}><Plus size={14} /> Nuovo lavoro extra</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nessun lavoro extra"
          description="Quello che fatturi fuori dal canone: una landing in più, uno shooting fuori pacchetto, una campagna una tantum."
          action={<Button variant="primary" onClick={openCreate}><Plus size={14} /> Nuovo lavoro extra</Button>}
        />
      ) : (
        <Card><CardContent className="p-0 divide-y divide-pw-border">
          {items.map((it) => {
            const scaduto = it.due_date && it.due_date < todayLocal();
            return (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-1.5 h-10 rounded-full ${scaduto ? 'bg-pw-danger' : 'bg-pw-border'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-pw-text">{it.label}</span>
                    {it.project && <Badge tone="neutral">{it.project.name}</Badge>}
                    {scaduto && <Badge tone="danger" dot>Da incassare</Badge>}
                  </div>
                  <p className="text-xs text-pw-text-muted truncate">
                    {formatDate(it.work_date)}
                    {it.due_date && <> · da incassare entro {formatDate(it.due_date)}</>}
                    {it.notes && <> · {it.notes}</>}
                  </p>
                </div>
                <span className="text-base font-semibold text-pw-text tabular-nums whitespace-nowrap">
                  {formatEur(Number(it.amount))}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(it)}
                    className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2"
                    aria-label="Modifica lavoro extra"
                    title="Modifica"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeletingId(it.id)}
                    className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-danger hover:bg-pw-surface-2"
                    aria-label="Elimina lavoro extra"
                    title="Elimina"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </CardContent></Card>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Modifica lavoro extra' : 'Nuovo lavoro extra'} size="sm">
        <div className="space-y-3">
          <Input
            id="extra-label"
            label="Che lavoro è *"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder='Es. "Landing Black Friday", "Shooting extra"'
          />
          {projects.length > 0 && (
            <Select
              id="extra-project"
              label="Progetto (opzionale)"
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Nessun progetto"
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="extra-amount"
              label="Importo (€) *"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Input
              id="extra-work-date"
              label="Data del lavoro"
              type="date"
              value={form.work_date}
              onChange={(e) => setForm({ ...form, work_date: e.target.value })}
            />
          </div>
          <Input
            id="extra-due"
            label="Da incassare entro (opzionale)"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
          <Textarea
            id="extra-notes"
            label="Note (opzionale)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              <Check size={14} /> {editing ? 'Aggiorna' : 'Salva'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Eliminare il lavoro extra?"
        description="Sparisce da quanto il cliente ti deve. L'azione è irreversibile."
        confirmLabel="Elimina"
        variant="danger"
      />
    </div>
  );
}
