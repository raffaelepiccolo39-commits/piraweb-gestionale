-- ============================================
-- Migration 00015: Cashflow Functions
-- ============================================

-- Monthly cashflow: expected vs received per month
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
    SUM(cp.amount),
    SUM(cp.amount) FILTER (WHERE cp.is_paid = true),
    SUM(cp.amount) FILTER (WHERE cp.is_paid = false),
    COUNT(DISTINCT cc.client_id)
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active'
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cashflow summary for a period
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
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    (SELECT COUNT(*) FROM client_contracts WHERE status = 'active'),
    (SELECT COUNT(DISTINCT client_id) FROM client_contracts WHERE status = 'active'),
    CASE
      WHEN COUNT(DISTINCT date_trunc('month', cp.due_date)) = 0 THEN 0
      ELSE ROUND(COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0) /
           COUNT(DISTINCT date_trunc('month', cp.due_date)), 2)
    END
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revenue per client
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
  GROUP BY c.id, c.name, c.company, cc.monthly_fee
  ORDER BY COALESCE(SUM(cp.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
