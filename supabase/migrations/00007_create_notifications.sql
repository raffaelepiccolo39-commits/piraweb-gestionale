-- ============================================
-- Migration 00007: Notifications
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- Helper function: create notification
-- ============================================
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Trigger: notify on task assignment
-- ============================================
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    PERFORM create_notification(
      NEW.assigned_to,
      'task_assigned',
      'Nuovo task assegnato',
      format('Ti è stato assegnato il task: %s', NEW.title),
      format('/projects/%s', NEW.project_id),
      jsonb_build_object('task_id', NEW.id, 'project_id', NEW.project_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

-- ============================================
-- Trigger: notify on task completion
-- ============================================
CREATE OR REPLACE FUNCTION notify_task_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_project_creator UUID;
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    SELECT created_by INTO v_project_creator
    FROM projects WHERE id = NEW.project_id;

    IF v_project_creator IS NOT NULL AND v_project_creator != auth.uid() THEN
      PERFORM create_notification(
        v_project_creator,
        'task_completed',
        'Task completato',
        format('Il task "%s" è stato completato', NEW.title),
        format('/projects/%s', NEW.project_id),
        jsonb_build_object('task_id', NEW.id, 'project_id', NEW.project_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_task_completed
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_completed();

-- ============================================
-- Enable realtime for notifications
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
