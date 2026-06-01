-- Maturazione automatica ferie: 2 giorni al mese dalla contract_start_date.
-- Cutoff: 2026-06-01 (data attivazione). Le richieste approvate prima di
-- questa data non vengono conteggiate, e nessuno matura per il periodo
-- precedente al cutoff (reset). Conteggio cumulativo, niente azzeramento
-- a gennaio.

-- ============================================
-- Giorni maturati (cumulativo)
-- ============================================
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
  v_today date := CURRENT_DATE;
BEGIN
  SELECT contract_start_date INTO v_contract_start FROM profiles WHERE id = p_user_id;
  IF v_contract_start IS NULL THEN RETURN 0; END IF;

  v_effective_start := GREATEST(v_contract_start, DATE '2026-06-01');
  IF v_effective_start > v_today THEN RETURN 0; END IF;

  v_months := (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM v_effective_start))::int * 12
            + (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM v_effective_start))::int;
  IF EXTRACT(DAY FROM v_today) < EXTRACT(DAY FROM v_effective_start) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  RETURN (v_months * 2)::numeric;
END;
$$;

-- ============================================
-- Giorni ferie già goduti (status approved, post cutoff)
-- ============================================
CREATE OR REPLACE FUNCTION public.used_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(total_days), 0)::numeric
  FROM time_off_requests
  WHERE user_id = p_user_id
    AND type = 'ferie'
    AND status = 'approved'
    AND start_date >= DATE '2026-06-01';
$$;

-- ============================================
-- Giorni disponibili = maturati - goduti (non scende sotto 0 per safety)
-- ============================================
CREATE OR REPLACE FUNCTION public.available_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    public.accrued_vacation_days(p_user_id) - public.used_vacation_days(p_user_id),
    0
  );
$$;

-- ============================================
-- Riepilogo team per admin (in una sola query)
-- ============================================
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
    p.contract_start_date,
    public.accrued_vacation_days(p.id),
    public.used_vacation_days(p.id),
    public.available_vacation_days(p.id)
  FROM profiles p
  WHERE p.is_active = true
    AND p.role <> 'admin'
  ORDER BY p.full_name;
$$;

-- Permessi
REVOKE EXECUTE ON FUNCTION public.accrued_vacation_days(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.used_vacation_days(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.available_vacation_days(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_vacation_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accrued_vacation_days(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.used_vacation_days(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.available_vacation_days(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_vacation_summary() TO authenticated;

-- ============================================
-- Aggiorna trigger time_off_integrity: usa available_vacation_days al
-- posto di ferie_days statico di time_off_balances.
-- La tabella time_off_balances resta in piedi ma diventa inutile
-- (l'UI di edit verrà rimossa lato app).
-- ============================================
CREATE OR REPLACE FUNCTION time_off_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days NUMERIC(4,1);
  v_available NUMERIC(4,1);
  v_accrued NUMERIC(4,1);
BEGIN
  -- 1) Ricalcolo total_days (giorni feriali lun-ven, mezze giornate ai bordi)
  v_days := (
    SELECT count(*)::NUMERIC
    FROM generate_series(NEW.start_date::timestamp, NEW.end_date::timestamp, '1 day'::interval) AS d
    WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
  );

  IF NEW.start_half AND EXTRACT(DOW FROM NEW.start_date) NOT IN (0, 6) THEN
    v_days := v_days - 0.5;
  END IF;
  IF NEW.end_half AND NEW.end_date <> NEW.start_date
     AND EXTRACT(DOW FROM NEW.end_date) NOT IN (0, 6) THEN
    v_days := v_days - 0.5;
  END IF;

  NEW.total_days := GREATEST(v_days, 0);

  -- 2) No richieste a cavallo di due anni (il monte è annuale concettualmente)
  IF EXTRACT(YEAR FROM NEW.start_date) <> EXTRACT(YEAR FROM NEW.end_date) THEN
    RAISE EXCEPTION 'La richiesta non può attraversare il 31 dicembre. Crea due richieste separate.';
  END IF;

  -- 3) No sovrapposizioni con altre richieste pending/approved dello stesso utente
  IF NEW.status IN ('pending', 'approved') AND EXISTS (
    SELECT 1
    FROM time_off_requests t
    WHERE t.user_id = NEW.user_id
      AND t.id IS DISTINCT FROM NEW.id
      AND t.status IN ('pending', 'approved')
      AND daterange(t.start_date, t.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Le date si sovrappongono a un''altra richiesta del dipendente.';
  END IF;

  -- 4) Approvazione ferie: verifica saldo automatico maturato
  IF NEW.type = 'ferie' AND NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    v_available := public.available_vacation_days(NEW.user_id);
    IF v_available < NEW.total_days THEN
      v_accrued := public.accrued_vacation_days(NEW.user_id);
      RAISE EXCEPTION 'Approvazione bloccata: il dipendente ha % gg maturati e % gg disponibili, la richiesta ne usa %.',
        v_accrued, v_available, NEW.total_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
