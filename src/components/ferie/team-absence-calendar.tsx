'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { getInitials } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import type { TeamAbsence } from '@/types/database';
import { ChevronLeft, ChevronRight, Plane, Clock, Stethoscope } from 'lucide-react';

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const TYPE_ICON = { ferie: Plane, permesso: Clock, malattia: Stethoscope } as const;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TeamAbsenceCalendar() {
  const supabase = createClient();
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);

  const monthStart = useMemo(() => new Date(view.getFullYear(), view.getMonth(), 1), [view]);
  const monthEnd = useMemo(() => new Date(view.getFullYear(), view.getMonth() + 1, 0), [view]);

  const fetchAbsences = useCallback(async () => {
    const { data } = await supabase.rpc('get_team_absences', { p_from: ymd(monthStart), p_to: ymd(monthEnd) });
    setAbsences((data as TeamAbsence[]) || []);
  }, [supabase, monthStart, monthEnd]);

  useEffect(() => { fetchAbsences(); }, [fetchAbsences]);

  // Griglia: parte dal lunedì della settimana che contiene il giorno 1
  const cells = useMemo(() => {
    const firstDow = (monthStart.getDay() + 6) % 7; // 0 = lunedì
    const start = new Date(monthStart);
    start.setDate(1 - firstDow);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    // Taglia l'ultima settimana se completamente fuori mese
    return days.slice(0, days[35].getMonth() === monthStart.getMonth() || days.slice(35, 42).some((d) => d.getMonth() === monthStart.getMonth()) ? 42 : 35);
  }, [monthStart]);

  // Mappa giorno → assenze
  const byDay = useMemo(() => {
    const map: Record<string, TeamAbsence[]> = {};
    for (const a of absences) {
      // marca ogni giorno da start a end
      let d = new Date(a.start_date + 'T00:00:00');
      const end = new Date(a.end_date + 'T00:00:00');
      while (d <= end) {
        const k = ymd(d);
        (map[k] ||= []).push(a);
        d = new Date(d);
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [absences]);

  const todayKey = ymd(today);
  const monthLabel = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
  const shiftMonth = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-pw-text capitalize">{monthLabel}</h3>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text transition-colors" aria-label="Mese precedente"><ChevronLeft size={16} /></button>
            <button onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))} className="px-2.5 py-1 rounded-lg text-xs font-medium text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text transition-colors">Oggi</button>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text transition-colors" aria-label="Mese successivo"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] uppercase tracking-wide font-semibold text-pw-text-dim py-1">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === monthStart.getMonth();
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            const dayAbs = byDay[key] || [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={[
                  'min-h-[74px] rounded-lg border p-1 flex flex-col gap-0.5',
                  inMonth ? 'bg-pw-surface border-pw-border' : 'bg-pw-surface-2/40 border-transparent',
                  weekend && inMonth ? 'bg-pw-surface-2/60' : '',
                ].join(' ')}
              >
                <span className={[
                  'text-[11px] font-medium leading-none px-1 pt-0.5',
                  isToday ? 'text-pw-accent font-bold' : inMonth ? 'text-pw-text-muted' : 'text-pw-text-dim',
                ].join(' ')}>{d.getDate()}</span>
                <div className="flex flex-col gap-0.5">
                  {dayAbs.map((a) => {
                    const Icon = TYPE_ICON[a.type];
                    return (
                      <div
                        key={a.request_id}
                        title={`${a.full_name} · ${TIME_OFF_TYPE_LABELS[a.type]}`}
                        className="flex items-center gap-1 rounded px-1 py-0.5 min-w-0"
                        style={{ backgroundColor: (a.color || '#0A263A') + '22' }}
                      >
                        <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ backgroundColor: a.color || '#0A263A' }}>
                          {getInitials(a.full_name)}
                        </span>
                        <span className="text-[10px] text-pw-text truncate hidden sm:inline">{a.full_name.split(' ')[0]}</span>
                        <Icon size={9} className="text-pw-text-dim shrink-0 ml-auto" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 text-[11px] text-pw-text-dim">
          <span className="flex items-center gap-1"><Plane size={11} /> Ferie</span>
          <span className="flex items-center gap-1"><Clock size={11} /> Permesso</span>
          <span className="flex items-center gap-1"><Stethoscope size={11} /> Malattia</span>
        </div>
      </CardContent>
    </Card>
  );
}
