-- ============================================
-- Migration 00013: Payment Activity Logs
-- ============================================

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('paid', 'unpaid')),
  amount NUMERIC(10, 2) NOT NULL,
  month_index INTEGER NOT NULL,
  due_date DATE NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_client ON payment_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_contract ON payment_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_performed_at ON payment_logs(performed_at DESC);

ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payment logs" ON payment_logs;
CREATE POLICY "Admins can view payment logs" ON payment_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert payment logs" ON payment_logs;
CREATE POLICY "Admins can insert payment logs" ON payment_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
