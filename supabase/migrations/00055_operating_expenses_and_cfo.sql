-- Operating expenses table for tracking all non-salary business costs
CREATE TABLE IF NOT EXISTS operating_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'altro',
  amount NUMERIC(10,2) NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'quarterly', 'yearly', 'one_time')),
  start_date DATE,
  end_date DATE,
  vendor TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_active ON operating_expenses(is_active, category);

CREATE TRIGGER set_operating_expenses_updated_at
  BEFORE UPDATE ON operating_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Expenses viewable by admin" ON operating_expenses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage expenses" ON operating_expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
