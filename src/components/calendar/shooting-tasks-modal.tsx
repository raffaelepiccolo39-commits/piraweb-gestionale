'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Loader2, Camera, Check } from 'lucide-react';
import { reportUnknown } from '@/lib/report-error';

interface PreviewTask {
  step_key: string;
  title: string;
  description: string;
  role: string;
  assigned_to: string | null;
  assignee_name: string | null;
  extra_assignees: { id: string; name: string }[];
  deadline: string;
  estimated_hours: number;
  priority: string;
}

interface Row extends PreviewTask {
  include: boolean;
}

interface Props {
  open: boolean;
  calendarEventId: string | null;
  onClose: () => void;
  onGenerated?: () => void;
}

export function ShootingTasksModal({ open, calendarEventId, onClose, onGenerated }: Props) {
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [alreadyGenerated, setAlreadyGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!calendarEventId) return;
    setLoading(true);
    setError(null);
    try {
      const [prevRes, peopleRes] = await Promise.all([
        fetch('/api/shooting/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'preview', calendar_event_id: calendarEventId }),
        }),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      ]);
      const prev = await prevRes.json();
      if (!prevRes.ok) { setError(prev.error || 'Anteprima non disponibile'); return; }
      setAlreadyGenerated(!!prev.already_generated);
      setRows(((prev.tasks as PreviewTask[]) || []).map((t) => ({ ...t, include: true })));
      setPeople((peopleRes.data as { id: string; full_name: string }[]) || []);
    } catch (err) {
      reportUnknown(err, 'client', { op: 'shooting-anteprima' });
      setError('Errore di rete');
    } finally {
      setLoading(false);
    }
  }, [calendarEventId, supabase]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const confirm = async () => {
    const selected = rows.filter((r) => r.include);
    if (selected.length === 0) { toast.error('Seleziona almeno un task'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/shooting/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'confirm',
          calendar_event_id: calendarEventId,
          tasks: selected.map((r) => ({
            step_key: r.step_key,
            title: r.title,
            description: r.description,
            assigned_to: r.assigned_to,
            extra_assignees: r.extra_assignees,
            deadline: r.deadline,
            estimated_hours: r.estimated_hours,
            priority: r.priority,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'Generazione non riuscita'); return; }
      toast.success(`${json.created} task creati e assegnati`);
      onGenerated?.();
      onClose();
    } catch (err) {
      reportUnknown(err, 'client', { op: 'shooting-conferma' });
      toast.error('Errore di rete');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Task produzione shooting" size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12 text-pw-text-dim">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="space-y-4">
          <p className="text-sm text-red-500">{error}</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Chiudi</Button>
          </div>
        </div>
      ) : alreadyGenerated ? (
        <div className="space-y-4">
          <p className="text-sm text-pw-text-muted flex items-center gap-2">
            <Check size={16} className="text-green-500" /> I task di produzione per questo shooting sono già stati generati.
          </p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Chiudi</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-pw-text-muted flex items-center gap-2">
            <Camera size={16} className="text-pink-400" />
            Task proposti in base alla data di shooting. Controlla assegnatario, scadenza e ore, poi genera.
          </p>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={r.step_key}
                className={`rounded-xl border px-4 py-3 transition-opacity ${r.include ? 'border-pw-border bg-pw-surface-2' : 'border-pw-border/50 opacity-50'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => updateRow(i, { include: e.target.checked })}
                    className="mt-1 accent-pw-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-pw-text">{r.title}</p>
                    {r.extra_assignees.length > 0 && (
                      <p className="text-[11px] text-pw-text-dim mt-0.5">
                        Anche: {r.extra_assignees.map((e) => e.name).join(', ')}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                      <Select
                        aria-label="Assegnatario"
                        value={r.assigned_to ?? ''}
                        onChange={(e) => updateRow(i, { assigned_to: e.target.value || null })}
                        options={[{ value: '', label: 'Nessuno' }, ...people.map((p) => ({ value: p.id, label: p.full_name }))]}
                      />
                      <Input
                        type="date"
                        aria-label="Scadenza"
                        value={r.deadline}
                        onChange={(e) => updateRow(i, { deadline: e.target.value })}
                      />
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        aria-label="Ore stimate"
                        value={String(r.estimated_hours)}
                        onChange={(e) => updateRow(i, { estimated_hours: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Annulla</Button>
            <Button variant="primary" onClick={confirm} loading={saving} className="flex-1 justify-center">
              <Camera size={16} /> Genera task
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
