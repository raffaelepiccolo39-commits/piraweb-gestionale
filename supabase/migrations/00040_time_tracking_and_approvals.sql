-- ============================================================
-- Migration 00040: Time Tracking & Content Approval Workflow
-- ============================================================

-- ==================== TIME TRACKING ====================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER, -- calculated or manual
  is_running BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_task ON time_entries(task_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_running ON time_entries(user_id, is_running) WHERE is_running = true;
CREATE INDEX idx_time_entries_date ON time_entries(started_at DESC);

CREATE TRIGGER set_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate duration on stop
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND NEW.is_running = false AND NEW.duration_minutes IS NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_time_entry_duration
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

-- Add logged_hours to tasks (computed from time_entries)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS logged_hours NUMERIC(7,2) DEFAULT 0;

-- Function to update logged_hours on task
CREATE OR REPLACE FUNCTION update_task_logged_hours()
RETURNS TRIGGER AS $$
DECLARE
  v_task_id UUID;
  v_total NUMERIC;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  SELECT COALESCE(SUM(duration_minutes), 0) / 60.0
  INTO v_total
  FROM time_entries
  WHERE task_id = v_task_id AND duration_minutes IS NOT NULL;

  UPDATE tasks SET logged_hours = v_total WHERE id = v_task_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_task_logged_hours
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_task_logged_hours();

-- RLS for time_entries
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Time entries viewable by project members and admin"
  ON time_entries FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE t.id = time_entries.task_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own time entries"
  ON time_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own time entries"
  ON time_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own time entries or admin"
  ON time_entries FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== CONTENT APPROVAL ====================

CREATE TYPE IF NOT EXISTS approval_status AS ENUM ('pending', 'approved', 'rejected', 'revision_requested');

-- If type already exists, ignore error
DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'revision_requested');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS content_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_url TEXT, -- link to content (Figma, Google Docs, Canva, etc.)
  attachment_urls TEXT[] DEFAULT '{}',
  status approval_status NOT NULL DEFAULT 'pending',
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  review_comment TEXT,
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_approvals_task ON content_approvals(task_id);
CREATE INDEX idx_content_approvals_status ON content_approvals(status);
CREATE INDEX idx_content_approvals_share ON content_approvals(share_token) WHERE share_token IS NOT NULL;

CREATE TRIGGER set_content_approvals_updated_at
  BEFORE UPDATE ON content_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS for content_approvals
ALTER TABLE content_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvals viewable by project members and admin"
  ON content_approvals FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE t.id = content_approvals.task_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can submit approvals"
  ON content_approvals FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Admins and submitters can update approvals"
  ON content_approvals FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete approvals"
  ON content_approvals FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR submitted_by = auth.uid()
  );

-- Allow public access to content_approvals via share_token (for client review)
-- This will be handled in the API route, not via RLS
