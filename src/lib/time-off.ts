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

/**
 * Come si scrive una mezza giornata.
 *
 * "mezza giornata" da sola costringe chi organizza il lavoro a chiedere quale
 * meta': l'informazione c'e', tanto vale scriverla. Per le richieste vecchie,
 * che quel dato non ce l'hanno, resta la dicitura di prima invece di
 * inventarsi una meta' a caso.
 */
function mezza(periodo: 'mattina' | 'pomeriggio' | null | undefined, esteso: boolean): string {
  if (!periodo) return esteso ? ' (mezza giornata)' : ' (½)';
  if (esteso) return ` (mezza giornata, ${periodo})`;
  return periodo === 'mattina' ? ' (½ mattina)' : ' (½ pomeriggio)';
}

export function dateRangeLabel(r: {
  start_date: string;
  end_date: string;
  start_half: boolean;
  end_half: boolean;
  start_half_period?: 'mattina' | 'pomeriggio' | null;
  end_half_period?: 'mattina' | 'pomeriggio' | null;
}): string {
  if (r.start_date === r.end_date) {
    return `${formatDate(r.start_date)}${r.start_half ? mezza(r.start_half_period, true) : ''}`;
  }
  return `${formatDate(r.start_date)}${r.start_half ? mezza(r.start_half_period, false) : ''} → ${formatDate(r.end_date)}${r.end_half ? mezza(r.end_half_period, false) : ''}`;
}
