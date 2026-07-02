-- Controllo e Gestione Aziendale: conto economico gestionale mensile.
-- Ogni riga = una voce (ricavo o costo) con 12 valori mensili, per un anno.
-- Totali, %, trimestri e marginalita' sono CALCOLATI a runtime (non salvati).
-- Solo admin. Idempotente.

CREATE TABLE IF NOT EXISTS business_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('ricavi_agenzia', 'ricavi_extra', 'costi')),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  months NUMERIC[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::NUMERIC[],
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_control_year ON business_control(year);

DROP TRIGGER IF EXISTS set_business_control_updated_at ON business_control;
CREATE TRIGGER set_business_control_updated_at
  BEFORE UPDATE ON business_control
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE business_control ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage business control" ON business_control;
CREATE POLICY "Admin manage business control"
  ON business_control FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
