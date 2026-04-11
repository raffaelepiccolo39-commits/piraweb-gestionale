-- ============================================================
-- Migration 00041: Social Calendar, Asset Library, Meetings
-- ============================================================

-- ==================== SOCIAL MEDIA CALENDAR ====================

DO $$ BEGIN CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'pinterest', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE social_post_status AS ENUM ('idea', 'draft', 'ready', 'scheduled', 'published', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  caption TEXT,
  platforms social_platform[] NOT NULL DEFAULT '{}',
  status social_post_status NOT NULL DEFAULT 'idea',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  media_urls TEXT[] DEFAULT '{}',
  hashtags TEXT,
  notes TEXT,
  color TEXT DEFAULT '#8c7af5',
  created_by UUID NOT NULL REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_client ON social_posts(client_id);
CREATE INDEX idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_social_posts_date_range ON social_posts(scheduled_at DESC, client_id);

CREATE TRIGGER set_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Social posts viewable by team" ON social_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = social_posts.client_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can create social posts" ON social_posts
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators and admin can update social posts" ON social_posts
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete social posts" ON social_posts
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== ASSET LIBRARY ====================

DO $$ BEGIN CREATE TYPE asset_type AS ENUM ('logo', 'color', 'font', 'image', 'template', 'guideline', 'video', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS client_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type asset_type NOT NULL DEFAULT 'other',
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  metadata JSONB DEFAULT '{}', -- e.g. { hex: "#FF0000", font_family: "Inter", variant: "full_color" }
  tags TEXT[] DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_assets_client ON client_assets(client_id);
CREATE INDEX idx_client_assets_type ON client_assets(client_id, type);

CREATE TRIGGER set_client_assets_updated_at
  BEFORE UPDATE ON client_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assets viewable by authorized users" ON client_assets
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = client_assets.client_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can upload assets" ON client_assets
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Uploaders and admin can update assets" ON client_assets
  FOR UPDATE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Uploaders and admin can delete assets" ON client_assets
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== MEETINGS ====================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT, -- link Zoom/Meet or physical address
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  attendees UUID[] DEFAULT '{}',
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_date ON meetings(scheduled_at DESC);
CREATE INDEX idx_meetings_client ON meetings(client_id) WHERE client_id IS NOT NULL;

CREATE TRIGGER set_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Meeting action items -> can auto-create tasks
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL, -- linked task once created
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_actions_meeting ON meeting_action_items(meeting_id);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meetings viewable by authenticated" ON meetings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create meetings" ON meetings
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator and admin can update meetings" ON meetings
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete meetings" ON meetings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Action items viewable by authenticated" ON meeting_action_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create action items" ON meeting_action_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Assigned and admin can update action items" ON meeting_action_items
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_action_items.meeting_id AND m.created_by = auth.uid())
  );

CREATE POLICY "Admin can delete action items" ON meeting_action_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
