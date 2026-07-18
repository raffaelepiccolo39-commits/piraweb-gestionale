'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError } from '@/lib/report-error';

/**
 * Prompt veloce "Quante ore?" al completamento di una task. Non blocca: c'è
 * sempre "Salta". Serve a raccogliere le ore anche quando il team non usa il
 * timer (task spostate direttamente su Fatto), così la redditività per cliente
 * diventa reale. Registra una time_entry chiusa con la durata scelta.
 */

const QUICK: { label: string; hours: number }[] = [
  { label: '½h', hours: 0.5 },
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: 'Giornata', hours: 8 },
];

export function LogHoursModal({ open, taskId, taskTitle, userId, onClose, onLogged }: {
  open: boolean;
  taskId: string | null;
  taskTitle: string;
  userId: string | null;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);

  async function log(hours: number) {
    if (!taskId || !userId || !Number.isFinite(hours) || hours <= 0) {
      toast.error('Inserisci un numero di ore valido');
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('time_entries').insert({
      task_id: taskId,
      user_id: userId,
      started_at: now,
      ended_at: now,
      duration_minutes: Math.round(hours * 60),
      is_running: false,
    });
    setSaving(false);
    if (error) { reportSupabaseError(error, 'log-ore-al-completamento', { taskId }); toast.error('Errore nel salvare le ore'); return; }
    toast.success(`Registrate ${hours}h`);
    setCustom('');
    onLogged?.();
    onClose();
  }

  function skip() { setCustom(''); onClose(); }

  return (
    <Modal open={open} onClose={skip} title="Quante ore ci hai messo?" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-pw-text-muted line-clamp-2">{taskTitle}</p>

        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q.label} variant="outline" size="sm" disabled={saving} onClick={() => log(q.hours)}>
              {q.label}
            </Button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Oppure ore precise"
              type="number"
              min="0"
              step="0.5"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="es. 1,5"
            />
          </div>
          <Button variant="primary" loading={saving} onClick={() => log(parseFloat(custom.replace(',', '.')))}>
            Salva
          </Button>
        </div>

        <div className="flex justify-end">
          <button onClick={skip} className="text-xs text-pw-text-dim hover:text-pw-text">
            Salta, le aggiungo dopo
          </button>
        </div>
      </div>
    </Modal>
  );
}
