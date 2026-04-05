-- ============================================
-- Migration 00019: Dettaglio presenze mensile per calendario
-- ============================================

CREATE OR REPLACE FUNCTION get_attendance_monthly_details(
  p_user_id UUID DEFAULT NULL,
  p_month INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT,
  p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS TABLE (
  user_id UUID, full_name TEXT, role user_role,
  day_date DATE, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ,
  lunch_start TIMESTAMPTZ, lunch_end TIMESTAMPTZ,
  total_hours NUMERIC, status attendance_status
) AS $$
DECLARE
  v_start DATE; v_end DATE;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month')::DATE;
  RETURN QUERY
  SELECT ar.user_id, p.full_name, p.role, ar.date,
    ar.clock_in, ar.clock_out, ar.lunch_start, ar.lunch_end,
    ar.total_hours, ar.status
  FROM attendance_records ar
  JOIN profiles p ON p.id = ar.user_id
  WHERE ar.date >= v_start AND ar.date < v_end
    AND (p_user_id IS NULL OR ar.user_id = p_user_id)
  ORDER BY p.full_name, ar.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
