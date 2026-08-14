-- ============================================================
-- Sicurezza: le RPC finanziarie SECURITY DEFINER erano aperte a tutti
-- ============================================================
--
-- Cinque funzioni del cashflow girano come SECURITY DEFINER (scavalcano la
-- RLS) e NON controllavano chi le chiama. Per il default di Postgres
-- (EXECUTE TO PUBLIC) chiunque avesse un token autenticato — un dipendente
-- non-admin, o persino un CLIENTE del portale — poteva invocarle via
-- PostgREST e leggere dati riservati:
--
--   get_monthly_expenses    -> nome, ruolo e STIPENDIO di ogni dipendente
--   get_profit_loss_summary -> ricavi, costo del personale, margini
--   get_revenue_per_client  -> ricavi e canone di TUTTI i clienti (cross-tenant)
--   get_cashflow_summary    -> atteso/incassato/sospeso dell'agenzia
--   get_cashflow_monthly    -> stesso quadro, mese per mese
--
-- get_cashflow_summary/monthly AVEVANO il controllo admin nella 00030: e'
-- andato perso in una riscrittura successiva. Le altre non l'hanno mai avuto.
--
-- Fix, identico per tutte: un guard `is_admin()` subito dopo BEGIN, piu' REVOKE
-- del permesso a PUBLIC e anon. Il corpo e' COPIATO senza modifiche dalle
-- ultime definizioni live (20260630d, 20260706b, 20260723, 20260723b): l'unica
-- aggiunta e' la riga del guard. Nel gestionale queste RPC le chiama solo la
-- pagina Cashflow, che e' gia' admin-only, quindi il guard non toglie nulla a
-- chi le usa legittimamente.
-- ============================================================

-- ── get_monthly_expenses (da 20260723b) ──────────────────────
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
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

-- ── get_profit_loss_summary (da 20260723) ────────────────────
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  v_months := GREATEST(1, EXTRACT(MONTH FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER +
    EXTRACT(YEAR FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER * 12 + 1);

  -- Stipendio mensile corrente (solo per display)
  SELECT COALESCE(SUM(ec.salary), 0) INTO v_monthly_salaries
  FROM employee_compensation ec
  JOIN profiles p ON p.id = ec.profile_id
  WHERE p.is_active = true AND p.role != 'admin'
    AND ec.salary IS NOT NULL AND ec.salary > 0;

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
        SELECT COALESCE(SUM(ec.salary), 0)
        FROM employee_compensation ec
        JOIN profiles pr ON pr.id = ec.profile_id
        WHERE pr.is_active = true AND pr.role != 'admin'
          AND ec.salary IS NOT NULL AND ec.salary > 0
          AND (ec.contract_start_date IS NULL
               OR ec.contract_start_date <= (m + INTERVAL '1 month - 1 day')::date)
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

-- ── get_revenue_per_client (da 20260630d) ────────────────────
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
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

-- ── get_cashflow_summary (da 20260630d) ──────────────────────
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
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

-- ── get_cashflow_monthly (da 20260706b, ultima def live) ─────
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
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

-- ── Togliere il permesso al pubblico ─────────────────────────
-- Il guard basta a fermare i non-admin, questo e' cintura+bretelle: nemmeno il
-- ruolo anonimo puo' piu' invocarle.
REVOKE EXECUTE ON FUNCTION get_monthly_expenses(date, date)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_profit_loss_summary(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_revenue_per_client(date, date)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_cashflow_summary(date, date)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_cashflow_monthly(date, date)    FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
