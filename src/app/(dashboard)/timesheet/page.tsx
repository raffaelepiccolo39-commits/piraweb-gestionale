'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonRow } from '@/components/ui/skeleton';
import { getInitials, getUserColor, formatCurrency, formatDateLocal } from '@/lib/utils';
import type { Profile, TimeEntry } from '@/types/database';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DayHours {
  date: string;
  dayLabel: string;
  hours: number;
}

interface MemberWeek {
  profile: Profile;
  days: DayHours[];
  totalHours: number;
  taskCount: number;
}

function getWeekDates(weekOffset: number): { start: Date; end: Date; dates: Date[] } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }

  const end = new Date(dates[6]);
  end.setHours(23, 59, 59, 999);

  return { start: monday, end, dates };
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Ore di presenza da una timbratura: usa total_hours se valorizzato, altrimenti
// calcola da clock_in→clock_out meno la pausa pranzo.
function presenceHoursOf(r: {
  clock_in: string | null; clock_out: string | null;
  lunch_start: string | null; lunch_end: string | null; total_hours: number | null;
}): number {
  if (r.total_hours && Number(r.total_hours) > 0) return Number(r.total_hours);
  if (!r.clock_in || !r.clock_out) return 0;
  let ms = new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime();
  if (r.lunch_start && r.lunch_end) ms -= new Date(r.lunch_end).getTime() - new Date(r.lunch_start).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

// Tabella ore settimanale riusabile (task oppure presenza).
function HoursTable({ rows, weekDates, variant }: { rows: MemberWeek[]; weekDates: Date[]; variant: 'task' | 'presence' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-pw-border">
            <th className="text-left px-4 py-3 text-xs font-medium text-pw-text-muted sticky left-0 bg-pw-surface z-10 min-w-[180px]">Membro</th>
            {weekDates.map((date, i) => {
              const isWeekend = i >= 5;
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <th key={i} className={`text-center px-3 py-3 text-xs font-medium min-w-[80px] ${isToday ? 'text-pw-accent bg-pw-accent/5' : isWeekend ? 'text-pw-text-dim' : 'text-pw-text-muted'}`}>
                  <div>{DAY_LABELS[i]}</div>
                  <div className="text-[10px]">{date.getDate()}/{date.getMonth() + 1}</div>
                </th>
              );
            })}
            <th className="text-center px-4 py-3 text-xs font-semibold text-pw-text min-w-[80px]">Totale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((member) => (
            <tr key={member.profile.id} className="border-b border-pw-border/50 row-hover">
              <td className="px-4 py-3 sticky left-0 bg-pw-surface z-10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: getUserColor(member.profile) }}>
                    <span className="text-white text-[9px] font-bold">{getInitials(member.profile.full_name)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-pw-text">{member.profile.full_name}</p>
                    {variant === 'task' && <p className="text-[10px] text-pw-text-dim">{member.taskCount} task</p>}
                  </div>
                </div>
              </td>
              {member.days.map((day, i) => {
                const isWeekend = i >= 5;
                return (
                  <td key={day.date} className={`text-center px-3 py-3 ${isWeekend ? 'bg-pw-surface/50' : ''}`}>
                    {day.hours > 0 ? (
                      <span className={`font-medium ${day.hours >= 8 ? 'text-green-400' : day.hours >= 4 ? 'text-pw-text' : 'text-pw-text-muted'}`}>{day.hours.toFixed(1)}</span>
                    ) : (
                      <span className="text-pw-text-dim">—</span>
                    )}
                  </td>
                );
              })}
              <td className="text-center px-4 py-3">
                <span className={`font-bold ${member.totalHours >= 35 ? 'text-green-400' : member.totalHours >= 20 ? 'text-pw-text' : member.totalHours > 0 ? 'text-orange-400' : 'text-pw-text-dim'}`}>{member.totalHours.toFixed(1)}h</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center py-8 text-pw-text-dim text-sm">
                {variant === 'task' ? 'Nessuna registrazione ore per questa settimana' : 'Nessuna presenza registrata per questa settimana'}
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-pw-border bg-pw-surface-2/30">
              <td className="px-4 py-3 text-xs font-semibold text-pw-text sticky left-0 bg-pw-surface-2/30 z-10">TOTALE</td>
              {weekDates.map((_, i) => {
                const dayTotal = rows.reduce((sum, m) => sum + m.days[i].hours, 0);
                return <td key={i} className="text-center px-3 py-3 text-xs font-semibold text-pw-text">{dayTotal > 0 ? dayTotal.toFixed(1) : '—'}</td>;
              })}
              <td className="text-center px-4 py-3 text-sm font-bold text-pw-accent">{rows.reduce((sum, m) => sum + m.totalHours, 0).toFixed(1)}h</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function TimesheetPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [members, setMembers] = useState<MemberWeek[]>([]);
  const [presence, setPresence] = useState<MemberWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState('');
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  const isAdmin = profile?.role === 'admin';
  const week = getWeekDates(weekOffset);

  const fetchTimesheet = useCallback(async () => {
    setLoading(true);

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('full_name');
    setAllProfiles((profiles as Profile[]) || []);

    // Fetch time entries for the week
    const { data: entries } = await supabase
      .from('time_entries')
      .select('*, user:profiles!time_entries_user_id_fkey(id, full_name, role, color)')
      .gte('started_at', week.start.toISOString())
      .lte('started_at', week.end.toISOString())
      .not('duration_minutes', 'is', null);

    // Group by user
    const userMap = new Map<string, { profile: Profile; entries: TimeEntry[] }>();

    ((entries as TimeEntry[]) || []).forEach((entry) => {
      const userId = entry.user_id;
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          profile: entry.user as Profile,
          entries: [],
        });
      }
      userMap.get(userId)!.entries.push(entry);
    });

    // Also add profiles with 0 hours if admin
    if (isAdmin) {
      (profiles as Profile[] || []).forEach((p) => {
        if (!userMap.has(p.id)) {
          userMap.set(p.id, { profile: p, entries: [] });
        }
      });
    }

    // Build week data
    const memberWeeks: MemberWeek[] = Array.from(userMap.values()).map(({ profile: memberProfile, entries: memberEntries }) => {
      const days: DayHours[] = week.dates.map((date, i) => {
        const dateStr = formatDateLocal(date);
        // Confronto LOCALE: e.started_at è UTC, una sessione iniziata alle 23:30
        // locali è "domani" in UTC e startsWith(dateStr) sbaglierebbe giorno.
        const dayEntries = memberEntries.filter((e) => formatDateLocal(new Date(e.started_at)) === dateStr);
        const hours = dayEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) / 60;
        return {
          date: dateStr,
          dayLabel: DAY_LABELS[i],
          hours,
        };
      });

      const taskIds = new Set(memberEntries.map((e) => e.task_id));

      return {
        profile: memberProfile,
        days,
        totalHours: days.reduce((sum, d) => sum + d.hours, 0),
        taskCount: taskIds.size,
      };
    });

    // Sort by total hours descending
    memberWeeks.sort((a, b) => b.totalHours - a.totalHours);

    setMembers(memberWeeks);

    // ---- Presenza (entrata/uscita) per la stessa settimana ----
    const startDateStr = formatDateLocal(week.dates[0]);
    const endDateStr = formatDateLocal(week.dates[6]);
    const { data: attendance } = await supabase
      .from('attendance_records')
      .select('user_id, date, clock_in, lunch_start, lunch_end, clock_out, total_hours')
      .gte('date', startDateStr)
      .lte('date', endDateStr);

    // userId → (dateStr → ore)
    const attByUser = new Map<string, Map<string, number>>();
    ((attendance as Array<{ user_id: string; date: string; clock_in: string | null; clock_out: string | null; lunch_start: string | null; lunch_end: string | null; total_hours: number | null }>) || []).forEach((r) => {
      if (!attByUser.has(r.user_id)) attByUser.set(r.user_id, new Map());
      attByUser.get(r.user_id)!.set(r.date, presenceHoursOf(r));
    });

    // Righe: chi ha timbrature + (admin → tutti gli attivi, altrimenti sé stesso)
    const presenceUserIds = new Set<string>(attByUser.keys());
    if (isAdmin) (profiles as Profile[] || []).forEach((p) => presenceUserIds.add(p.id));
    else if (profile) presenceUserIds.add(profile.id);

    const profileById = new Map((profiles as Profile[] || []).map((p) => [p.id, p]));
    const presenceWeeks: MemberWeek[] = Array.from(presenceUserIds)
      .map((uid) => {
        const p = profileById.get(uid);
        if (!p) return null;
        const dayMap = attByUser.get(uid) || new Map<string, number>();
        const days: DayHours[] = week.dates.map((date, i) => {
          const dateStr = formatDateLocal(date);
          return { date: dateStr, dayLabel: DAY_LABELS[i], hours: dayMap.get(dateStr) || 0 };
        });
        return { profile: p, days, totalHours: days.reduce((s, d) => s + d.hours, 0), taskCount: 0 };
      })
      .filter((m): m is MemberWeek => m !== null);
    presenceWeeks.sort((a, b) => b.totalHours - a.totalHours);
    setPresence(presenceWeeks);

    setLoading(false);
  }, [supabase, week.start.toISOString(), week.end.toISOString(), isAdmin, profile]);

  useEffect(() => {
    fetchTimesheet();
  }, [fetchTimesheet]);

  const filteredMembers = filterMember
    ? members.filter((m) => m.profile.id === filterMember)
    : members;

  const filteredPresence = filterMember
    ? presence.filter((m) => m.profile.id === filterMember)
    : presence;

  const teamTotalHours = members.reduce((sum, m) => sum + m.totalHours, 0);
  const avgHoursPerMember = members.length > 0 ? teamTotalHours / members.filter((m) => m.totalHours > 0).length || 0 : 0;

  const weekLabel = `${week.dates[0].toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} - ${week.dates[6].toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Timesheet"
        subtitle={`${weekLabel} · Ore lavorate per membro del team`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Settimana precedente"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekOffset((w) => w + 1)}
              disabled={weekOffset >= 0}
              aria-label="Settimana successiva"
            >
              <ChevronRight size={14} />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="soft" size="sm" onClick={() => setWeekOffset(0)}>
                Oggi
              </Button>
            )}
          </>
        }
      />

      {/* Filter */}
      {isAdmin && (
        <div className="flex items-center justify-end">
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-pw-border bg-pw-surface text-pw-text text-xs"
          >
            <option value="">Tutto il team</option>
            {allProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Summary cards */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{teamTotalHours.toFixed(1)}h</p>
              <p className="text-xs text-pw-text-muted">Ore totali team</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{avgHoursPerMember.toFixed(1)}h</p>
              <p className="text-xs text-pw-text-muted">Media per membro</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{members.filter((m) => m.totalHours > 0).length}</p>
              <p className="text-xs text-pw-text-muted">Membri attivi</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">
                {members.reduce((sum, m) => sum + m.taskCount, 0)}
              </p>
              <p className="text-xs text-pw-text-muted">Task lavorate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ore registrate sui task */}
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-pw-text">Ore sui task</h2>
        <span className="text-xs text-pw-text-dim">timer e ore registrate sui task</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-1 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pw-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-pw-text-muted sticky left-0 bg-pw-surface z-10 min-w-[180px]">
                      Membro
                    </th>
                    {week.dates.map((date, i) => {
                      const isWeekend = i >= 5;
                      const isToday = date.toDateString() === new Date().toDateString();
                      return (
                        <th
                          key={i}
                          className={`text-center px-3 py-3 text-xs font-medium min-w-[80px] ${
                            isToday ? 'text-pw-accent bg-pw-accent/5' : isWeekend ? 'text-pw-text-dim' : 'text-pw-text-muted'
                          }`}
                        >
                          <div>{DAY_LABELS[i]}</div>
                          <div className="text-[10px]">{date.getDate()}/{date.getMonth() + 1}</div>
                        </th>
                      );
                    })}
                    <th className="text-center px-4 py-3 text-xs font-semibold text-pw-text min-w-[80px]">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr key={member.profile.id} className="border-b border-pw-border/50 row-hover">
                      <td className="px-4 py-3 sticky left-0 bg-pw-surface z-10">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: getUserColor(member.profile) }}
                          >
                            <span className="text-white text-[9px] font-bold">
                              {getInitials(member.profile.full_name)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-pw-text">{member.profile.full_name}</p>
                            <p className="text-[10px] text-pw-text-dim">{member.taskCount} task</p>
                          </div>
                        </div>
                      </td>
                      {member.days.map((day, i) => {
                        const isWeekend = i >= 5;
                        return (
                          <td
                            key={day.date}
                            className={`text-center px-3 py-3 ${isWeekend ? 'bg-pw-surface/50' : ''}`}
                          >
                            {day.hours > 0 ? (
                              <span className={`font-medium ${
                                day.hours >= 8 ? 'text-green-400' :
                                day.hours >= 4 ? 'text-pw-text' :
                                'text-pw-text-muted'
                              }`}>
                                {day.hours.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-pw-text-dim">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center px-4 py-3">
                        <span className={`font-bold ${
                          member.totalHours >= 35 ? 'text-green-400' :
                          member.totalHours >= 20 ? 'text-pw-text' :
                          member.totalHours > 0 ? 'text-orange-400' :
                          'text-pw-text-dim'
                        }`}>
                          {member.totalHours.toFixed(1)}h
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-pw-text-dim text-sm">
                        Nessuna registrazione ore per questa settimana
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Footer totals */}
                {filteredMembers.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-pw-border bg-pw-surface-2/30">
                      <td className="px-4 py-3 text-xs font-semibold text-pw-text sticky left-0 bg-pw-surface-2/30 z-10">
                        TOTALE
                      </td>
                      {week.dates.map((_, i) => {
                        const dayTotal = filteredMembers.reduce((sum, m) => sum + m.days[i].hours, 0);
                        return (
                          <td key={i} className="text-center px-3 py-3 text-xs font-semibold text-pw-text">
                            {dayTotal > 0 ? dayTotal.toFixed(1) : '—'}
                          </td>
                        );
                      })}
                      <td className="text-center px-4 py-3 text-sm font-bold text-pw-accent">
                        {filteredMembers.reduce((sum, m) => sum + m.totalHours, 0).toFixed(1)}h
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Presenza (entrata/uscita) */}
      <div className="flex items-center gap-2 mt-6 mb-2">
        <h2 className="text-sm font-semibold text-pw-text">Presenza · entrata/uscita</h2>
        <span className="text-xs text-pw-text-dim">ore calcolate dalle timbrature (al netto della pausa)</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-1 py-2">
              {Array.from({ length: 4 }).map((_, i) => (<SkeletonRow key={i} />))}
            </div>
          ) : (
            <HoursTable rows={filteredPresence} weekDates={week.dates} variant="presence" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
