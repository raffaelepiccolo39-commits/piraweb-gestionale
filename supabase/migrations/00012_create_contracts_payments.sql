-- ============================================
-- Migration 00012: Client Contracts & Payments
-- ============================================

DO $$ BEGIN CREATE TYPE contract_status AS ENUM ('active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contracts table
CREATE TABLE IF NOT EXISTS client_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  monthly_fee NUMERIC(10, 2) NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months IN (6, 12)),
  start_date DATE NOT NULL,
  status contract_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contracts_client_id ON client_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_status ON client_contracts(status);

DROP TRIGGER IF EXISTS set_client_contracts_updated_at ON client_contracts;
CREATE TRIGGER set_client_contracts_updated_at
  BEFORE UPDATE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payments table
CREATE TABLE IF NOT EXISTS client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  month_index INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, month_index)
);

CREATE INDEX IF NOT EXISTS idx_client_payments_contract_id ON client_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_is_paid ON client_payments(is_paid);

DROP TRIGGER IF EXISTS set_client_payments_updated_at ON client_payments;
CREATE TRIGGER set_client_payments_updated_at
  BEFORE UPDATE ON client_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS (admin only)
-- ============================================
ALTER TABLE client_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view contracts" ON client_contracts;
CREATE POLICY "Admins can view contracts" ON client_contracts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert contracts" ON client_contracts;
CREATE POLICY "Admins can insert contracts" ON client_contracts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update contracts" ON client_contracts;
CREATE POLICY "Admins can update contracts" ON client_contracts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete contracts" ON client_contracts;
CREATE POLICY "Admins can delete contracts" ON client_contracts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payments" ON client_payments;
CREATE POLICY "Admins can view payments" ON client_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert payments" ON client_payments;
CREATE POLICY "Admins can insert payments" ON client_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update payments" ON client_payments;
CREATE POLICY "Admins can update payments" ON client_payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete payments" ON client_payments;
CREATE POLICY "Admins can delete payments" ON client_payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Auto-generate payment rows
-- ============================================
CREATE OR REPLACE FUNCTION generate_contract_payments(p_contract_id UUID)
RETURNS VOID AS $$
DECLARE
  v_contract RECORD;
BEGIN
  SELECT * INTO v_contract FROM client_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  DELETE FROM client_payments WHERE contract_id = p_contract_id;

  INSERT INTO client_payments (contract_id, month_index, due_date, amount)
  SELECT
    p_contract_id,
    i,
    v_contract.start_date + (i || ' months')::INTERVAL,
    v_contract.monthly_fee
  FROM generate_series(0, v_contract.duration_months - 1) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Financial summary
-- ============================================
CREATE OR REPLACE FUNCTION get_client_financial_summary(p_client_id UUID)
RETURNS TABLE (
  contract_id UUID,
  monthly_fee NUMERIC,
  duration_months INTEGER,
  start_date DATE,
  contract_status contract_status,
  total_value NUMERIC,
  total_paid NUMERIC,
  remaining NUMERIC,
  months_paid BIGINT,
  months_remaining BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.monthly_fee,
    cc.duration_months,
    cc.start_date,
    cc.status,
    (cc.monthly_fee * cc.duration_months),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    (cc.monthly_fee * cc.duration_months) - COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = true),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = false)
  FROM client_contracts cc
  LEFT JOIN client_payments cp ON cp.contract_id = cc.id
  WHERE cc.client_id = p_client_id
    AND cc.status = 'active'
  GROUP BY cc.id, cc.monthly_fee, cc.duration_months, cc.start_date, cc.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
