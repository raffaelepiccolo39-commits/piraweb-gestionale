'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { getInitials, todayLocal, getContrastTextColor } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import type { TeamAbsence, TimeOffType } from '@/types/database';
import { Plane, Clock, Stethoscope, CalendarCheck } from 'lucide-react';

const TYPE_ICON: Record<TimeOffType, React.ElementType> = {
  ferie: Plane,
  permesso: Clock,
  malattia: Stethoscope,
};

/** Promemoria admin: chi è in ferie/permesso/malattia oggi. */
export function AbsentToday() {
  const supabase = createClient();
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = todayLocal();
    supabase
      .rpc('get_team_absences', { p_from: today, p_to: today })
      .then(({ data }) => { setAbsences((data as TeamAbsence[]) || []); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
          <Plane size={16} className="text-pw-text-muted" /> Assenti oggi
        </h2>
        {loading ? (
          <p className="text-sm text-pw-text-dim">Caricamento…</p>
        ) : absences.length === 0 ? (
          <p className="text-sm text-pw-text-dim flex items-center gap-2">
            <CalendarCheck size={15} /> Nessun assente oggi — team al completo.
          </p>
        ) : (
          <div className="space-y-2">
            {absences.map((a) => {
              const Icon = TYPE_ICON[a.type];
              return (
                <div key={a.request_id} className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: a.color || '#0A263A', color: getContrastTextColor(a.color || '#0A263A') }}
                  >
                    {getInitials(a.full_name)}
                  </span>
                  <span className="text-sm text-pw-text flex-1 truncate">{a.full_name}</span>
                  <span className="text-xs text-pw-text-muted flex items-center gap-1 shrink-0">
                    <Icon size={13} /> {TIME_OFF_TYPE_LABELS[a.type]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
