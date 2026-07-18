'use client';

import { Badge } from '@/components/ui/badge';
import { distanceMeters } from '@/lib/attendance-geo';
import type { GeoStampRecord } from '@/types/database';

/**
 * Mostra l'esito della verifica posizione di una timbratura (solo admin):
 * in sede / fuori sede (con distanza) / posizione non disponibile.
 * Il calcolo della distanza avviene qui, con le coordinate della sede.
 */
export function GeoBadge({ label, geo, office, radius }: {
  label: string;
  geo: GeoStampRecord | null | undefined;
  office: { lat: number; lng: number } | null;
  radius: number;
}) {
  if (!geo) {
    return <Badge tone="neutral" size="sm">{label}: posizione non disponibile</Badge>;
  }
  if (!office) {
    return <Badge tone="neutral" size="sm">{label}: posizione acquisita (sede non impostata)</Badge>;
  }
  const dist = distanceMeters(geo, office);
  const outside = dist > radius;
  return (
    <Badge tone={outside ? 'danger' : 'success'} size="sm">
      {label}: {outside ? `fuori sede · ~${dist} m` : 'in sede'}
    </Badge>
  );
}
