-- Acconti/saldi per clienti e progetti one-shot (caso d'uso: progetti di
-- coding con pagamento spalmato in più tranche).
-- Distinta dai client_payments mensili (che modellano canoni ricorrenti):
-- - client_payments = una rata per mese di contratto
-- - client_installments = N acconti arbitrari per progetto o cliente

-- ============================================
-- 1. Estensione projects: budget totale
-- ============================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS budget_currency TEXT NOT NULL DEFAULT 'EUR';

-- ============================================
-- 2. Tabella client_installments
-- project_id NULLABLE: l'acconto può essere generico per cliente
-- ============================================
CREATE TABLE IF NOT EXISTS client_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  sequence_number INT NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT 'Acconto',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  notes TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_method CHECK (
    payment_method IS NULL OR payment_method IN
      ('bonifico','contanti','carta','paypal','stripe','assegno','altro')
  )
);

CREATE INDEX IF NOT EXISTS idx_installments_client
  ON client_installments(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_installments_project
  ON client_installments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_installments_unpaid
  ON client_installments(due_date) WHERE paid_at IS NULL;

CREATE TRIGGER set_client_installments_updated_at
  BEFORE UPDATE ON client_installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 3. Tabella installment_logs (audit append-only)
-- ============================================
CREATE TABLE IF NOT EXISTS installment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID REFERENCES client_installments(id) ON DELETE SET NULL,
  client_id UUID,
  project_id UUID,
  action TEXT NOT NULL,
  amount NUMERIC(12,2),
  payment_method TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  performed_by UUID REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_logs_client
  ON installment_logs(client_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_installment_logs_project
  ON installment_logs(project_id, performed_at DESC);

-- ============================================
-- 4. Trigger audit: ogni INSERT/UPDATE/DELETE su client_installments
-- scrive una riga in installment_logs.
-- ============================================
CREATE OR REPLACE FUNCTION log_installment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action TEXT;
  v_details JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.paid_at IS NOT NULL THEN 'created_paid' ELSE 'created' END;
    v_details := jsonb_build_object('label', NEW.label, 'due_date', NEW.due_date);
    INSERT INTO installment_logs (installment_id, client_id, project_id, action, amount, payment_method, details, performed_by)
      VALUES (NEW.id, NEW.client_id, NEW.project_id, v_action, NEW.amount, NEW.payment_method, v_details, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- pagato/spagato
    IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL THEN
      v_action := 'paid';
    ELSIF OLD.paid_at IS NOT NULL AND NEW.paid_at IS NULL THEN
      v_action := 'unpaid';
    ELSE
      v_action := 'edited';
    END IF;
    v_details := jsonb_build_object(
      'amount_changed', (OLD.amount IS DISTINCT FROM NEW.amount),
      'old_amount', OLD.amount,
      'new_amount', NEW.amount,
      'label', NEW.label
    );
    INSERT INTO installment_logs (installment_id, client_id, project_id, action, amount, payment_method, details, performed_by)
      VALUES (NEW.id, NEW.client_id, NEW.project_id, v_action, NEW.amount, NEW.payment_method, v_details, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO installment_logs (installment_id, client_id, project_id, action, amount, payment_method, details, performed_by)
      VALUES (OLD.id, OLD.client_id, OLD.project_id, 'deleted', OLD.amount, OLD.payment_method,
        jsonb_build_object('label', OLD.label), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_installment_audit ON client_installments;
CREATE TRIGGER trg_installment_audit
  AFTER INSERT OR UPDATE OR DELETE ON client_installments
  FOR EACH ROW EXECUTE FUNCTION log_installment_change();

-- ============================================
-- 5. View riepilogo per progetto (UI lo legge per Budget/Incassato/Residuo)
-- ============================================
CREATE OR REPLACE VIEW v_project_payment_summary AS
SELECT
  p.id AS project_id,
  p.name,
  p.client_id,
  p.budget_amount,
  p.budget_currency,
  COALESCE(SUM(ci.amount) FILTER (WHERE ci.paid_at IS NOT NULL), 0) AS paid_total,
  COALESCE(SUM(ci.amount) FILTER (WHERE ci.paid_at IS NULL), 0) AS pending_total,
  COALESCE(COUNT(ci.id) FILTER (WHERE ci.paid_at IS NOT NULL), 0) AS paid_count,
  COALESCE(COUNT(ci.id) FILTER (WHERE ci.paid_at IS NULL), 0) AS pending_count,
  p.budget_amount - COALESCE(SUM(ci.amount) FILTER (WHERE ci.paid_at IS NOT NULL), 0) AS residual
FROM projects p
LEFT JOIN client_installments ci ON ci.project_id = p.id
GROUP BY p.id, p.name, p.client_id, p.budget_amount, p.budget_currency;

-- ============================================
-- 6. View riepilogo per cliente (Saldi aperti)
-- ============================================
CREATE OR REPLACE VIEW v_client_open_installments AS
SELECT
  c.id AS client_id,
  c.name AS client_name,
  ci.project_id,
  p.name AS project_name,
  COALESCE(SUM(ci.amount), 0) AS open_amount,
  COUNT(ci.id) AS open_count,
  MIN(ci.due_date) AS next_due_date
FROM clients c
JOIN client_installments ci ON ci.client_id = c.id
LEFT JOIN projects p ON p.id = ci.project_id
WHERE ci.paid_at IS NULL
GROUP BY c.id, c.name, ci.project_id, p.name;

-- ============================================
-- 7. RLS: solo admin gestisce, tutti possono leggere (per coerenza con
-- altre tabelle finanziarie come client_payments)
-- ============================================
ALTER TABLE client_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Installments select all" ON client_installments;
CREATE POLICY "Installments select all"
  ON client_installments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Installments admin write" ON client_installments;
CREATE POLICY "Installments admin write"
  ON client_installments FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Installment logs select admin" ON installment_logs;
CREATE POLICY "Installment logs select admin"
  ON installment_logs FOR SELECT
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
