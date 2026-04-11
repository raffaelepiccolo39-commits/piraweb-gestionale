-- ============================================================
-- Migration 00039: Security RLS Fixes
-- Fix overly permissive policies on tasks, knowledge_base, clients
-- Add missing DELETE policies
-- Add auth checks on analytics functions
-- ============================================================

-- 1. FIX TASKS: restrict visibility to project members + admin + assignee
DROP POLICY IF EXISTS "Tasks viewable by all authenticated users" ON tasks;
CREATE POLICY "Tasks viewable by authorized users" ON tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()
    )
  );

-- 2. FIX CLIENT KNOWLEDGE BASE: restrict to project team members + admin
DROP POLICY IF EXISTS "Authenticated can view knowledge base" ON client_knowledge_base;
CREATE POLICY "Knowledge base viewable by authorized users" ON client_knowledge_base
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = client_knowledge_base.client_id
      AND pm.user_id = auth.uid()
    )
  );

-- 3. FIX CLIENTS: restrict visibility to users working on client projects + admin
DROP POLICY IF EXISTS "Clients viewable by all authenticated users" ON clients;
CREATE POLICY "Clients viewable by authorized users" ON clients
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = clients.id
      AND pm.user_id = auth.uid()
    )
  );

-- 4. ADD MISSING DELETE POLICY on chat_messages (sender or admin can delete)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can delete own messages'
  ) THEN
    CREATE POLICY "Users can delete own messages" ON chat_messages
      FOR DELETE TO authenticated
      USING (
        sender_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- 5. FIX ANALYTICS FUNCTIONS: add admin authorization checks

CREATE OR REPLACE FUNCTION get_team_efficiency(
  p_start_date DATE DEFAULT (now() - INTERVAL '30 days')::DATE,
  p_end_date DATE DEFAULT now()::DATE
)
RETURNS TABLE (
  member_id UUID,
  member_name TEXT,
  member_role TEXT,
  total_tasks BIGINT,
  completed_tasks BIGINT,
  completion_rate NUMERIC,
  on_time_rate NUMERIC,
  avg_completion_days NUMERIC
) AS $$
BEGIN
  -- Only admin can view team efficiency
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Solo gli amministratori possono visualizzare le statistiche del team';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.role::TEXT,
    COUNT(t.id),
    COUNT(t.id) FILTER (WHERE t.status = 'done'),
    CASE WHEN COUNT(t.id) = 0 THEN 0
         ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done') * 100.0) / COUNT(t.id), 1)
    END,
    CASE WHEN COUNT(t.id) FILTER (WHERE t.status = 'done') = 0 THEN 0
         ELSE ROUND(
           (COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.deadline IS NOT NULL AND t.updated_at::DATE <= t.deadline) * 100.0) /
           NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.deadline IS NOT NULL), 0), 1)
    END,
    COALESCE(
      ROUND(AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400) FILTER (WHERE t.status = 'done'), 1),
      0
    )
  FROM profiles p
  LEFT JOIN tasks t ON t.assigned_to = p.id
    AND t.created_at::DATE >= p_start_date
    AND t.created_at::DATE <= p_end_date
  WHERE p.is_active = true
  GROUP BY p.id, p.full_name, p.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_productivity_trend(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  day DATE,
  tasks_created BIGINT,
  tasks_completed BIGINT
) AS $$
BEGIN
  -- Only admin can view productivity trends
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Solo gli amministratori possono visualizzare i trend di produttività';
  END IF;

  RETURN QUERY
  SELECT
    d.day::DATE,
    COUNT(t.id) FILTER (WHERE t.created_at::DATE = d.day),
    COUNT(t2.id) FILTER (WHERE t2.updated_at::DATE = d.day AND t2.status = 'done')
  FROM generate_series(
    (now() - (p_days || ' days')::INTERVAL)::DATE,
    now()::DATE,
    '1 day'::INTERVAL
  ) AS d(day)
  LEFT JOIN tasks t ON t.created_at::DATE = d.day
  LEFT JOIN tasks t2 ON t2.updated_at::DATE = d.day AND t2.status = 'done'
  GROUP BY d.day
  ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. FIX generate_contract_payments: don't delete already-paid payments
CREATE OR REPLACE FUNCTION generate_contract_payments(p_contract_id UUID)
RETURNS VOID AS $$
DECLARE
  v_contract RECORD;
BEGIN
  SELECT * INTO v_contract FROM client_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratto non trovato';
  END IF;

  -- Only delete unpaid payments
  DELETE FROM client_payments WHERE contract_id = p_contract_id AND is_paid = false;

  -- Insert missing months only
  INSERT INTO client_payments (contract_id, month_index, due_date, amount)
  SELECT p_contract_id, i,
    v_contract.start_date + (i || ' months')::INTERVAL,
    v_contract.monthly_fee
  FROM generate_series(0, v_contract.duration_months - 1) AS i
  WHERE NOT EXISTS (
    SELECT 1 FROM client_payments cp
    WHERE cp.contract_id = p_contract_id AND cp.month_index = i
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Add missing composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_activity_log_user_entity_time
  ON activity_log(user_id, entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_payments_date_status
  ON client_payments(due_date, is_paid, contract_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_recent
  ON notifications(user_id, created_at DESC) WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_attendance_date_range
  ON attendance_records(date DESC, user_id);
