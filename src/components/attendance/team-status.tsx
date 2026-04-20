'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatTime, getInitials, getRoleLabel, getRoleTone, getAttendanceStatusLabel, getAttendanceStatusTone } from '@/lib/utils';
import type { TeamAttendanceToday } from '@/types/database';
import { Users } from 'lucide-react';

interface TeamStatusProps {
  teamData: TeamAttendanceToday[];
  loading: boolean;
}

export function TeamStatus({ teamData, loading }: TeamStatusProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const working = teamData.filter((t) => t.status === 'working').length;
  const lunch = teamData.filter((t) => t.status === 'lunch_break').length;
  const completed = teamData.filter((t) => t.status === 'completed').length;
  const absent = teamData.filter((t) => t.status === 'absent').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-pw-text-dim" />
            <h2 className="text-lg font-semibold text-pw-text">
              Stato Team Oggi
            </h2>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-green-500/15 text-green-400">
              {working} al lavoro
            </Badge>
            <Badge className="bg-yellow-500/15 text-yellow-400">
              {lunch} in pausa
            </Badge>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {completed} usciti
            </Badge>
            <Badge className="bg-pw-surface-3 text-pw-text-muted">
              {absent} assenti
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-pw-border">
          {teamData.map((member) => (
            <div key={member.user_id} className="px-6 py-3 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-pw-accent flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-semibold">
                  {getInitials(member.full_name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-pw-text truncate">
                    {member.full_name}
                  </p>
                  <Badge tone={getRoleTone(member.role)} size="sm">
                    {getRoleLabel(member.role)}
                  </Badge>
                </div>
                {member.status !== 'absent' && (
                  <p className="text-xs text-pw-text-muted mt-0.5">
                    Entrata {formatTime(member.clock_in)}
                    {member.lunch_start && ` | Pausa ${formatTime(member.lunch_start)}`}
                    {member.lunch_end && ` - ${formatTime(member.lunch_end)}`}
                    {member.clock_out && ` | Uscita ${formatTime(member.clock_out)}`}
                  </p>
                )}
              </div>
              <Badge tone={getAttendanceStatusTone(member.status)} dot>
                {getAttendanceStatusLabel(member.status)}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
