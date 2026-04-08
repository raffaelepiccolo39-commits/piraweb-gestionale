'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getInitials, getAttendanceStatusLabel } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface TeamMember {
  user_id: string;
  full_name: string;
  status: string;
}

interface TeamAttendanceProps {
  team: TeamMember[];
}

const statusColors: Record<string, string> = {
  working: 'bg-green-500',
  lunch_break: 'bg-yellow-500',
  completed: 'bg-blue-500',
  absent: 'bg-pw-surface-3',
};

export function TeamAttendance({ team }: TeamAttendanceProps) {
  if (team.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-pw-accent" />
            <h2 className="text-sm font-semibold text-pw-text">Team oggi</h2>
          </div>
          <Link href="/presenze" className="text-xs text-pw-accent hover:underline">Dettagli</Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {team.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center gap-2"
              title={`${member.full_name} — ${getAttendanceStatusLabel(member.status)}`}
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-pw-surface-2 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-pw-text-muted">
                    {getInitials(member.full_name)}
                  </span>
                </div>
                <div className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-pw-surface',
                  statusColors[member.status] || 'bg-gray-500'
                )} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
