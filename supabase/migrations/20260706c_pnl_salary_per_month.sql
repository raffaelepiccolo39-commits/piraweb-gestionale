-- Fix P&L: costo stipendi calcolato MESE PER MESE, non "stipendio attuale × n mesi".
-- Per ogni mese del periodo usa il payslip reale se presente, altrimenti la
-- composizione del team a quel mese (dipendenti attivi il cui contratto è
-- iniziato entro fine mese). Stessa logica del grafico cashflow → i due
-- coincidono. Aggiunge anche il filtro clienti non in pausa ai ricavi.

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
  v_salary_period NUMERIC;
BEGIN
  v_months := GREATEST(1, EXTRACT(MONTH FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER +
    EXTRACT(YEAR FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER * 12 + 1);

  -- Stipendio mensile corrente (solo per display)
  SELECT COALESCE(SUM(salary), 0) INTO v_monthly_salaries
  FROM profiles
  WHERE is_active = true AND role != 'admin' AND salary IS NOT NULL AND salary > 0;

  -- Ricavi (contratti attivi, clienti non in pausa)
  SELECT
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0)
  INTO v_total_expected, v_total_received, v_total_pending
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  JOIN clients c ON c.id = cc.client_id
  WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date
    AND cc.status = 'active' AND c.paused_at IS NULL;

  -- Costo stipendi periodo, sommato mese per mese
  SELECT COALESCE(SUM(month_cost), 0) INTO v_salary_period
  FROM (
    SELECT COALESCE(
      NULLIF((
        SELECT SUM(ps.lordo_mensile) FROM payslips ps
        WHERE date_trunc('month', ps.month) = m
      ), 0),
      (
        SELECT COALESCE(SUM(pr.salary), 0) FROM profiles pr
        WHERE pr.is_active = true AND pr.role != 'admin'
          AND pr.salary IS NOT NULL AND pr.salary > 0
          AND (pr.contract_start_date IS NULL
               OR pr.contract_start_date <= (m + INTERVAL '1 month - 1 day')::date)
      )
    ) AS month_cost
    FROM generate_series(
      date_trunc('month', p_start_date),
      date_trunc('month', p_end_date),
      INTERVAL '1 month'
    ) AS m
  ) sub;

  RETURN QUERY SELECT
    v_total_expected,
    v_total_received,
    v_total_pending,
    v_monthly_salaries,
    v_salary_period,
    v_total_expected - v_salary_period,
    CASE WHEN v_total_expected = 0 THEN 0
         ELSE ROUND(((v_total_expected - v_salary_period) / v_total_expected) * 100, 1) END,
    v_total_received - v_salary_period,
    CASE WHEN v_total_received = 0 THEN 0
         ELSE ROUND(((v_total_received - v_salary_period) / v_total_received) * 100, 1) END,
    v_months;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
