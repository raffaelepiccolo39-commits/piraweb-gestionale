'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateLocal, getInitials, getUserColor } from '@/lib/utils';
import { SHIFT_TYPE_LABELS, SHIFT_TYPE_COLOR } from '@/lib/constants';
import type { Shift, ShiftType } from '@/types/database';
import { ChevronLeft, ChevronRight, Plus, Calendar, AlertTriangle, Trash2, Clock, MapPin, Pencil } from 'lucide-react';
import { reportUnknown } from '@/lib/report-error';

const DAY_LABELS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // 0 = Lunedì
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function rangeLabel(start: Date): string {
  const end = addDays(start, 6);
  return `${start.getDate()} ${start.toLocaleString('it-IT', { month: 'short' })} – ${end.getDate()} ${end.toLocaleString('it-IT', { month: 'short' })} ${end.getFullYear()}`;
}
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default function TurniPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; color: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Modal create/edit
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [form, setForm] = useState({
    user_id: '',
    shift_date: formatDateLocal(new Date()),
    start_time: '09:00',
    end_time: '18:00',
    type: 'presidio' as ShiftType,
    location: '',
    notes: '',
  });
  const submittingRef = useRef(false);

  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = formatDateLocal(weekStart);
  const weekEndStr = formatDateLocal(addDays(weekStart, 6));

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setError(false);
    try {
      const [shRes, empRes] = await Promise.all([
        supabase.from('shifts')
          .select('*, user:profiles!shifts_user_id_fkey(id, full_name, color)')
          .gte('shift_date', weekStartStr)
          .lte('shift_date', weekEndStr)
          .order('shift_date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase.from('profiles').select('id, full_name, color').eq('is_active', true).order('full_name'),
      ]);
      if (shRes.error) throw shRes.error;
      setShifts((shRes.data as Shift[]) || []);
      setEmployees((empRes.data as { id: string; full_name: string; color: string | null }[]) || []);
    } catch (err) {
      reportUnknown(err, 'client', { op: 'turni-fetch' });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, weekStartStr, weekEndStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const d of weekDays) map.set(formatDateLocal(d), []);
    for (const s of shifts) {
      const list = map.get(s.shift_date);
      if (list) list.push(s);
    }
    return map;
  }, [shifts, weekDays]);

  const openCreate = (date?: Date) => {
    setEditingShift(null);
    setForm({
      user_id: profile?.id || '',
      shift_date: formatDateLocal(date || new Date()),
      start_time: '09:00',
      end_time: '18:00',
      type: 'presidio',
      location: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEdit = (s: Shift) => {
    setEditingShift(s);
    setForm({
      user_id: s.user_id,
      shift_date: s.shift_date,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      type: s.type,
      location: s.location || '',
      notes: s.notes || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!profile || submittingRef.current) return;
    if (!form.user_id) { toast.error('Seleziona un dipendente'); return; }
    if (form.end_time <= form.start_time) { toast.error('L\'orario di fine deve essere dopo l\'inizio'); return; }
    submittingRef.current = true;
    try {
      const payload = {
        user_id: form.user_id,
        shift_date: form.shift_date,
        start_time: form.start_time,
        end_time: form.end_time,
        type: form.type,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingShift) {
        const { error } = await supabase.from('shifts').update(payload).eq('id', editingShift.id);
        if (error) throw error;
        toast.success('Turno aggiornato');
      } else {
        const { error } = await supabase.from('shifts').insert({ ...payload, created_by: profile.id });
        if (error) throw error;
        toast.success('Turno creato');
      }
      setShowModal(false);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { op: 'turni-salva' });
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (!editingShift) return;
    if (!confirm('Eliminare questo turno?')) return;
    try {
      const { error } = await supabase.from('shifts').delete().eq('id', editingShift.id);
      if (error) throw error;
      toast.success('Turno eliminato');
      setShowModal(false);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { op: 'turni-elimina' });
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  if (loading) {
    return <div className="space-y-6 animate-slide-up"><SkeletonList variant="card" count={7} /></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <button onClick={() => { setLoading(true); setError(false); fetchData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  const todayStr = formatDateLocal(new Date());

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Turni"
        subtitle={rangeLabel(weekStart)}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Settimana precedente"><ChevronLeft size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Oggi</Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Settimana successiva"><ChevronRight size={14} /></Button>
            {isAdmin && (
              <Button variant="primary" onClick={() => openCreate()}>
                <Plus size={14} /> Nuovo turno
              </Button>
            )}
          </>
        }
      />

      {shifts.length === 0 && !isAdmin ? (
        <EmptyState
          icon={Calendar}
          title="Nessun turno in settimana"
          description="L'amministrazione non ha ancora pianificato turni per questa settimana."
        />
      ) : (
        <div className="grid gap-3">
          {weekDays.map((d, i) => {
            const ds = formatDateLocal(d);
            const dayShifts = shiftsByDay.get(ds) || [];
            const isToday = ds === todayStr;
            return (
              <Card key={ds} className={isToday ? 'border-pw-accent/40' : undefined}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isToday ? 'text-pw-accent' : 'text-pw-text'}`}>
                        {DAY_LABELS[i]}
                      </span>
                      <span className="text-xs text-pw-text-muted">{d.getDate()} {d.toLocaleString('it-IT', { month: 'short' })}</span>
                      {isToday && <span className="text-[10px] uppercase tracking-wider text-pw-accent font-bold">Oggi</span>}
                    </div>
                    {isAdmin && (
                      <button onClick={() => openCreate(d)} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-accent" title="Aggiungi turno">
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                  {dayShifts.length === 0 ? (
                    <p className="text-xs text-pw-text-dim italic">Nessun turno</p>
                  ) : (
                    <div className="space-y-2">
                      {dayShifts.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => isAdmin && openEdit(s)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border bg-pw-surface text-left transition-colors ${isAdmin ? 'hover:bg-pw-surface-2 cursor-pointer' : 'cursor-default'}`}
                          style={{ borderLeftWidth: '3px', borderLeftColor: SHIFT_TYPE_COLOR[s.type] }}
                        >
                          <span
                            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ background: `linear-gradient(135deg, #E0431A, ${s.user?.color || getUserColor(null)})` }}
                          >
                            {s.user?.full_name ? getInitials(s.user.full_name) : '?'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-pw-text truncate">{s.user?.full_name || 'Dipendente'}</span>
                              <span className="text-xs text-pw-text-muted flex items-center gap-1"><Clock size={11} /> {hhmm(s.start_time)} – {hhmm(s.end_time)}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: SHIFT_TYPE_COLOR[s.type] }}>
                                {SHIFT_TYPE_LABELS[s.type]}
                              </span>
                              {s.location && <span className="text-xs text-pw-text-muted flex items-center gap-1"><MapPin size={11} /> {s.location}</span>}
                            </div>
                            {s.notes && <p className="text-xs text-pw-text-dim mt-0.5 truncate">{s.notes}</p>}
                          </div>
                          {isAdmin && <Pencil size={12} className="text-pw-text-dim shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal create/edit */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingShift ? 'Modifica turno' : 'Nuovo turno'} size="sm">
        <div className="space-y-4">
          <Select
            id="sh-user"
            label="Dipendente"
            value={form.user_id}
            onChange={(e) => setForm(f => ({ ...f, user_id: e.target.value }))}
            options={employees.map(e => ({ value: e.id, label: e.full_name }))}
            placeholder="Seleziona"
          />
          <Input
            id="sh-date"
            type="date"
            label="Data"
            value={form.shift_date}
            onChange={(e) => setForm(f => ({ ...f, shift_date: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input id="sh-start" type="time" label="Inizio" value={form.start_time} onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))} />
            <Input id="sh-end" type="time" label="Fine" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
          <Select
            id="sh-type"
            label="Tipo"
            value={form.type}
            onChange={(e) => setForm(f => ({ ...f, type: e.target.value as ShiftType }))}
            options={Object.entries(SHIFT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Input id="sh-loc" label="Luogo (opzionale)" value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="es. Sede Cliente Rossi" />
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Note (opzionale)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            {editingShift && (
              <Button variant="danger" onClick={handleDelete}>
                <Trash2 size={14} /> Elimina
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSubmit} className="flex-1">
              {editingShift ? 'Salva' : 'Crea turno'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
