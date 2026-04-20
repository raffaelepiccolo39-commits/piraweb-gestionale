'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatTime, formatHours, getInitials, getRoleLabel, getRoleTone } from '@/lib/utils';
import type { AttendanceWeeklyRow, AttendanceMonthlyReport } from '@/types/database';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

interface ReportTableProps {
  mode: 'weekly' | 'monthly';
  weeklyData?: AttendanceWeeklyRow[];
  monthlyData?: AttendanceMonthlyReport[];
}

function getHoursColor(hours: number): string {
  if (hours >= 8) return 'text-green-400';
  if (hours >= 6) return 'text-yellow-600 dark:text-yellow-400';
  if (hours > 0) return 'text-red-500 dark:text-red-400';
  return 'text-pw-text-dim';
}

export function ReportTable({ mode, weeklyData, monthlyData }: ReportTableProps) {
  if (mode === 'weekly') {
    // Group by user
    const userMap = new Map<string, { name: string; role: string; days: Map<string, AttendanceWeeklyRow> }>();
    weeklyData?.forEach((row) => {
      if (!userMap.has(row.user_id)) {
        userMap.set(row.user_id, { name: row.full_name, role: row.role, days: new Map() });
      }
      const dayOfWeek = new Date(row.day_date).getDay();
      const dayKey = String((dayOfWeek + 6) % 7); // 0=Mon
      userMap.get(row.user_id)!.days.set(dayKey, row);
    });

    return (
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-pw-text">Report Settimanale</h2>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {userMap.size === 0 ? (
            <div className="p-6 text-center text-sm text-pw-text-dim">Nessun dato disponibile</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pw-border">
                  <th className="text-left px-4 py-3 text-pw-text-muted font-medium">Collaboratore</th>
                  {DAY_LABELS.map((d) => (
                    <th key={d} className="text-center px-3 py-3 text-pw-text-muted font-medium">{d}</th>
                  ))}
                  <th className="text-center px-4 py-3 text-pw-text-muted font-medium">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pw-border">
                {Array.from(userMap.entries()).map(([userId, user]) => {
                  let weekTotal = 0;
                  return (
                    <tr key={userId} className="row-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-pw-accent flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-semibold">{getInitials(user.name)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-pw-text text-xs">{user.name}</p>
                          </div>
                        </div>
                      </td>
                      {DAY_LABELS.map((_, i) => {
                        const day = user.days.get(String(i));
                        const hours = Number(day?.total_hours || 0);
                        weekTotal += hours;
                        return (
                          <td key={i} className="text-center px-3 py-3">
                            {day ? (
                              <div>
                                <p className={`font-semibold ${getHoursColor(hours)}`}>
                                  {hours > 0 ? formatHours(hours) : '--'}
                                </p>
                                <p className="text-[10px] text-pw-text-dim mt-0.5">
                                  {formatTime(day.clock_in)} - {formatTime(day.clock_out)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-pw-text-dim">--</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center px-4 py-3">
                        <p className="font-bold text-pw-accent">
                          {formatHours(weekTotal)}
                        </p>
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

  // Monthly mode
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-pw-text">Report Mensile</h2>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {!monthlyData || monthlyData.length === 0 ? (
          <div className="p-6 text-center text-sm text-pw-text-dim">Nessun dato disponibile</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pw-border">
                <th className="text-left px-4 py-3 text-pw-text-muted font-medium">Collaboratore</th>
                <th className="text-center px-3 py-3 text-pw-text-muted font-medium">Ruolo</th>
                <th className="text-center px-3 py-3 text-pw-text-muted font-medium">Giorni</th>
                <th className="text-center px-3 py-3 text-pw-text-muted font-medium">Ore Totali</th>
                <th className="text-center px-3 py-3 text-pw-text-muted font-medium">Media/Giorno</th>
                <th className="text-center px-3 py-3 text-pw-text-muted font-medium">Ritardi</th>
                <th className="text-center px-3 py-3 text-pw-text-muted font-medium">Uscite Antic.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pw-border">
              {monthlyData.map((row) => {
                const avgHours = Number(row.avg_hours_per_day) || 0;
                const lateCount = Number(row.late_arrivals) || 0;
                const earlyCount = Number(row.early_departures) || 0;

                return (
                  <tr key={row.user_id} className="row-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-pw-accent flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px] font-semibold">{getInitials(row.full_name)}</span>
                        </div>
                        <p className="font-medium text-pw-text text-xs">{row.full_name}</p>
                      </div>
                    </td>
                    <td className="text-center px-3 py-3">
                      <Badge tone={getRoleTone(row.role)} size="sm">
                        {getRoleLabel(row.role)}
                      </Badge>
                    </td>
                    <td className="text-center px-3 py-3 font-semibold text-pw-text">
                      {row.days_worked}
                    </td>
                    <td className="text-center px-3 py-3 font-semibold text-pw-accent">
                      {formatHours(row.total_hours)}
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className={`font-semibold ${getHoursColor(avgHours)}`}>
                        {formatHours(avgHours)}
                      </span>
                      <div className="mt-1 mx-auto w-16 h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full progress-animated ${
                            avgHours >= 8 ? 'bg-green-500' : avgHours >= 6 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min((avgHours / 8) * 100, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className={`font-semibold ${lateCount > 3 ? 'text-red-500' : lateCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                        {lateCount}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className={`font-semibold ${earlyCount > 3 ? 'text-red-500' : earlyCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                        {earlyCount}
                      </span>
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
