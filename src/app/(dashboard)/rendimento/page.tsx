'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameDay, isSameMonth,
} from 'date-fns';
import { it } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { getInitials, getUserColor, getContrastTextColor } from '@/lib/utils';
import { reportSupabaseError } from '@/lib/report-error';
import { RendimentoCalendar, type DayStat } from '@/components/rendimento/rendimento-calendar';
import { ShieldCheck, ChevronLeft, ChevronRight, CheckCircle2, Clock, CalendarDays } from 'lucide-react';

/**
 * Rendimento — solo admin.
 *
 * Calendario del lavoro fatto: per ogni giorno quante task sono state chiuse e
 * quante ore ha registrato il team. Clic su un giorno → dettaglio per persona.
 * La data di completamento arriva da tasks.completed_at (trigger), le ore dai
 * time_entries. Serve a leggere a colpo d'occhio il ritmo del team.
 */

interface DoneTask {
  id: string;
  title: string;
  completed_at: string | null;
  assigned_to: string | null;
  project: { name: string; color: string | null } | null;
}

interface Entry {
  duration_minutes: number;
  started_at: string;
  user_id: string;
}

interface Person {
  id: string;
  full_name: string;
  color: string | null;
}

/** La data LOCALE (Italia, browser) di un timestamp: raggruppa per giornata vera. */
function localDay(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd');
}

function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return `${h.toFixed(1).replace(/\.0$/, '').replace('.', ',')}h`;
}

export default function RendimentoPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const isAdmin = profile?.role === 'admin';

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPerson, setSelectedPerson] = useState(''); // '' = tutti
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<DoneTask[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());

  const fetchMonth = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);

    // Copre l'intera griglia visibile (6 settimane) con un giorno di margine per
    // gli scarti di fuso: raggruppiamo poi per data locale lato client.
    const calStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const calEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const from = format(addDays(calStart, -1), 'yyyy-MM-dd');
    const to = format(addDays(calEnd, 2), 'yyyy-MM-dd');

    const [tasksRes, entriesRes, peopleRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, completed_at, assigned_to, project:projects(name, color)')
        .gte('completed_at', from)
        .lt('completed_at', to)
        .order('completed_at', { ascending: false }),
      supabase
        .from('time_entries')
        .select('duration_minutes, started_at, user_id')
        .gte('started_at', from)
        .lt('started_at', to),
      supabase.from('profiles').select('id, full_name, color'),
    ]);

    if (tasksRes.error) reportSupabaseError(tasksRes.error, 'rendimento-tasks');
    if (entriesRes.error) reportSupabaseError(entriesRes.error, 'rendimento-entries');
    if (peopleRes.error) reportSupabaseError(peopleRes.error, 'rendimento-people');

    setTasks((tasksRes.data as unknown as DoneTask[]) ?? []);
    setEntries((entriesRes.data as Entry[]) ?? []);
    const map = new Map<string, Person>();
    for (const p of (peopleRes.data as Person[]) ?? []) map.set(p.id, p);
    setPeople(map);
    setLoading(false);
  }, [supabase, isAdmin, currentMonth]);

  useEffect(() => {
    void fetchMonth();
  }, [fetchMonth]);

  // Statistiche per giorno per la griglia del calendario (filtrate sul
  // collaboratore selezionato, se presente).
  const stats = useMemo(() => {
    const m = new Map<string, DayStat>();
    for (const t of tasks) {
      if (!t.completed_at) continue;
      if (selectedPerson && t.assigned_to !== selectedPerson) continue;
      const k = localDay(t.completed_at);
      const s = m.get(k) ?? { tasks: 0, minutes: 0 };
      s.tasks += 1;
      m.set(k, s);
    }
    for (const e of entries) {
      if (selectedPerson && e.user_id !== selectedPerson) continue;
      const k = localDay(e.started_at);
      const s = m.get(k) ?? { tasks: 0, minutes: 0 };
      s.minutes += e.duration_minutes || 0;
      m.set(k, s);
    }
    return m;
  }, [tasks, entries, selectedPerson]);

  // Totali del mese corrente (solo i giorni del mese, non gli scarti di griglia),
  // anch'essi filtrati sul collaboratore selezionato.
  const monthTotals = useMemo(() => {
    let t = 0, min = 0;
    for (const task of tasks) {
      if (selectedPerson && task.assigned_to !== selectedPerson) continue;
      if (task.completed_at && isSameMonth(new Date(task.completed_at), currentMonth)) t += 1;
    }
    for (const e of entries) {
      if (selectedPerson && e.user_id !== selectedPerson) continue;
      if (isSameMonth(new Date(e.started_at), currentMonth)) min += e.duration_minutes || 0;
    }
    return { tasks: t, minutes: min };
  }, [tasks, entries, currentMonth, selectedPerson]);

  // Dettaglio del giorno selezionato, aggregato per persona.
  const dayDetail = useMemo(() => {
    if (!selectedDate) return null;
    const key = format(selectedDate, 'yyyy-MM-dd');

    const dayTasks = tasks.filter((t) => t.completed_at && localDay(t.completed_at) === key);
    const dayEntries = entries.filter((e) => localDay(e.started_at) === key);

    const perPerson = new Map<string, { tasks: number; minutes: number }>();
    for (const t of dayTasks) {
      const id = t.assigned_to ?? 'unassigned';
      const r = perPerson.get(id) ?? { tasks: 0, minutes: 0 };
      r.tasks += 1;
      perPerson.set(id, r);
    }
    for (const e of dayEntries) {
      const r = perPerson.get(e.user_id) ?? { tasks: 0, minutes: 0 };
      r.minutes += e.duration_minutes || 0;
      perPerson.set(e.user_id, r);
    }

    const rows = [...perPerson.entries()]
      .map(([id, r]) => ({ id, person: people.get(id) ?? null, ...r }))
      .sort((a, b) => b.tasks - a.tasks || b.minutes - a.minutes);

    return {
      tasks: dayTasks,
      totalMinutes: dayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0),
      rows,
    };
  }, [selectedDate, tasks, entries, people]);

  // Opzioni del menu a tendina: tutti i collaboratori in ordine alfabetico.
  const peopleOptions = useMemo(() => {
    const arr = [...people.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
    return [{ value: '', label: 'Tutti i collaboratori' }, ...arr.map((p) => ({ value: p.id, label: p.full_name }))];
  }, [people]);

  // Tutte le task chiuse dal collaboratore selezionato nel mese corrente.
  const personDetail = useMemo(() => {
    if (!selectedPerson) return null;
    const list = tasks
      .filter((t) => t.assigned_to === selectedPerson && t.completed_at && isSameMonth(new Date(t.completed_at), currentMonth))
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    const minutes = entries
      .filter((e) => e.user_id === selectedPerson && isSameMonth(new Date(e.started_at), currentMonth))
      .reduce((s, e) => s + (e.duration_minutes || 0), 0);
    return { list, minutes };
  }, [selectedPerson, tasks, entries, currentMonth]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Area riservata"
        description="Il rendimento del team è visibile solo agli amministratori."
      />
    );
  }

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: it });

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        eyebrow="Team"
        title="Rendimento"
        subtitle="Task completate e ore registrate, giorno per giorno"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              options={peopleOptions}
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="h-9 min-w-[11rem]"
              aria-label="Filtra per collaboratore"
            />
            <label className="relative inline-flex items-center">
              <CalendarDays size={15} className="absolute left-2.5 text-pw-text-dim pointer-events-none" />
              <input
                type="date"
                value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => {
                  if (!e.target.value) { setSelectedDate(null); return; }
                  const d = new Date(`${e.target.value}T12:00:00`);
                  setSelectedDate(d);
                  setCurrentMonth(startOfMonth(d));
                }}
                className="h-9 rounded-lg border border-pw-border bg-pw-surface pl-8 pr-2 text-sm text-pw-text"
                aria-label="Vai a un giorno"
              />
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-pw-border bg-pw-surface hover:bg-pw-surface-2"
                aria-label="Mese precedente"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[9.5rem] text-center text-sm font-semibold text-pw-text capitalize">
                {monthLabel}
              </span>
              <button
                onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-pw-border bg-pw-surface hover:bg-pw-surface-2"
                aria-label="Mese successivo"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        }
      />

      {/* Riepilogo mese */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pw-success/10">
              <CheckCircle2 className="h-5 w-5 text-pw-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-pw-text leading-none">{monthTotals.tasks}</p>
              <p className="mt-1 text-xs text-pw-text-dim">task completate nel mese</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pw-accent/10">
              <Clock className="h-5 w-5 text-pw-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-pw-text leading-none">{fmtHours(monthTotals.minutes)}</p>
              <p className="mt-1 text-xs text-pw-text-dim">ore registrate nel mese</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Calendario */}
        <Card>
          <CardContent>
            {loading ? (
              <SkeletonList />
            ) : (
              <RendimentoCalendar
                currentMonth={currentMonth}
                stats={stats}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            )}
          </CardContent>
        </Card>

        {/* Dettaglio: task del collaboratore, oppure dettaglio del giorno */}
        <Card>
          <CardContent>
            {selectedPerson ? (
              <div>
                <h3 className="text-sm font-semibold text-pw-text">
                  {people.get(selectedPerson)?.full_name ?? 'Collaboratore'}
                </h3>
                <div className="mt-1 flex gap-4 text-xs text-pw-text-dim capitalize">
                  <span>{personDetail?.list.length ?? 0} task · {monthLabel}</span>
                  <span className="normal-case">{fmtHours(personDetail?.minutes ?? 0)} registrate</span>
                </div>

                {personDetail && personDetail.list.length > 0 ? (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wider text-pw-text-dim">Task completate</p>
                    {personDetail.list.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-sm">
                        <span className="w-11 shrink-0 text-[11px] tabular-nums text-pw-text-dim">
                          {t.completed_at ? format(new Date(t.completed_at), 'd MMM', { locale: it }) : ''}
                        </span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: t.project?.color || 'var(--pw-accent)' }}
                        />
                        <span className="flex-1 truncate text-pw-text">{t.title}</span>
                        {t.project?.name && (
                          <span className="shrink-0 truncate text-xs text-pw-text-dim">{t.project.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-pw-text-dim">Nessuna task completata in {monthLabel}.</p>
                )}
              </div>
            ) : !selectedDate ? (
              <EmptyState
                icon={CalendarDays}
                title="Scegli un giorno o un collaboratore"
                description="Clicca una casella del calendario per il dettaglio del giorno, oppure scegli un collaboratore in alto per vedere tutte le sue task del mese."
              />
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-pw-text capitalize">
                  {format(selectedDate, 'EEEE d MMMM', { locale: it })}
                </h3>
                <div className="mt-1 flex gap-4 text-xs text-pw-text-dim">
                  <span>{dayDetail?.tasks.length ?? 0} task completate</span>
                  <span>{fmtHours(dayDetail?.totalMinutes ?? 0)} registrate</span>
                </div>

                {/* Per persona */}
                {dayDetail && dayDetail.rows.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-pw-text-dim">Per persona</p>
                    {dayDetail.rows.map((row) => {
                      const name = row.person?.full_name ?? 'Non assegnata';
                      const bg = getUserColor(row.person);
                      return (
                        <div key={row.id} className="flex items-center gap-3">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                            style={{ backgroundColor: bg, color: getContrastTextColor(bg) }}
                          >
                            {getInitials(name)}
                          </span>
                          <span className="flex-1 truncate text-sm text-pw-text">{name}</span>
                          <span className="text-xs text-pw-text-muted tabular-nums">
                            {row.tasks > 0 && <span className="text-pw-success">{row.tasks} task</span>}
                            {row.tasks > 0 && row.minutes > 0 && ' · '}
                            {row.minutes > 0 && <span>{fmtHours(row.minutes)}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-pw-text-dim">Nessuna attività registrata questo giorno.</p>
                )}

                {/* Task del giorno */}
                {dayDetail && dayDetail.tasks.length > 0 && (
                  <div className="mt-5 space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wider text-pw-text-dim">Task chiuse</p>
                    {dayDetail.tasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: t.project?.color || 'var(--pw-accent)' }}
                        />
                        <span className="flex-1 truncate text-pw-text">{t.title}</span>
                        {t.project?.name && (
                          <span className="shrink-0 truncate text-xs text-pw-text-dim">{t.project.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
