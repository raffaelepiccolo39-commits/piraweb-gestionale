-- Bonus ferie una-tantum.
-- Aggiunge un campo giorni-bonus per profilo, incluso nella maturazione
-- ferie (accrued_vacation_days). Il bonus si somma ai giorni maturati
-- 2/mese; available = accrued - used ne tiene conto automaticamente,
-- così come team_vacation_summary e il trigger di approvazione.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vacation_bonus_days NUMERIC(5,1) NOT NULL DEFAULT 0;

-- accrued ora = (mesi * 2) + bonus una-tantum
CREATE OR REPLACE FUNCTION public.accrued_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_start date;
  v_effective_start date;
  v_months integer;
  v_bonus numeric;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT contract_start_date, COALESCE(vacation_bonus_days, 0)
    INTO v_contract_start, v_bonus
    FROM profiles WHERE id = p_user_id;

  -- Senza data contratto non matura per tempo, ma il bonus resta valido.
  IF v_contract_start IS NULL THEN RETURN COALESCE(v_bonus, 0); END IF;

  v_effective_start := GREATEST(v_contract_start, DATE '2026-06-01');
  IF v_effective_start > v_today THEN RETURN COALESCE(v_bonus, 0); END IF;

  v_months := (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM v_effective_start))::int * 12
            + (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM v_effective_start))::int;
  IF EXTRACT(DAY FROM v_today) < EXTRACT(DAY FROM v_effective_start) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  RETURN (v_months * 2)::numeric + COALESCE(v_bonus, 0);
END;
$$;

-- Assegna il bonus di 15 giorni ai membri del team attivi (esclusi admin
-- e collaboratori terminati).
UPDATE profiles
  SET vacation_bonus_days = 15
  WHERE role <> 'admin'
    AND is_active = true
    AND terminated_at IS NULL;

NOTIFY pgrst, 'reload schema';
