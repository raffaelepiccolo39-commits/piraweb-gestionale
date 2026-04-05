-- ============================================
-- Migration 00011: Analytics Functions
-- ============================================

-- Per-user efficiency metrics for a date range
CREATE OR REPLACE FUNCTION get_team_efficiency(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  role user_role,
  tasks_assigned BIGINT,
  tasks_completed BIGINT,
  tasks_on_time BIGINT,
  tasks_overdue BIGINT,
  completion_rate NUMERIC,
  on_time_rate NUMERIC,
  avg_completion_hours NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.role,
    COUNT(t.id),
    COUNT(t.id) FILTER (WHERE t.status = 'done'),
    COUNT(t.id) FILTER (WHERE t.status = 'done' AND (t.deadline IS NULL OR t.updated_at <= t.deadline)),
    COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.deadline IS NOT NULL AND t.updated_at > t.deadline),
    CASE WHEN COUNT(t.id) = 0 THEN 0
         ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::NUMERIC / COUNT(t.id)) * 100, 1)
    END,
    CASE WHEN COUNT(t.id) FILTER (WHERE t.status = 'done') = 0 THEN 0
         ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done' AND (t.deadline IS NULL OR t.updated_at <= t.deadline))::NUMERIC /
               NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'done'), 0)) * 100, 1)
    END,
    ROUND(AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600)
          FILTER (WHERE t.status = 'done'), 1)
  FROM profiles p
  LEFT JOIN tasks t ON t.assigned_to = p.id
    AND t.created_at >= p_start_date
    AND t.created_at < p_end_date
  WHERE p.is_active = true
  GROUP BY p.id, p.full_name, p.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Time-series productivity trend for charts
CREATE OR REPLACE FUNCTION get_productivity_trend(
  p_user_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW(),
  p_interval TEXT DEFAULT 'day'
)
RETURNS TABLE (
  period_start TIMESTAMPTZ,
  tasks_completed BIGINT,
  tasks_assigned BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc(p_interval, t.updated_at) AS ps,
    COUNT(t.id) FILTER (WHERE t.status = 'done'),
    COUNT(t.id)
  FROM tasks t
  WHERE t.updated_at >= p_start_date
    AND t.updated_at < p_end_date
    AND (p_user_id IS NULL OR t.assigned_to = p_user_id)
  GROUP BY ps
  ORDER BY ps;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aggregate team overview stats
CREATE OR REPLACE FUNCTION get_team_overview_stats(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_tasks BIGINT,
  completed_tasks BIGINT,
  overdue_tasks BIGINT,
  avg_completion_rate NUMERIC,
  avg_on_time_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(t.id),
    COUNT(t.id) FILTER (WHERE t.status = 'done'),
    COUNT(t.id) FILTER (WHERE t.deadline IS NOT NULL AND t.deadline < NOW() AND t.status != 'done'),
    CASE WHEN COUNT(t.id) = 0 THEN 0
         ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::NUMERIC / COUNT(t.id)) * 100, 1)
    END,
    CASE WHEN COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.deadline IS NOT NULL) = 0 THEN 0
         ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.updated_at <= t.deadline)::NUMERIC /
               NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.deadline IS NOT NULL), 0)) * 100, 1)
    END
  FROM tasks t
  WHERE t.created_at >= p_start_date AND t.created_at < p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
