-- Pausa cliente (fermo per alcuni mesi).
-- paused_at NULL = cliente attivo; valorizzato = in pausa.
-- Un cliente in pausa resta operativo e visibile (task, calendario, liste),
-- ma va ESCLUSO dalla rendicontazione aziendale (cashflow, CFO/profittabilità,
-- direzione/dashboard, fatture/promemoria). Reversibile.
-- Distinto da is_active (che invece nasconde il cliente da tutto).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS paused_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_clients_paused_at ON clients(paused_at);

-- ============================================================
-- Rendicontazione: le RPC cashflow escludono i clienti in pausa
-- (aggiunto JOIN clients + c.paused_at IS NULL rispetto alle versioni 00015/00036)
-- ============================================================

CREATE OR REPLACE FUNCTION get_cashflow_summary(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  active_contracts BIGINT,
  active_clients BIGINT,
  avg_monthly_revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND c.paused_at IS NULL
    ), 0) AS total_expected,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = true AND c.paused_at IS NULL
    ), 0) AS total_received,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = false AND c.paused_at IS NULL
    ), 0) AS total_pending,
    (SELECT COUNT(*) FROM client_contracts cc JOIN clients c ON c.id = cc.client_id WHERE cc.status = 'active' AND c.paused_at IS NULL) AS active_contracts,
    (SELECT COUNT(DISTINCT cc.client_id) FROM client_contracts cc JOIN clients c ON c.id = cc.client_id WHERE cc.status = 'active' AND c.paused_at IS NULL) AS active_clients,
    COALESCE((
      SELECT CASE
        WHEN COUNT(DISTINCT date_trunc('month', cp.due_date)) = 0 THEN 0
        ELSE ROUND(SUM(cp.amount) FILTER (WHERE cp.is_paid = true) / COUNT(DISTINCT date_trunc('month', cp.due_date)), 2)
      END
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND c.paused_at IS NULL
    ), 0) AS avg_monthly_revenue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_cashflow_monthly(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  month_date DATE,
  expected NUMERIC,
  received NUMERIC,
  pending NUMERIC,
  num_clients BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('month', cp.due_date)::DATE AS md,
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    COUNT(DISTINCT cc.client_id)
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  JOIN clients c ON c.id = cc.client_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND c.paused_at IS NULL
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_revenue_per_client(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  company TEXT,
  monthly_fee NUMERIC,
  total_expected NUMERIC,
  total_paid NUMERIC,
  total_pending NUMERIC,
  months_paid BIGINT,
  months_total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.company,
    cc.monthly_fee,
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = true),
    COUNT(cp.id)
  FROM clients c
  JOIN client_contracts cc ON cc.client_id = c.id AND cc.status = 'active'
  JOIN client_payments cp ON cp.contract_id = cc.id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND c.paused_at IS NULL
  GROUP BY c.id, c.name, c.company, cc.monthly_fee
  ORDER BY COALESCE(SUM(cp.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
