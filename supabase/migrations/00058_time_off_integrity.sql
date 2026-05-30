-- ============================================
-- Migration 00058: Integrità e privacy per Ferie & Permessi
-- ============================================
-- Tre obiettivi:
--   1) Tutto ciò che riguarda l'integrità delle richieste va validato lato server,
--      così un client malizioso non può forgiare total_days, sovrapporre richieste,
--      o auto-approvarsi ferie oltre il saldo.
--   2) La RPC del calendario assenze condiviso non deve esporre il tipo "malattia"
--      ai colleghi (GDPR / art. 5 dello Statuto dei Lavoratori).
--   3) Hardening security definer con SET search_path esplicito.

-- ============================================
-- Trigger di integrità su time_off_requests
-- ============================================
CREATE OR REPLACE FUNCTION time_off_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days NUMERIC(4,1);
  v_year INT;
  v_allowance NUMERIC(4,1);
  v_used NUMERIC(4,1);
BEGIN
  -- 1) Ricalcolo total_days server-side (giorni feriali lun-ven, mezze giornate ai bordi)
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

  -- 2) Niente richieste a cavallo di due anni: il monte ferie è annuale.
  IF EXTRACT(YEAR FROM NEW.start_date) <> EXTRACT(YEAR FROM NEW.end_date) THEN
    RAISE EXCEPTION 'La richiesta non può attraversare il 31 dicembre. Crea due richieste separate.';
  END IF;

  -- 3) No sovrapposizioni con altre richieste pending/approved dello stesso utente.
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

  -- 4) Approvazione ferie: verifica saldo annuale (anche se passa tempo tra creazione e approvazione).
  IF NEW.type = 'ferie' AND NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    v_year := EXTRACT(YEAR FROM NEW.start_date)::INT;
    v_allowance := COALESCE(
      (SELECT ferie_days FROM time_off_balances WHERE user_id = NEW.user_id AND year = v_year),
      26
    );
    v_used := COALESCE((
      SELECT SUM(total_days) FROM time_off_requests
       WHERE user_id = NEW.user_id
         AND type = 'ferie'
         AND status = 'approved'
         AND id IS DISTINCT FROM NEW.id
         AND EXTRACT(YEAR FROM start_date) = v_year
    ), 0);
    IF v_used + NEW.total_days > v_allowance THEN
      RAISE EXCEPTION 'Approvazione bloccata: il saldo ferie sarebbe sforato (% gg approvati + % gg nuovi > % monte annuale).',
        v_used, NEW.total_days, v_allowance;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_off_integrity_trigger ON time_off_requests;
CREATE TRIGGER time_off_integrity_trigger
  BEFORE INSERT OR UPDATE ON time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION time_off_integrity();

-- ============================================
-- get_team_absences: privacy malattia + search_path hardening
-- I non-admin non vedono il tipo "malattia" dei colleghi.
-- ============================================
CREATE OR REPLACE FUNCTION get_team_absences(p_from DATE, p_to DATE)
RETURNS TABLE (
  request_id UUID, user_id UUID, full_name TEXT, color TEXT,
  type time_off_type, start_date DATE, end_date DATE,
  start_half BOOLEAN, end_half BOOLEAN, total_days NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.user_id, p.full_name, p.color, r.type,
         r.start_date, r.end_date, r.start_half, r.end_half, r.total_days
  FROM time_off_requests r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.status = 'approved'
    AND r.end_date >= p_from
    AND r.start_date <= p_to
    AND (
      r.type <> 'malattia'
      OR auth.uid() = r.user_id
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  ORDER BY r.start_date, p.full_name;
$$;

NOTIFY pgrst, 'reload schema';
