'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { SkeletonList } from '@/components/ui/skeleton';
import { getInitials, getRoleLabel, todayLocal, formatDateLocal } from '@/lib/utils';
import type { Profile } from '@/types/database';
import { X, Clock, ChevronLeft, ChevronRight, Plus, Coffee, Utensils } from 'lucide-react';

// Struttura giornata: 16 slot da 30 min (8h) + pause non riempibili.
type Row =
  | { type: 'slot'; index: number; time: string }
  | { type: 'break'; label: string; icon: 'coffee' | 'lunch' };

const ROWS: Row[] = [
  { type: 'slot', index: 0, time: '09:00' },
  { type: 'slot', index: 1, time: '09:30' },
  { type: 'slot', index: 2, time: '10:00' },
  { type: 'slot', index: 3, time: '10:30' },
  { type: 'break', label: 'Pausa caffè', icon: 'coffee' },
  { type: 'slot', index: 4, time: '11:00' },
  { type: 'slot', index: 5, time: '11:30' },
  { type: 'slot', index: 6, time: '12:00' },
  { type: 'slot', index: 7, time: '12:30' },
  { type: 'slot', index: 8, time: '13:00' },
  { type: 'break', label: 'Pausa pranzo', icon: 'lunch' },
  { type: 'slot', index: 9, time: '15:00' },
  { type: 'slot', index: 10, time: '15:30' },
  { type: 'slot', index: 11, time: '16:00' },
  { type: 'slot', index: 12, time: '16:30' },
  { type: 'slot', index: 13, time: '17:00' },
  { type: 'slot', index: 14, time: '17:30' },
  { type: 'slot', index: 15, time: '18:00' },
];
const TOTAL_SLOTS = 16;

interface PlanTask {
  id: string;
  title: string;
  estimated_hours: number | null;
  assigned_to?: string | null;
  project?: { name?: string; color?: string; client?: { name?: string; company?: string | null } | null } | null;
}
interface SlotEntry {
  planId: string;
  task: PlanTask | null;
  label: string | null;
}
const MANUAL_COLOR = '#64748b'; // slate: slot manuali (senza task)
// slotMap[userId][slotIndex] = SlotEntry
type SlotMap = Record<string, Record<number, SlotEntry>>;

function clientLabel(task?: PlanTask): string {
  const p = task?.project;
  return p?.client?.company || p?.client?.name || p?.name || '';
}
function projectColor(task?: PlanTask): string {
  return task?.project?.color || '#FFD108';
}
function slotsForHours(h: number | null): number {
  if (!h || h <= 0) return 1;
  return Math.max(1, Math.round(h * 2));
}
// Chiave per raggruppare slot consecutivi dello stesso blocco (task o manuale)
function entryKey(e?: SlotEntry | null): string {
  if (!e) return '';
  return e.task?.id ?? `label:${e.label ?? ''}`;
}

export default function PianificazionePage() {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const [date, setDate] = useState<string>(todayLocal());
  const [members, setMembers] = useState<Profile[]>([]);
  const [slotMap, setSlotMap] = useState<SlotMap>({});
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Ore reali (consuntivo dal timer) per collaboratore, nella data scelta
  const [actualByUser, setActualByUser] = useState<Record<string, number>>({});

  // Modal di assegnazione
  const [target, setTarget] = useState<{ userId: string; slotIndex: number } | null>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualHours, setManualHours] = useState('0.5');

  const fetchData = useCallback(async () => {
    const nextDay = formatDateLocal(new Date(new Date(date + 'T12:00:00').getTime() + 86400000));
    const [membersRes, slotsRes, tasksRes, entriesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase
        .from('task_plan_slots')
        .select('id, user_id, slot_index, label, task:tasks(id, title, estimated_hours, project:projects(name, color, client:clients(name, company)))')
        .eq('plan_date', date),
      supabase
        .from('tasks')
        .select('id, title, estimated_hours, assigned_to, project:projects(name, color, client:clients(name, company))')
        .neq('status', 'done')
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(400),
      // Ore reali registrate col timer, nella data scelta
      supabase
        .from('time_entries')
        .select('user_id, duration_minutes')
        .eq('is_running', false)
        .gte('started_at', `${date}T00:00:00`)
        .lt('started_at', `${nextDay}T00:00:00`),
    ]);

    setMembers((membersRes.data as Profile[]) || []);
    setTasks((tasksRes.data as PlanTask[]) || []);

    const map: SlotMap = {};
    for (const row of (slotsRes.data as Array<{ id: string; user_id: string; slot_index: number; label: string | null; task: PlanTask | null }>) || []) {
      if (!map[row.user_id]) map[row.user_id] = {};
      map[row.user_id][row.slot_index] = { planId: row.id, task: row.task, label: row.label };
    }
    setSlotMap(map);

    const actual: Record<string, number> = {};
    for (const e of (entriesRes.data as Array<{ user_id: string; duration_minutes: number | null }>) || []) {
      actual[e.user_id] = (actual[e.user_id] || 0) + (e.duration_minutes || 0) / 60;
    }
    setActualByUser(actual);

    setLoading(false);
  }, [supabase, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const shiftDate = (days: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(formatDateLocal(d));
  };

  const openPicker = (userId: string, slotIndex: number) => {
    setPickSearch('');
    setManualText('');
    setManualHours('0.5');
    setTarget({ userId, slotIndex });
  };

  const assignTask = async (task: PlanTask) => {
    if (!target || !profile) return;
    const { userId, slotIndex } = target;
    const want = slotsForHours(task.estimated_hours);
    const memberSlots = slotMap[userId] || {};
    // slot liberi consecutivi a partire da quello cliccato
    let free = 0;
    for (let i = slotIndex; i < TOTAL_SLOTS && free < want; i++) {
      if (memberSlots[i]) break;
      free++;
    }
    if (free === 0) { toast.error('Questo slot è già occupato'); return; }
    const toInsert = Array.from({ length: free }, (_, i) => ({
      user_id: userId,
      task_id: task.id,
      plan_date: date,
      slot_index: slotIndex + i,
      created_by: profile.id,
    }));
    const { error } = await supabase.from('task_plan_slots').insert(toInsert);
    if (error) { toast.error(error.message || 'Errore nella pianificazione'); return; }
    if (free < want) {
      toast.success(`Inseriti ${free} slot su ${want}: spazio consecutivo insufficiente`);
    } else {
      toast.success(`Pianificata (${(free * 0.5).toFixed(1)}h)`);
    }
    setTarget(null);
    fetchData();
  };

  const assignManual = async () => {
    if (!target || !profile) return;
    const text = manualText.trim();
    if (!text) { toast.error('Scrivi cosa c\'è da fare'); return; }
    const want = slotsForHours(parseFloat(manualHours.replace(',', '.')) || 0.5);
    const { userId, slotIndex } = target;
    const memberSlots = slotMap[userId] || {};
    let free = 0;
    for (let i = slotIndex; i < TOTAL_SLOTS && free < want; i++) {
      if (memberSlots[i]) break;
      free++;
    }
    if (free === 0) { toast.error('Questo slot è già occupato'); return; }
    const toInsert = Array.from({ length: free }, (_, i) => ({
      user_id: userId,
      task_id: null,
      label: text,
      plan_date: date,
      slot_index: slotIndex + i,
      created_by: profile.id,
    }));
    const { error } = await supabase.from('task_plan_slots').insert(toInsert);
    if (error) { toast.error(error.message || 'Errore nella pianificazione'); return; }
    toast.success(`Aggiunta attività (${(free * 0.5).toFixed(1)}h)`);
    setManualText('');
    setManualHours('0.5');
    setTarget(null);
    fetchData();
  };

  const removeBlock = async (userId: string, slotIndex: number) => {
    const memberSlots = slotMap[userId] || {};
    const entry = memberSlots[slotIndex];
    if (!entry) return;
    const key = entryKey(entry);
    let start = slotIndex;
    while (start > 0 && memberSlots[start - 1] && entryKey(memberSlots[start - 1]) === key) start--;
    let end = slotIndex;
    while (end < TOTAL_SLOTS - 1 && memberSlots[end + 1] && entryKey(memberSlots[end + 1]) === key) end++;
    const ids: string[] = [];
    for (let i = start; i <= end; i++) {
      if (memberSlots[i]?.planId) ids.push(memberSlots[i].planId);
    }
    if (ids.length === 0) return;
    const { error } = await supabase.from('task_plan_slots').delete().in('id', ids);
    if (error) { toast.error(error.message || 'Errore nella rimozione'); return; }
    fetchData();
  };

  // Ore pianificate per persona (per l'header)
  const plannedHours = (userId: string): number => {
    const m = slotMap[userId];
    return m ? Object.keys(m).length * 0.5 : 0;
  };

  const filteredTasks = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    let list = tasks;
    if (q) {
      list = tasks.filter((t) =>
        t.title.toLowerCase().includes(q) || clientLabel(t).toLowerCase().includes(q)
      );
    } else if (target) {
      // Senza ricerca, mostra prima le task assegnate a quella persona
      list = [...tasks].sort((a, b) =>
        (a.assigned_to === target.userId ? 0 : 1) - (b.assigned_to === target.userId ? 0 : 1)
      );
    }
    return list.slice(0, 60);
  }, [tasks, pickSearch, target]);

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonList variant="row" count={8} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHeader
        title="Pianificazione"
        subtitle="Giornata da 8 ore in slot da 30 min: assegna le task a ogni collaboratore"
      />

      {/* Selettore data */}
      <div className="flex items-center gap-2">
        <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg border border-pw-border text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors" aria-label="Giorno precedente">
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
        />
        <button onClick={() => shiftDate(1)} className="p-1.5 rounded-lg border border-pw-border text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors" aria-label="Giorno successivo">
          <ChevronRight size={16} />
        </button>
        <span className="text-sm text-pw-text-muted capitalize ml-1">{dateLabel}</span>
        <button onClick={() => setDate(todayLocal())} className="ml-2 text-xs text-pw-accent hover:underline">Oggi</button>
      </div>

      {/* Griglia */}
      <div className="overflow-x-auto no-scrollbar rounded-xl border border-pw-border">
        <table className="w-full border-collapse text-xs [&_td]:border [&_th]:border [&_td]:border-pw-border [&_th]:border-pw-border [&_td]:h-9">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-pw-surface-2 w-16 min-w-16 px-2 py-2 text-left text-pw-text-dim font-medium border-b border-r border-pw-border">Ora</th>
              {members.map((m) => (
                <th key={m.id} className="min-w-[150px] px-2 py-2 text-left border-b border-pw-border bg-pw-surface-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: m.color || '#ff4d1c' }}>
                      {getInitials(m.full_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-pw-text font-semibold truncate">{m.full_name.split(' ')[0]}</p>
                      <p className="text-[10px] text-pw-text-muted truncate">{getRoleLabel(m.role)}</p>
                      <p className="text-[10px] text-pw-text-dim">
                        Pianif. <span className="text-pw-text-muted font-medium">{plannedHours(m.id).toFixed(1)}</span>/8h
                        {' · '}Reali <span className="text-pw-accent font-medium">{(actualByUser[m.id] || 0).toFixed(1)}h</span>
                      </p>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              if (row.type === 'break') {
                return (
                  <tr key={row.label}>
                    <td colSpan={members.length + 1} className="px-3 py-1 bg-pw-surface/60 border-b border-pw-border text-[10px] uppercase tracking-widest text-pw-text-dim">
                      <span className="inline-flex items-center gap-1.5">
                        {row.icon === 'coffee' ? <Coffee size={11} /> : <Utensils size={11} />}
                        {row.label}
                      </span>
                    </td>
                  </tr>
                );
              }
              const idx = row.index;
              return (
                <tr key={idx}>
                  <td className="sticky left-0 z-10 bg-pw-surface-2 px-2 py-1 text-pw-text-dim font-mono tabular-nums border-b border-r border-pw-border align-top">
                    {row.time}
                  </td>
                  {members.map((m) => {
                    const entry = slotMap[m.id]?.[idx];
                    const prev = slotMap[m.id]?.[idx - 1];
                    const prevSame = !!entry && entryKey(prev) === entryKey(entry);
                    if (entry) {
                      const color = entry.task ? projectColor(entry.task) : MANUAL_COLOR;
                      const top = entry.task ? clientLabel(entry.task) : 'Manuale';
                      const main = entry.task ? entry.task.title : (entry.label || '');
                      return (
                        <td
                          key={m.id}
                          onClick={() => removeBlock(m.id, idx)}
                          title="Clicca per rimuovere"
                          className="px-1.5 py-1 border-b border-pw-border cursor-pointer group align-top"
                          style={{ backgroundColor: color + '22', borderLeft: `3px solid ${color}` }}
                        >
                          {!prevSame && (
                            <div className="min-w-0">
                              <p className="text-[9px] uppercase text-pw-text-muted truncate leading-tight">{top}</p>
                              <p className="text-pw-text font-medium truncate leading-tight">{main}</p>
                            </div>
                          )}
                          <X size={11} className="opacity-0 group-hover:opacity-100 text-red-400 float-right -mt-4" />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={m.id}
                        onClick={() => openPicker(m.id, idx)}
                        className="px-1.5 py-1 border-b border-pw-border cursor-pointer hover:bg-pw-accent/5 text-center align-middle group"
                      >
                        <Plus size={12} className="opacity-0 group-hover:opacity-60 text-pw-text-dim mx-auto" />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal picker task */}
      <Modal open={!!target} onClose={() => setTarget(null)} title="Assegna una task allo slot" size="md">
        <div className="space-y-3">
          <p className="text-xs text-pw-text-muted">
            La task con ore stimate riempirà automaticamente gli slot liberi consecutivi.
          </p>
          <Input
            value={pickSearch}
            onChange={(e) => setPickSearch(e.target.value)}
            placeholder="Cerca per titolo o cliente…"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto space-y-1.5">
            {filteredTasks.length === 0 && (
              <p className="text-sm text-pw-text-dim text-center py-6">Nessuna task trovata</p>
            )}
            {filteredTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => assignTask(t)}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-pw-border bg-pw-surface-2 hover:border-pw-accent/50 hover:bg-pw-surface-3 transition-colors text-left"
                style={{ borderLeft: `3px solid ${projectColor(t)}` }}
              >
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-pw-text-muted truncate">{clientLabel(t)}</p>
                  <p className="text-sm text-pw-text font-medium truncate">{t.title}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-pw-text-muted">
                  <Clock size={11} />
                  {t.estimated_hours ? `${t.estimated_hours}h` : '30m'}
                </span>
              </button>
            ))}
          </div>

          {/* Attività manuale (testo libero, senza task) */}
          <div className="pt-3 border-t border-pw-border space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-pw-text-dim">Oppure attività manuale</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Es. Riunione, formazione, pausa attiva…"
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="Ore"
                />
              </div>
              <button
                type="button"
                onClick={assignManual}
                disabled={!manualText.trim()}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-pw-accent text-[#0A263A] hover:bg-pw-accent-hover disabled:opacity-40 transition-colors shrink-0"
              >
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
