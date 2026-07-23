-- ============================================================
-- Ferie e costo del personale: le funzioni leggevano ancora da profiles
-- ============================================================
--
-- Il 22/07 abbiamo spostato salary/iban/contract_type/contract_start_date da
-- `profiles` a `employee_compensation` per rendere segreti gli stipendi. Il
-- codice dell'app è stato ripuntato, ma TRE funzioni del database leggevano
-- ancora quelle colonne dal vecchio posto e ora vanno in errore
-- ("column contract_start_date/salary does not exist"):
--
--   1. accrued_vacation_days    -> giorni di ferie maturati (per tutti)
--   2. team_vacation_summary    -> il riepilogo ferie del TEAM (l'admin non
--                                  vedeva più le ferie dei dipendenti)
--   3. get_profit_loss_summary  -> il costo del personale nel cashflow / P&L
--
-- Sintomo reale: l'admin non vede più le ferie del team e sparisce il costo
-- del personale dal cashflow; i dipendenti vedono le proprie richieste perché
-- quelle non passano da queste funzioni.
--
-- Fix: leggere contract_start_date e salary da employee_compensation (join su
-- profile_id). Le funzioni sono SECURITY DEFINER, quindi leggono la tabella
-- riservata senza problemi di RLS. Nessun dato cambia: cambia solo DA DOVE
-- viene letto.
-- ============================================================

-- ── 1. Giorni di ferie maturati ──
-- contract_start_date da employee_compensation; vacation_bonus_days resta su profiles.
CREATE OR REPLACE FUNCTION public.accrued_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_contract_start date;
  v_effective_start date;
  v_months integer;
  v_bonus numeric;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT ec.contract_start_date, COALESCE(p.vacation_bonus_days, 0)
    INTO v_contract_start, v_bonus
    FROM profiles p
    LEFT JOIN employee_compensation ec ON ec.profile_id = p.id
    WHERE p.id = p_user_id;

  IF v_contract_start IS NULL THEN RETURN LEAST(COALESCE(v_bonus, 0), 24); END IF;

  v_effective_start := GREATEST(v_contract_start, DATE '2026-06-01');
  IF v_effective_start > v_today THEN RETURN LEAST(COALESCE(v_bonus, 0), 24); END IF;

  v_months := (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM v_effective_start))::int * 12
            + (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM v_effective_start))::int;
  IF EXTRACT(DAY FROM v_today) < EXTRACT(DAY FROM v_effective_start) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  -- 2 giorni al mese + bonus, ma mai oltre 24 giorni.
  RETURN LEAST((v_months * 2)::numeric + COALESCE(v_bonus, 0), 24);
END;
$fn$;

-- ── 2. Riepilogo ferie del team ──
-- contract_start_date da employee_compensation (LEFT JOIN: chi non ha ancora
-- una riga compensation resta comunque in elenco, con data nulla).
CREATE OR REPLACE FUNCTION public.team_vacation_summary()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  contract_start_date date,
  accrued numeric,
  used numeric,
  available numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    p.full_name,
    ec.contract_start_date,
    public.accrued_vacation_days(p.id),
    public.used_vacation_days(p.id),
    public.available_vacation_days(p.id)
  FROM profiles p
  LEFT JOIN employee_compensation ec ON ec.profile_id = p.id
  WHERE p.is_active = true
    AND p.role <> 'admin'
  ORDER BY p.full_name;
$$;

-- ── 3. Conto economico: costo del personale ──
-- salary e contract_start_date da employee_compensation.
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

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verifica
-- ============================================================
SELECT 'accrued (un dipendente)' AS controllo,
       public.accrued_vacation_days((SELECT id FROM profiles WHERE role <> 'admin' AND is_active LIMIT 1))::text AS valore
UNION ALL
SELECT 'righe team_vacation_summary', count(*)::text FROM public.team_vacation_summary()
UNION ALL
SELECT 'costo personale mensile (P&L)', monthly_salary_cost::text FROM get_profit_loss_summary();
