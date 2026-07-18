'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { captureGeoStamp } from '@/lib/attendance-geo';
import { reportSupabaseError } from '@/lib/report-error';
import type { CompanySettings } from '@/types/database';
import { MapPin, Crosshair, Save } from 'lucide-react';

/**
 * Impostazione della sede per la verifica posizione delle timbrature (admin).
 * Il modo più preciso per fissarla: stando in ufficio, premere "usa la mia
 * posizione attuale". Il raggio definisce quanto lontano è ancora "in sede".
 */
export function OfficeLocationSettings() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState('150');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('company_settings')
      .select('office_lat, office_lng, office_radius_m')
      .maybeSingle();
    if (error) reportSupabaseError(error, 'office-settings-load');
    const s = data as Pick<CompanySettings, 'office_lat' | 'office_lng' | 'office_radius_m'> | null;
    if (s) {
      setLat(s.office_lat);
      setLng(s.office_lng);
      setRadius(String(s.office_radius_m ?? 150));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function useCurrentPosition() {
    setCapturing(true);
    const geo = await captureGeoStamp();
    setCapturing(false);
    if (!geo) { toast.error('Posizione non disponibile: attiva la geolocalizzazione e riprova'); return; }
    setLat(geo.lat);
    setLng(geo.lng);
    toast.success(`Posizione acquisita${geo.acc != null ? ` (±${geo.acc} m)` : ''}`);
  }

  async function save() {
    if (lat == null || lng == null) { toast.error('Imposta prima la posizione della sede'); return; }
    const r = Number(radius);
    if (!Number.isFinite(r) || r < 20) { toast.error('Raggio non valido (minimo 20 m)'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('company_settings')
      .update({ office_lat: lat, office_lng: lng, office_radius_m: Math.round(r), updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq('id', true);
    setSaving(false);
    if (error) { reportSupabaseError(error, 'office-settings-save'); toast.error('Errore nel salvataggio'); return; }
    toast.success('Sede salvata');
  }

  if (loading) return null;

  const isSet = lat != null && lng != null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-pw-text-dim" />
          <h2 className="text-lg font-semibold text-pw-text">Sede &amp; timbrature</h2>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-pw-text-muted">
          A ogni timbratura di entrata e uscita salviamo la posizione GPS. Le timbrature
          oltre il raggio dalla sede vengono <span className="font-medium text-pw-text">segnalate</span> nelle
          presenze (non bloccate). Per fissare la sede con precisione, premi il pulsante
          mentre sei in ufficio.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={useCurrentPosition} loading={capturing}>
            <Crosshair size={16} /> Usa la mia posizione attuale
          </Button>
          <span className="text-sm text-pw-text-dim">
            {isSet ? `Sede: ${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : 'Sede non ancora impostata'}
          </span>
        </div>

        <div className="max-w-[220px]">
          <Input
            label="Raggio consentito (metri)"
            type="number"
            min="20"
            step="10"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>

        <div>
          <Button variant="primary" onClick={save} loading={saving} disabled={!isSet}>
            <Save size={16} /> Salva sede
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
