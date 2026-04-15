-- Payslips: actual payslip data uploaded by admin for each employee per month
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of the month (e.g. 2026-04-01)
  -- Amounts from the actual payslip
  ral NUMERIC(10,2), -- Retribuzione Annua Lorda
  lordo_mensile NUMERIC(10,2) NOT NULL, -- Stipendio lordo mensile
  netto_mensile NUMERIC(10,2) NOT NULL, -- Netto in busta
  inps_dipendente NUMERIC(10,2) DEFAULT 0, -- INPS carico dipendente
  irpef NUMERIC(10,2) DEFAULT 0, -- IRPEF trattenuta
  addizionale_regionale NUMERIC(10,2) DEFAULT 0,
  addizionale_comunale NUMERIC(10,2) DEFAULT 0,
  bonus_100 NUMERIC(10,2) DEFAULT 0, -- ex bonus Renzi
  straordinari NUMERIC(10,2) DEFAULT 0,
  premi NUMERIC(10,2) DEFAULT 0,
  trattenute_varie NUMERIC(10,2) DEFAULT 0,
  -- Costo azienda
  inps_azienda NUMERIC(10,2) DEFAULT 0, -- INPS carico azienda
  tfr_accantonamento NUMERIC(10,2) DEFAULT 0,
  inail NUMERIC(10,2) DEFAULT 0,
  costo_totale_azienda NUMERIC(10,2), -- Costo totale per l'azienda per quel mese
  -- File
  attachment_url TEXT,
  attachment_name TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month)
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id, month DESC);

CREATE TRIGGER set_payslips_updated_at
  BEFORE UPDATE ON payslips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payslips viewable by admin" ON payslips
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage payslips" ON payslips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
