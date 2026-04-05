-- ============================================
-- Migration 00018: Sistema Presenze
-- ============================================

DO $$ BEGIN CREATE TYPE attendance_status AS ENUM ('working', 'lunch_break', 'completed', 'absent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  clock_in TIMESTAMPTZ,
  lunch_start TIMESTAMPTZ,
  lunch_end TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  status attendance_status NOT NULL DEFAULT 'working',
  total_hours NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(date, status);

DROP TRIGGER IF EXISTS set_attendance_updated_at ON attendance_records;
CREATE TRIGGER set_attendance_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Calcolo automatico ore totali
CREATE OR REPLACE FUNCTION calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0
      - CASE
          WHEN NEW.lunch_start IS NOT NULL AND NEW.lunch_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (NEW.lunch_end - NEW.lunch_start)) / 3600.0
          ELSE 0
        END,
      2
    );
  ELSE
    NEW.total_hours := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calc_attendance_hours ON attendance_records;
CREATE TRIGGER calc_attendance_hours
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION calculate_attendance_hours();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own attendance" ON attendance_records;
CREATE POLICY "Users can view own attendance" ON attendance_records FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Users can insert own attendance" ON attendance_records;
CREATE POLICY "Users can insert own attendance" ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own attendance" ON attendance_records;
CREATE POLICY "Users can update own attendance" ON attendance_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update any attendance" ON attendance_records;
CREATE POLICY "Admins can update any attendance" ON attendance_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Stato team oggi
-- ============================================
CREATE OR REPLACE FUNCTION get_team_attendance_today()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  role user_role,
  avatar_url TEXT,
  status attendance_status,
  clock_in TIMESTAMPTZ,
  lunch_start TIMESTAMPTZ,
  lunch_end TIMESTAMPTZ,
  clock_out TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.full_name, p.role, p.avatar_url,
    COALESCE(ar.status, 'absent'::attendance_status),
    ar.clock_in, ar.lunch_start, ar.lunch_end, ar.clock_out
  FROM profiles p
  LEFT JOIN attendance_records ar ON ar.user_id = p.id AND ar.date = CURRENT_DATE
  WHERE p.is_active = true
  ORDER BY
    CASE COALESCE(ar.status, 'absent')
      WHEN 'working' THEN 1 WHEN 'lunch_break' THEN 2 WHEN 'completed' THEN 3 ELSE 4
    END, p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Report settimanale
-- ============================================
CREATE OR REPLACE FUNCTION get_attendance_weekly_report(
  p_user_id UUID DEFAULT NULL,
  p_week_start DATE DEFAULT date_trunc('week', CURRENT_DATE)::DATE
)
RETURNS TABLE (
  user_id UUID, full_name TEXT, role user_role,
  day_date DATE, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ,
  lunch_start TIMESTAMPTZ, lunch_end TIMESTAMPTZ,
  total_hours NUMERIC, status attendance_status
) AS $$
BEGIN
  RETURN QUERY
  SELECT ar.user_id, p.full_name, p.role, ar.date,
    ar.clock_in, ar.clock_out, ar.lunch_start, ar.lunch_end,
    ar.total_hours, ar.status
  FROM attendance_records ar
  JOIN profiles p ON p.id = ar.user_id
  WHERE ar.date >= p_week_start AND ar.date < p_week_start + INTERVAL '7 days'
    AND (p_user_id IS NULL OR ar.user_id = p_user_id)
  ORDER BY p.full_name, ar.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Report mensile
-- ============================================
CREATE OR REPLACE FUNCTION get_attendance_monthly_report(
  p_user_id UUID DEFAULT NULL,
  p_month INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT,
  p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS TABLE (
  user_id UUID, full_name TEXT, role user_role,
  days_worked BIGINT, total_hours NUMERIC, avg_hours_per_day NUMERIC,
  late_arrivals BIGINT, early_departures BIGINT
) AS $$
DECLARE
  v_start DATE; v_end DATE;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month')::DATE;
  RETURN QUERY
  SELECT ar.user_id, p.full_name, p.role,
    COUNT(*) FILTER (WHERE ar.clock_in IS NOT NULL),
    COALESCE(SUM(ar.total_hours), 0),
    CASE WHEN COUNT(*) FILTER (WHERE ar.clock_in IS NOT NULL) > 0
      THEN ROUND(COALESCE(SUM(ar.total_hours), 0) / COUNT(*) FILTER (WHERE ar.clock_in IS NOT NULL), 2)
      ELSE 0 END,
    COUNT(*) FILTER (WHERE ar.clock_in IS NOT NULL AND ar.clock_in::TIME > '09:15:00'),
    COUNT(*) FILTER (WHERE ar.clock_out IS NOT NULL AND ar.clock_out::TIME < '17:45:00')
  FROM attendance_records ar
  JOIN profiles p ON p.id = ar.user_id
  WHERE ar.date >= v_start AND ar.date < v_end
    AND (p_user_id IS NULL OR ar.user_id = p_user_id)
  GROUP BY ar.user_id, p.full_name, p.role
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
