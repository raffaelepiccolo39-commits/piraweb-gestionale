-- Fix cashflow: get_cashflow_monthly deve contare SOLO i contratti attivi,
-- come già fanno get_cashflow_summary e get_revenue_per_client.
-- Senza il filtro cc.status = 'active', il grafico mensile includeva le rate
-- future di contratti completed/scaduti (es. residui di rinnovo o contratti
-- di test), gonfiando "Da incassare"/"Atteso" e non tornando con le card KPI.

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
    AND cc.status = 'active'
    AND c.paused_at IS NULL
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
