-- ============================================================
-- Migration 00047: Audit fixes
-- ============================================================

-- Fix 1: Restrict meeting_action_items INSERT policy
DROP POLICY IF EXISTS "Authenticated can create action items" ON meeting_action_items;
CREATE POLICY "Meeting participants can create action items" ON meeting_action_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_action_items.meeting_id
      AND (m.created_by = auth.uid() OR auth.uid() = ANY(m.attendees)
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

-- Fix 2: Sync logged_hours for existing tasks
UPDATE tasks SET logged_hours = COALESCE((
  SELECT SUM(duration_minutes) / 60.0
  FROM time_entries
  WHERE task_id = tasks.id AND duration_minutes IS NOT NULL
), 0)
WHERE EXISTS (SELECT 1 FROM time_entries WHERE task_id = tasks.id);
