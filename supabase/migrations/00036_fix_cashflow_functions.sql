-- Fix: get_cashflow_summary should always return active_contracts and active_clients
-- even when there are no payments in the selected period
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
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active'
    ), 0) AS total_expected,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = true
    ), 0) AS total_received,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = false
    ), 0) AS total_pending,
    (SELECT COUNT(*) FROM client_contracts WHERE status = 'active') AS active_contracts,
    (SELECT COUNT(DISTINCT client_id) FROM client_contracts WHERE status = 'active') AS active_clients,
    COALESCE((
      SELECT CASE
        WHEN COUNT(DISTINCT date_trunc('month', cp.due_date)) = 0 THEN 0
        ELSE ROUND(SUM(cp.amount) FILTER (WHERE cp.is_paid = true) / COUNT(DISTINCT date_trunc('month', cp.due_date)), 2)
      END
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active'
    ), 0) AS avg_monthly_revenue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix: get_cashflow_monthly should include all months even without active contract filter issue
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
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
