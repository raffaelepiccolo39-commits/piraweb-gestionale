import { Plane, Clock, Stethoscope } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { TimeOffType } from '@/types/database';

/** Helper condivisi tra la pagina Ferie & Permessi e i suoi componenti. */

export const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const TYPE_ICON: Record<TimeOffType, React.ElementType> = {
  ferie: Plane,
  permesso: Clock,
  malattia: Stethoscope,
};

export const fmtDays = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

export function dateRangeLabel(r: {
  start_date: string;
  end_date: string;
  start_half: boolean;
  end_half: boolean;
}): string {
  if (r.start_date === r.end_date) {
    return `${formatDate(r.start_date)}${r.start_half ? ' (mezza giornata)' : ''}`;
  }
  return `${formatDate(r.start_date)}${r.start_half ? ' (½)' : ''} → ${formatDate(r.end_date)}${r.end_half ? ' (½)' : ''}`;
}
