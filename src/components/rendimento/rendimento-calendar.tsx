'use client';

import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, isToday, isFuture } from 'date-fns';
import { cn } from '@/lib/utils';

export interface DayStat {
  /** Task passate a "Fatto" quel giorno. */
  tasks: number;
  /** Minuti totali registrati quel giorno (dai time_entries). */
  minutes: number;
}

interface RendimentoCalendarProps {
  currentMonth: Date;
  /** Chiave 'yyyy-MM-dd' → statistiche del giorno. */
  stats: Map<string, DayStat>;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** Ore leggibili: 90 min → "1,5h", 480 → "8h". */
function fmtHours(minutes: number): string {
  const h = minutes / 60;
  const s = h.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${s}h`;
}

/** Più task chiuse = verde più intenso. Serve solo a far "vedere" i giorni forti. */
function heatClass(tasks: number): string {
  if (tasks === 0) return '';
  if (tasks >= 6) return 'bg-pw-success/25';
  if (tasks >= 3) return 'bg-pw-success/15';
  return 'bg-pw-success/[0.07]';
}

export function RendimentoCalendar({ currentMonth, stats, selectedDate, onSelectDate }: RendimentoCalendarProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-[10px] uppercase tracking-wider text-pw-text-dim py-2 font-medium">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-pw-border">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const stat = stats.get(key);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);
          const future = isFuture(day) && !today;

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                'relative min-h-[76px] sm:min-h-[96px] p-1.5 border-r border-b border-pw-border text-left transition-colors',
                isCurrentMonth ? 'bg-pw-surface' : 'bg-pw-bg',
                isCurrentMonth && !isSelected && stat ? heatClass(stat.tasks) : '',
                isSelected && 'ring-2 ring-inset ring-pw-accent',
                'hover:bg-pw-surface-2',
              )}
            >
              <span className={cn(
                'text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full',
                today && 'bg-pw-accent text-[#0A263A]',
                !today && isCurrentMonth && 'text-pw-text',
                !today && !isCurrentMonth && 'text-pw-text-dim',
              )}>
                {format(day, 'd')}
              </span>

              {stat && isCurrentMonth && !future && (
                <div className="mt-1.5 space-y-0.5">
                  {stat.tasks > 0 && (
                    <div className="text-[11px] font-semibold leading-tight text-pw-text">
                      {stat.tasks} {stat.tasks === 1 ? 'task' : 'task'}
                    </div>
                  )}
                  {stat.minutes > 0 && (
                    <div className="text-[10px] leading-tight text-pw-text-dim">
                      {fmtHours(stat.minutes)}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
