'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getInitials, getContrastTextColor, getAttendanceStatusLabel } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import type { TeamAbsence } from '@/types/database';
import { Clock } from 'lucide-react';

/**
 * Chi c'è oggi, per nome e con la sua condizione.
 *
 * Prima erano pallini con le iniziali e un puntino colorato: per sapere chi
 * fosse e come stesse bisognava passarci sopra col mouse, uno per uno. Su un
 * riquadro che si apre per rispondere a "chi c'è oggi" era il contrario di
 * quello che serve.
 *
 * Le FERIE non stanno nelle timbrature: `get_team_attendance_today` conosce
 * solo working/lunch_break/completed/absent, e chi è in ferie ci finisce
 * dentro come un assente qualsiasi. Il dato vero sta in `get_team_absences`,
 * che la dashboard legge una volta sola e passa qui: senza, "assente" e "in
 * ferie" resterebbero indistinguibili — che è poi la differenza che conta.
 */

interface TeamMember {
  user_id: string;
  full_name: string;
  status: string;
}

interface TeamAttendanceProps {
  team: TeamMember[];
  assenze?: TeamAbsence[];
}

/** Il colore del pallino: la condizione si legge anche di sfuggita. */
const TONO: Record<string, 'success' | 'warning' | 'info' | 'brand' | 'neutral'> = {
  working: 'success',
  lunch_break: 'warning',
  completed: 'info',
  absent: 'neutral',
};

export const TeamAttendance = memo(function TeamAttendance({ team, assenze = [] }: TeamAttendanceProps) {
  if (team.length === 0) return null;

  const assenzaDi = new Map(assenze.map((a) => [a.user_id, a]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-pw-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-pw-text">Team oggi</h2>
            <span className="text-[11px] text-pw-text-dim font-medium tabular-nums">
              {team.length}
            </span>
          </div>
          <Link href="/presenze" className="text-xs text-pw-accent hover:underline">Dettagli</Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-pw-border/60">
          {team.map((member) => {
            // Le ferie vincono sulla timbratura: chi è in ferie non ha
            // timbrato, ma dire "assente" sarebbe fuorviante.
            const assenza = assenzaDi.get(member.user_id);
            const etichetta = assenza
              ? TIME_OFF_TYPE_LABELS[assenza.type]
              : getAttendanceStatusLabel(member.status);
            const tono = assenza ? 'brand' : (TONO[member.status] ?? 'neutral');
            const colore = assenza?.color || 'var(--pw-navy)';

            return (
              <div key={member.user_id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: colore, color: getContrastTextColor(colore) }}
                  aria-hidden="true"
                >
                  {getInitials(member.full_name)}
                </span>
                <span className="text-sm text-pw-text flex-1 min-w-0 truncate">
                  {member.full_name}
                </span>
                <Badge tone={tono} dot size="sm">{etichetta}</Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
