'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatTime, formatHours, getInitials } from '@/lib/utils';
import type { AttendanceWeeklyRow } from '@/types/database';
import { Check, X, Coffee, Clock } from 'lucide-react';

interface AttendanceCalendarProps {
  data: AttendanceWeeklyRow[];
  month: number;
  year: number;
}

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function getDayName(day: number, month: number, year: number): string {
  return new Date(year, month - 1, day).toLocaleDateString('it-IT', { weekday: 'short' });
}

function isWeekend(day: number, month: number, year: number): boolean {
  const d = new Date(year, month - 1, day).getDay();
  return d === 0 || d === 6;
}

export function AttendanceCalendar({ data, month, year }: AttendanceCalendarProps) {
  // Group by user
  const userMap = new Map<string, { name: string; days: Map<number, AttendanceWeeklyRow> }>();
  data.forEach((row) => {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, { name: row.full_name, days: new Map() });
    }
    const day = new Date(row.day_date).getDate();
    userMap.get(row.user_id)!.days.set(day, row);
  });

  const totalDays = getDaysInMonth(month, year);
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
  const currentDay = today.getDate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-gray-400" />
          <h2 className="text-lg font-semibold text-pw-text">
            Registro Presenze
          </h2>
        </div>
        <div className="flex gap-3 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded bg-green-500" /> Presente
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded bg-red-400" /> Assente
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded bg-pw-surface-3" /> Weekend
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {userMap.size === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Nessun dato disponibile</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-pw-border">
                <th className="text-left px-3 py-2 text-pw-text-muted font-medium sticky left-0 bg-pw-surface z-10 min-w-[120px]">
                  Dipendente
                </th>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                  const weekend = isWeekend(day, month, year);
                  const isTodayCell = isCurrentMonth && day === currentDay;
                  return (
                    <th
                      key={day}
                      className={`text-center px-1 py-2 font-medium min-w-[32px] ${
                        weekend ? 'text-pw-text-dim' :
                        isTodayCell ? 'text-pw-accent' :
                        'text-pw-text-muted'
                      }`}
                    >
                      <div>{day}</div>
                      <div className="text-[10px] capitalize">{getDayName(day, month, year)}</div>
                    </th>
                  );
                })}
                <th className="text-center px-3 py-2 text-pw-text-muted font-medium min-w-[60px]">
                  Totale
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pw-border">
              {Array.from(userMap.entries()).map(([userId, user]) => {
                let totalHours = 0;
                let daysPresent = 0;

                return (
                  <tr key={userId} className="hover:bg-pw-surface-2">
                    <td className="px-3 py-2 sticky left-0 bg-pw-surface z-10">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-pw-accent flex items-center justify-center shrink-0">
                          <span className="text-white text-[8px] font-semibold">{getInitials(user.name)}</span>
                        </div>
                        <span className="font-medium text-pw-text truncate">{user.name}</span>
                      </div>
                    </td>
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                      const weekend = isWeekend(day, month, year);
                      const record = user.days.get(day);
                      const isFuture = isCurrentMonth && day > currentDay;
                      const hours = Number(record?.total_hours || 0);

                      if (record && record.clock_in) {
                        totalHours += hours;
                        daysPresent++;
                      }

                      return (
                        <td key={day} className="text-center px-1 py-2">
                          {weekend ? (
                            <div className="w-6 h-6 mx-auto rounded bg-pw-surface-3" />
                          ) : isFuture ? (
                            <div className="w-6 h-6 mx-auto rounded bg-pw-surface" />
                          ) : record && record.clock_in ? (
                            <div
                              className="w-6 h-6 mx-auto rounded bg-green-500 flex items-center justify-center cursor-default"
                              title={`${formatTime(record.clock_in)} - ${formatTime(record.clock_out)} | ${formatHours(hours)}`}
                            >
                              <Check size={12} className="text-white" />
                            </div>
                          ) : (
                            <div
                              className="w-6 h-6 mx-auto rounded bg-red-400 flex items-center justify-center cursor-default"
                              title="Assente"
                            >
                              <X size={12} className="text-white" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-2">
                      <div>
                        <p className="font-bold text-pw-accent">{daysPresent}gg</p>
                        <p className="text-[10px] text-gray-400">{formatHours(totalHours)}</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
