-- ============================================
-- Migration 00017: Cashflow with expenses (employee salaries)
-- ============================================

-- Monthly expenses based on active employee salaries
CREATE OR REPLACE FUNCTION get_monthly_expenses(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_monthly_salaries NUMERIC,
  num_employees BIGINT,
  employees_detail JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(p.salary), 0),
    COUNT(p.id),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'role', p.role,
      'salary', p.salary,
      'contract_type', p.contract_type
    ) ORDER BY p.salary DESC) FILTER (WHERE p.salary IS NOT NULL), '[]'::jsonb)
  FROM profiles p
  WHERE p.is_active = true
    AND p.role != 'admin'
    AND p.salary IS NOT NULL
    AND p.salary > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Full P&L summary
CREATE OR REPLACE FUNCTION get_profit_loss_summary(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_received NUMERIC,
  total_pending_revenue NUMERIC,
  monthly_salary_cost NUMERIC,
  total_salary_cost_period NUMERIC,
  gross_margin NUMERIC,
  gross_margin_pct NUMERIC,
  net_margin NUMERIC,
  net_margin_pct NUMERIC,
  num_months INTEGER
) AS $$
DECLARE
  v_months INTEGER;
  v_monthly_salaries NUMERIC;
  v_total_expected NUMERIC;
  v_total_received NUMERIC;
  v_total_pending NUMERIC;
BEGIN
  -- Calculate months in period
  v_months := GREATEST(1, EXTRACT(MONTH FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER +
    EXTRACT(YEAR FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER * 12 + 1);

  -- Get monthly salary total
  SELECT COALESCE(SUM(salary), 0) INTO v_monthly_salaries
  FROM profiles
  WHERE is_active = true AND role != 'admin' AND salary IS NOT NULL AND salary > 0;

  -- Get revenue data
  SELECT
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0)
  INTO v_total_expected, v_total_received, v_total_pending
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active';

  RETURN QUERY SELECT
    v_total_expected,
    v_total_received,
    v_total_pending,
    v_monthly_salaries,
    v_monthly_salaries * v_months,
    v_total_expected - (v_monthly_salaries * v_months),
    CASE WHEN v_total_expected = 0 THEN 0
         ELSE ROUND(((v_total_expected - (v_monthly_salaries * v_months)) / v_total_expected) * 100, 1)
    END,
    v_total_received - (v_monthly_salaries * v_months),
    CASE WHEN v_total_received = 0 THEN 0
         ELSE ROUND(((v_total_received - (v_monthly_salaries * v_months)) / v_total_received) * 100, 1)
    END,
    v_months;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
