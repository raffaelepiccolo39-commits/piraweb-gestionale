-- ============================================
-- Migration 00008: Activity Log (for dashboard analytics)
-- ============================================

CREATE TYPE activity_action AS ENUM (
  'created',
  'updated',
  'deleted',
  'completed',
  'assigned',
  'commented',
  'status_changed'
);

CREATE TYPE activity_entity AS ENUM (
  'client',
  'project',
  'task',
  'post',
  'ai_script'
);

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action activity_action NOT NULL,
  entity_type activity_entity NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- RLS for activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity viewable by admins"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

CREATE POLICY "System can insert activity"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- Helper: log activity
-- ============================================
CREATE OR REPLACE FUNCTION log_activity(
  p_user_id UUID,
  p_action activity_action,
  p_entity_type activity_entity,
  p_entity_id UUID,
  p_entity_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, metadata)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_entity_name, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Dashboard views
-- ============================================

-- Tasks per status count
CREATE OR REPLACE FUNCTION get_task_stats()
RETURNS TABLE (
  status task_status,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT t.status, COUNT(*)
  FROM tasks t
  GROUP BY t.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tasks per user
CREATE OR REPLACE FUNCTION get_tasks_per_user()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  role user_role,
  total_tasks BIGINT,
  completed_tasks BIGINT,
  in_progress_tasks BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.role,
    COUNT(t.id),
    COUNT(t.id) FILTER (WHERE t.status = 'done'),
    COUNT(t.id) FILTER (WHERE t.status = 'in_progress')
  FROM profiles p
  LEFT JOIN tasks t ON t.assigned_to = p.id
  WHERE p.is_active = true
  GROUP BY p.id, p.full_name, p.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Project progress
CREATE OR REPLACE FUNCTION get_project_progress()
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  total_tasks BIGINT,
  completed_tasks BIGINT,
  progress_pct NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    COUNT(t.id),
    COUNT(t.id) FILTER (WHERE t.status = 'done'),
    CASE
      WHEN COUNT(t.id) = 0 THEN 0
      ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::NUMERIC / COUNT(t.id)) * 100, 1)
    END
  FROM projects pr
  LEFT JOIN tasks t ON t.project_id = pr.id
  WHERE pr.status IN ('active', 'draft')
  GROUP BY pr.id, pr.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
