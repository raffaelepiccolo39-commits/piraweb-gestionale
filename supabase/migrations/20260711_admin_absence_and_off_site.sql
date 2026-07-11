-- ============================================
-- Migration 20260711: assenze registrate dall'admin + giornata "fuori ufficio"
-- ============================================
-- Contesto: quando un collaboratore non timbra (non fa il login) l'admin deve
-- poter:
--   1) segnalare che è in MALATTIA (o altra assenza) al posto suo, già approvata,
--      usando il sistema Ferie & Permessi esistente (time_off_requests);
--   2) registrare le ore di una giornata lavorata FUORI UFFICIO (trasferta / da
--      remoto), distinguibile nei report dalla presenza normale in sede.

-- ─────────────────────────────────────────────
-- 1) L'admin può inserire assenze per conto di un collaboratore
-- ─────────────────────────────────────────────
-- La 00057 permetteva l'INSERT solo a proprio nome (user_id = auth.uid()).
-- Aggiungiamo la strada admin: così l'admin crea una malattia/permesso/ferie
-- direttamente approvata per un altro dipendente.
DROP POLICY IF EXISTS "time_off insert" ON time_off_requests;
CREATE POLICY "time_off insert" ON time_off_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ─────────────────────────────────────────────
-- 2) Giornata "fuori ufficio" sulle presenze
-- ─────────────────────────────────────────────
-- Le ore restano quelle vere calcolate dal trigger sugli orari entrata/uscita;
-- off_site è solo un'etichetta per distinguere la giornata nei report.
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS off_site BOOLEAN NOT NULL DEFAULT false;

-- Il report settimanale deve portare anche off_site per mostrarne il badge.
-- RETURNS TABLE cambia firma → serve DROP prima di ricreare.
DROP FUNCTION IF EXISTS get_attendance_weekly_report(UUID, DATE);
CREATE FUNCTION get_attendance_weekly_report(
  p_user_id UUID DEFAULT NULL,
  p_week_start DATE DEFAULT date_trunc('week', CURRENT_DATE)::DATE
)
RETURNS TABLE (
  user_id UUID, full_name TEXT, role user_role,
  day_date DATE, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ,
  lunch_start TIMESTAMPTZ, lunch_end TIMESTAMPTZ,
  total_hours NUMERIC, status attendance_status, off_site BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT ar.user_id, p.full_name, p.role, ar.date,
    ar.clock_in, ar.clock_out, ar.lunch_start, ar.lunch_end,
    ar.total_hours, ar.status, ar.off_site
  FROM attendance_records ar
  JOIN profiles p ON p.id = ar.user_id
  WHERE ar.date >= p_week_start AND ar.date < p_week_start + INTERVAL '7 days'
    AND (p_user_id IS NULL OR ar.user_id = p_user_id)
  ORDER BY p.full_name, ar.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
