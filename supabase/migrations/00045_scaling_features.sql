-- ============================================================
-- Migration 00045: Scaling Features
-- Client Health, Automations, Invoicing
-- ============================================================

-- ==================== CLIENT HEALTH SCORE ====================

-- Materialized view would be ideal but we use a function for Supabase compatibility
CREATE OR REPLACE FUNCTION calculate_client_health(p_client_id UUID)
RETURNS TABLE (
  health_score INTEGER,
  payment_score INTEGER,
  delivery_score INTEGER,
  budget_score INTEGER,
  engagement_score INTEGER,
  risk_level TEXT
) AS $$
DECLARE
  v_payment_score INTEGER := 0;
  v_delivery_score INTEGER := 0;
  v_budget_score INTEGER := 0;
  v_engagement_score INTEGER := 0;
  v_total INTEGER;
  v_total_payments INTEGER;
  v_paid_on_time INTEGER;
  v_total_tasks INTEGER;
  v_done_on_time INTEGER;
  v_total_estimated NUMERIC;
  v_total_logged NUMERIC;
  v_last_activity TIMESTAMPTZ;
BEGIN
  -- 1. Payment Score (0-25): % of payments paid on time
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_paid = true)
  INTO v_total_payments, v_paid_on_time
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cc.client_id = p_client_id
  AND cp.due_date <= now();

  IF v_total_payments > 0 THEN
    v_payment_score := ROUND((v_paid_on_time::NUMERIC / v_total_payments) * 25);
  ELSE
    v_payment_score := 25; -- No payments due yet = good
  END IF;

  -- 2. Delivery Score (0-25): % of tasks completed on time
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'done' AND (deadline IS NULL OR updated_at::DATE <= deadline))
  INTO v_total_tasks, v_done_on_time
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.client_id = p_client_id
  AND t.status IN ('done', 'review')
  AND t.created_at > now() - INTERVAL '90 days';

  IF v_total_tasks > 0 THEN
    v_delivery_score := ROUND((v_done_on_time::NUMERIC / v_total_tasks) * 25);
  ELSE
    v_delivery_score := 20;
  END IF;

  -- 3. Budget Score (0-25): logged hours vs estimated
  SELECT COALESCE(SUM(estimated_hours), 0), COALESCE(SUM(logged_hours), 0)
  INTO v_total_estimated, v_total_logged
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.client_id = p_client_id
  AND t.estimated_hours IS NOT NULL AND t.estimated_hours > 0;

  IF v_total_estimated > 0 THEN
    IF v_total_logged <= v_total_estimated THEN
      v_budget_score := 25;
    ELSIF v_total_logged <= v_total_estimated * 1.2 THEN
      v_budget_score := 18;
    ELSIF v_total_logged <= v_total_estimated * 1.5 THEN
      v_budget_score := 10;
    ELSE
      v_budget_score := 5;
    END IF;
  ELSE
    v_budget_score := 20;
  END IF;

  -- 4. Engagement Score (0-25): recent activity
  SELECT MAX(t.updated_at)
  INTO v_last_activity
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.client_id = p_client_id;

  IF v_last_activity IS NOT NULL THEN
    IF v_last_activity > now() - INTERVAL '7 days' THEN
      v_engagement_score := 25;
    ELSIF v_last_activity > now() - INTERVAL '14 days' THEN
      v_engagement_score := 20;
    ELSIF v_last_activity > now() - INTERVAL '30 days' THEN
      v_engagement_score := 15;
    ELSIF v_last_activity > now() - INTERVAL '60 days' THEN
      v_engagement_score := 8;
    ELSE
      v_engagement_score := 3;
    END IF;
  ELSE
    v_engagement_score := 10;
  END IF;

  v_total := v_payment_score + v_delivery_score + v_budget_score + v_engagement_score;

  RETURN QUERY SELECT
    v_total,
    v_payment_score,
    v_delivery_score,
    v_budget_score,
    v_engagement_score,
    CASE
      WHEN v_total >= 80 THEN 'healthy'
      WHEN v_total >= 60 THEN 'needs_attention'
      WHEN v_total >= 40 THEN 'at_risk'
      ELSE 'critical'
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== AUTOMATION ENGINE ====================

CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'deal_stage_changed',
    'task_completed',
    'task_overdue',
    'client_payment_overdue',
    'approval_submitted',
    'approval_reviewed'
  )),
  trigger_config JSONB DEFAULT '{}', -- e.g. { "stage": "closed_won" }
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_project_from_template',
    'create_notification',
    'change_task_status',
    'assign_task',
    'send_email'
  )),
  action_config JSONB DEFAULT '{}', -- e.g. { "template_id": "...", "notification_message": "..." }
  is_active BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_trigger ON automations(trigger_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_data JSONB,
  action_result JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_logs_automation ON automation_logs(automation_id, created_at DESC);

CREATE TRIGGER set_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Automations viewable by admin" ON automations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage automations" ON automations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Logs viewable by admin" ON automation_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==================== INVOICING ====================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  -- Amounts
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 22.00,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Details
  description TEXT,
  period_start DATE,
  period_end DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  -- Payment
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  -- Metadata
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(issue_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate totals
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC;
  v_invoice RECORD;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT * INTO v_invoice FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  UPDATE invoices SET
    subtotal = v_subtotal,
    vat_amount = ROUND(v_subtotal * (v_invoice.vat_rate / 100), 2),
    total = ROUND(v_subtotal * (1 + v_invoice.vat_rate / 100), 2)
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recalculate_invoice
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_invoice_totals();

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    SELECT COUNT(*) + 1 INTO v_count FROM invoices WHERE invoice_number LIKE 'FT-' || v_year || '-%';
    NEW.invoice_number := 'FT-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoices viewable by admin" ON invoices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage invoices" ON invoices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Invoice items viewable by admin" ON invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage invoice items" ON invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
