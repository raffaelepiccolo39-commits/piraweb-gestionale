-- ============================================================
-- Verifica posizione delle timbrature (entrata/uscita).
-- ============================================================
-- Problema: alcuni timbrano l'uscita dal telefono già fuori ufficio. Ora a
-- ogni timbratura salviamo la posizione GPS (grezza: lat/lng/accuratezza), e
-- lato admin calcoliamo la distanza dalla sede per segnalare le timbrature
-- "fuori sede". Non blocca nulla: registra e segnala. Se il GPS è negato o non
-- disponibile, il campo resta null ("posizione non disponibile").
--
-- Privacy: le coordinate della sede stanno in company_settings, leggibile solo
-- agli admin. I dipendenti non ricevono la posizione dell'ufficio.

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS clock_in_geo jsonb,
  ADD COLUMN IF NOT EXISTS clock_out_geo jsonb;

-- Impostazioni aziendali: una sola riga (singleton via id boolean).
CREATE TABLE IF NOT EXISTS company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  office_lat double precision,
  office_lng double precision,
  office_radius_m integer NOT NULL DEFAULT 150,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

INSERT INTO company_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read company settings" ON company_settings;
CREATE POLICY "admin read company settings" ON company_settings
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "admin update company settings" ON company_settings;
CREATE POLICY "admin update company settings" ON company_settings
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
