'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import type { TimeEntry } from '@/types/database';
import { Play, Square, Clock, Plus, Trash2 } from 'lucide-react';

interface TimeTrackerProps {
  taskId: string;
  estimatedHours: number | null;
  loggedHours: number;
  onUpdate?: () => void;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function TimeTracker({ taskId, estimatedHours, loggedHours, onUpdate }: TimeTrackerProps) {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [showManual, setShowManual] = useState(false);
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEntries = useCallback(async () => {
    const { data } = await supabase
      .from('time_entries')
      .select('*, user:profiles!time_entries_user_id_fkey(id, full_name, color)')
      .eq('task_id', taskId)
      .order('started_at', { ascending: false });
    if (data) {
      setEntries(data as TimeEntry[]);
      const running = (data as TimeEntry[]).find((e) => e.is_running && e.user_id === profile?.id);
      setRunningEntry(running || null);
    }
  }, [supabase, taskId, profile?.id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Timer tick
  useEffect(() => {
    if (runningEntry) {
      const tick = () => setElapsed(formatElapsed(runningEntry.started_at));
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setElapsed('00:00:00');
    }
  }, [runningEntry]);

  const handleStart = async () => {
    if (!profile) return;
    setLoading(true);
    const { error } = await supabase.from('time_entries').insert({
      task_id: taskId,
      user_id: profile.id,
      started_at: new Date().toISOString(),
      is_running: true,
    });
    if (error) {
      toast.error('Errore nell\'avvio del timer');
    } else {
      toast.success('Timer avviato');
      fetchEntries();
      onUpdate?.();
    }
    setLoading(false);
  };

  const handleStop = async () => {
    if (!runningEntry) return;
    setLoading(true);
    const { error } = await supabase
      .from('time_entries')
      .update({ ended_at: new Date().toISOString(), is_running: false })
      .eq('id', runningEntry.id);
    if (error) {
      toast.error('Errore nello stop del timer');
    } else {
      toast.success('Timer fermato');
      setRunningEntry(null);
      fetchEntries();
      onUpdate?.();
    }
    setLoading(false);
  };

  const handleManualAdd = async () => {
    if (!profile) return;
    const totalMinutes = (parseInt(manualHours || '0') * 60) + parseInt(manualMinutes || '0');
    if (totalMinutes <= 0) {
      toast.error('Inserisci una durata valida');
      return;
    }
    setLoading(true);
    const now = new Date();
    const started = new Date(now.getTime() - totalMinutes * 60 * 1000);
    const { error } = await supabase.from('time_entries').insert({
      task_id: taskId,
      user_id: profile.id,
      description: manualDesc || null,
      started_at: started.toISOString(),
      ended_at: now.toISOString(),
      duration_minutes: totalMinutes,
      is_running: false,
    });
    if (error) {
      toast.error('Errore nel log manuale');
    } else {
      toast.success('Ore registrate');
      setManualHours('');
      setManualMinutes('');
      setManualDesc('');
      setShowManual(false);
      fetchEntries();
      onUpdate?.();
    }
    setLoading(false);
  };

  const handleDelete = async (entryId: string) => {
    const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
    if (!error) {
      fetchEntries();
      onUpdate?.();
    }
  };

  const pct = estimatedHours && estimatedHours > 0
    ? Math.min(100, Math.round((loggedHours / estimatedHours) * 100))
    : null;
  const isOverBudget = estimatedHours && loggedHours > estimatedHours;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-pw-surface-2">
        <Clock size={20} className="text-pw-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-bold ${isOverBudget ? 'text-red-400' : 'text-pw-text'}`}>
              {formatDuration(loggedHours * 60)}
            </span>
            {estimatedHours != null && estimatedHours > 0 && (
              <span className="text-sm text-pw-text-muted">
                / {formatDuration(estimatedHours * 60)} stimate
              </span>
            )}
          </div>
          {pct !== null && (
            <div className="mt-1.5 h-1.5 bg-pw-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-pw-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        {/* Timer controls */}
        {runningEntry ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg text-pw-accent font-bold">{elapsed}</span>
            <Button size="sm" variant="danger" onClick={handleStop} loading={loading}>
              <Square size={14} />
              Stop
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleStart} loading={loading}>
            <Play size={14} />
            Avvia Timer
          </Button>
        )}
      </div>

      {/* Manual log toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowManual(!showManual)}
          className="text-xs text-pw-accent hover:underline flex items-center gap-1"
        >
          <Plus size={12} />
          Log manuale
        </button>
      </div>

      {/* Manual entry form */}
      {showManual && (
        <div className="p-4 rounded-xl border border-pw-border bg-pw-surface space-y-3">
          <div className="flex gap-3">
            <div>
              <label className="text-xs text-pw-text-muted block mb-1">Ore</label>
              <input
                type="number"
                min="0"
                max="24"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                className="w-20 px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-pw-text-muted block mb-1">Minuti</label>
              <input
                type="number"
                min="0"
                max="59"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                className="w-20 px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm"
                placeholder="0"
              />
            </div>
          </div>
          <input
            type="text"
            value={manualDesc}
            onChange={(e) => setManualDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm"
            placeholder="Descrizione (opzionale)"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleManualAdd} loading={loading}>Salva</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowManual(false)}>Annulla</Button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-pw-text-muted mb-2">Log ore</p>
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-pw-surface-2/50 text-sm">
              <div className="flex-1 min-w-0">
                <span className="text-pw-text font-medium">
                  {entry.duration_minutes ? formatDuration(entry.duration_minutes) : (
                    entry.is_running ? <span className="text-pw-accent">In corso...</span> : '—'
                  )}
                </span>
                {entry.description && (
                  <span className="text-pw-text-muted ml-2">— {entry.description}</span>
                )}
              </div>
              <span className="text-[10px] text-pw-text-dim shrink-0">
                {new Date(entry.started_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
              </span>
              {entry.user_id === profile?.id && !entry.is_running && (
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-pw-text-dim hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
