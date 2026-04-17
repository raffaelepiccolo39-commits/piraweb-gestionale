'use client';

import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, isToday } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/database';

interface CalendarMonthViewProps {
  currentMonth: Date;
  events: CalendarEvent[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

export function CalendarMonthView({ currentMonth, events, selectedDate, onSelectDate }: CalendarMonthViewProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  function getEventsForDay(date: Date): CalendarEvent[] {
    const dayStr = format(date, 'yyyy-MM-dd');
    return events.filter((e) => {
      const eventDate = e.start_time.split('T')[0];
      return eventDate === dayStr;
    });
  }

  return (
    <div>
      {/* Week day headers */}
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-[10px] uppercase tracking-wider text-pw-text-dim py-2 font-medium">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 border-t border-l border-pw-border">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                'relative min-h-[80px] sm:min-h-[100px] p-1.5 border-r border-b border-pw-border text-left transition-colors',
                isCurrentMonth ? 'bg-pw-surface' : 'bg-pw-bg',
                isSelected && 'bg-pw-accent/5',
                'hover:bg-pw-surface-2'
              )}
            >
              <span className={cn(
                'text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full',
                today && 'bg-pw-accent text-[#0A263A]',
                !today && isCurrentMonth && 'text-pw-text',
                !today && !isCurrentMonth && 'text-pw-text-dim'
              )}>
                {format(day, 'd')}
              </span>

              {/* Event dots */}
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded truncate hover-glow"
                    style={{ backgroundColor: `${event.color || '#FFD108'}20`, color: event.color || '#FFD108' }}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-pw-text-dim px-1">
                    +{dayEvents.length - 3} altri
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
