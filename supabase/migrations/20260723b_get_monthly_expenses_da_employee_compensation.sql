-- ============================================================
-- Costi Dipendenti (cashflow): anche get_monthly_expenses leggeva da profiles
-- ============================================================
--
-- Quarta funzione rimasta indietro dopo lo spostamento stipendi -> employee_compensation.
-- get_monthly_expenses alimenta la card "Costi Dipendenti" del cashflow
-- (badge €/mese + elenco dei dipendenti con paga). Leggeva p.salary e
-- p.contract_type da profiles: ora vanno in errore ("column p.salary does not
-- exist") e la card resta vuota ("Nessun dipendente con paga registrata"),
-- mentre il margine in alto (get_profit_loss_summary, già corretto) mostra
-- comunque il costo.
--
-- Fix: leggere salary e contract_type da employee_compensation (join su
-- profile_id). SECURITY DEFINER, quindi legge la tabella riservata.
-- ============================================================

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
    COALESCE(SUM(ec.salary), 0),
    COUNT(p.id),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'role', p.role,
      'salary', ec.salary,
      'contract_type', ec.contract_type
    ) ORDER BY ec.salary DESC) FILTER (WHERE ec.salary IS NOT NULL), '[]'::jsonb)
  FROM profiles p
  JOIN employee_compensation ec ON ec.profile_id = p.id
  WHERE p.is_active = true
    AND p.role != 'admin'
    AND ec.salary IS NOT NULL
    AND ec.salary > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

-- Verifica
SELECT total_monthly_salaries, num_employees FROM get_monthly_expenses();
