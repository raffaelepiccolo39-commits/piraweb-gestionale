-- ============================================
-- PiraWeb Gestionale - Bootstrap Supabase STAGING
-- Concatenazione automatica di tutte le 59 migration
-- Generato da: scripts shell, ordinato alfabeticamente
-- Data generazione: 2026-05-23 08:01:23
-- ============================================

-- Come usare:
--   1. Crea progetto Supabase staging dal dashboard
--   2. Vai a SQL Editor del progetto staging
--   3. Copia-incolla TUTTO questo file
--   4. Run
--   5. Verifica che le tabelle siano create (Database → Tables)


-- ============================================
-- 00001_create_enums_and_profiles.sql
-- ============================================
-- ============================================
-- Migration 00001: Enums and Profiles
-- ============================================

-- Custom types
CREATE TYPE user_role AS ENUM (
  'admin',
  'social_media_manager',
  'content_creator',
  'graphic_social',
  'graphic_brand'
);

CREATE TYPE project_status AS ENUM (
  'draft',
  'active',
  'paused',
  'completed',
  'archived'
);

CREATE TYPE task_status AS ENUM (
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done'
);

CREATE TYPE task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

CREATE TYPE notification_type AS ENUM (
  'task_assigned',
  'task_updated',
  'task_completed',
  'project_created',
  'post_created',
  'comment_added',
  'mention',
  'deadline_approaching',
  'ai_script_ready'
);

-- ============================================
-- Profiles table (extends auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'content_creator',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'content_creator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at trigger function (reused across tables)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00002_create_clients.sql
-- ============================================
-- ============================================
-- Migration 00002: Clients
-- ============================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  notes TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_created_by ON clients(created_by);
CREATE INDEX idx_clients_is_active ON clients(is_active);

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS for clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients viewable by all authenticated users"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00003_create_projects.sql
-- ============================================
-- ============================================
-- Migration 00003: Projects
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status project_status NOT NULL DEFAULT 'draft',
  color TEXT NOT NULL DEFAULT '#4F46E5',
  deadline TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_by ON projects(created_by);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Project members (many-to-many)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects viewable by members and admins"
  ON projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR
    EXISTS (SELECT 1 FROM project_members WHERE project_id = id AND user_id = auth.uid())
    OR
    created_by = auth.uid()
  );

CREATE POLICY "Admins can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for project_members
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members viewable by authenticated"
  ON project_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage project members"
  ON project_members FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00004_create_tasks.sql
-- ============================================
-- ============================================
-- Migration 00004: Tasks
-- ============================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status task_status NOT NULL DEFAULT 'backlog',
  priority task_priority NOT NULL DEFAULT 'medium',
  position INTEGER NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ,
  estimated_hours NUMERIC(5,1),
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_position ON tasks(project_id, status, position);

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Task comments
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);

CREATE TRIGGER set_task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Task attachments
CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);

-- RLS for tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks viewable by project members and admins"
  ON tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR
    assigned_to = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = tasks.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins and assignees can update tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admins can delete tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for task_comments
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by project members"
  ON task_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE t.id = task_comments.task_id AND pm.user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can add comments"
  ON task_comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own comments"
  ON task_comments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments or admin"
  ON task_comments FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for task_attachments
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attachments viewable by project members"
  ON task_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE t.id = task_attachments.task_id AND pm.user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can upload attachments"
  ON task_attachments FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Uploaders and admins can delete attachments"
  ON task_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00005_create_ai_scripts.sql
-- ============================================
-- ============================================
-- Migration 00005: AI Scripts
-- ============================================

CREATE TYPE ai_provider AS ENUM ('claude', 'openai');
CREATE TYPE script_type AS ENUM (
  'social_post',
  'blog_article',
  'email_campaign',
  'ad_copy',
  'video_script',
  'brand_guidelines',
  'other'
);

CREATE TABLE ai_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  result TEXT,
  script_type script_type NOT NULL DEFAULT 'social_post',
  provider ai_provider,
  model TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  tokens_used INTEGER,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_scripts_client ON ai_scripts(client_id);
CREATE INDEX idx_ai_scripts_project ON ai_scripts(project_id);
CREATE INDEX idx_ai_scripts_created_by ON ai_scripts(created_by);
CREATE INDEX idx_ai_scripts_type ON ai_scripts(script_type);

CREATE TRIGGER set_ai_scripts_updated_at
  BEFORE UPDATE ON ai_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS for ai_scripts
ALTER TABLE ai_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scripts viewable by creator and admins"
  ON ai_scripts FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can create scripts"
  ON ai_scripts FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators can update own scripts"
  ON ai_scripts FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Creators and admins can delete scripts"
  ON ai_scripts FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00006_create_bacheca.sql
-- ============================================
-- ============================================
-- Migration 00006: Bacheca (Internal Bulletin Board)
-- ============================================

CREATE TYPE post_category AS ENUM (
  'announcement',
  'update',
  'idea',
  'question',
  'celebration'
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category post_category NOT NULL DEFAULT 'update',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_pinned ON posts(is_pinned DESC, created_at DESC);

CREATE TRIGGER set_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Post comments
CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);

CREATE TRIGGER set_post_comments_updated_at
  BEFORE UPDATE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Post reactions (emoji reactions)
CREATE TABLE post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);

-- RLS for posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts viewable by all authenticated"
  ON posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors and admins can update posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authors and admins can delete posts"
  ON posts FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for post_comments
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post comments viewable by all authenticated"
  ON post_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can add post comments"
  ON post_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own post comments"
  ON post_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Authors and admins can delete post comments"
  ON post_comments FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for post_reactions
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions viewable by all authenticated"
  ON post_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add own reactions"
  ON post_reactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove own reactions"
  ON post_reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ============================================
-- 00007_create_notifications.sql
-- ============================================
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


-- ============================================
-- 00008_create_activity_log.sql
-- ============================================
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


-- ============================================
-- 00009_create_storage.sql
-- ============================================
-- ============================================
-- Migration 00009: Storage Buckets
-- ============================================

-- Avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Attachments bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Attachments accessible by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

-- Client logos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Client logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-logos');

CREATE POLICY "Admins can upload client logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'client-logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00010_seed_data.sql
-- ============================================
-- ============================================
-- Migration 00010: Seed Data
-- ============================================
-- NOTE: This seed creates the team profiles.
-- Users must be created via Supabase Auth first (Dashboard or API).
-- After auth user creation, profiles are auto-created by trigger.
-- Use these UPDATE statements to set the correct roles and names.
--
-- Team members to create in Supabase Auth Dashboard:
-- 1. info@piraweb.it (password: changeme123!)
-- 2. bernis@piraweb.it (password: changeme123!)
-- 3. manuela@piraweb.it (password: changeme123!)
-- 4. raffaela@piraweb.it (password: changeme123!)
-- 5. gaia@piraweb.it (password: changeme123!)
--
-- After creating users in Auth, run these updates:

-- Alternative: Use this function to set up team after auth users are created
CREATE OR REPLACE FUNCTION setup_team_roles()
RETURNS void AS $$
BEGIN
  UPDATE profiles SET full_name = 'Raffaele Antonio Piccolo', role = 'admin'
  WHERE email = 'info@piraweb.it';

  UPDATE profiles SET full_name = 'Bernis Del Villano', role = 'social_media_manager'
  WHERE email = 'bernis@piraweb.it';

  UPDATE profiles SET full_name = 'Manuela Del Villano', role = 'content_creator'
  WHERE email = 'manuela@piraweb.it';

  UPDATE profiles SET full_name = 'Raffaela Sparaco', role = 'graphic_social'
  WHERE email = 'raffaela@piraweb.it';

  UPDATE profiles SET full_name = 'Gaia Coppeto', role = 'graphic_brand'
  WHERE email = 'gaia@piraweb.it';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sample client data (will be inserted by admin)
-- This creates a function admin can call after setup
CREATE OR REPLACE FUNCTION seed_sample_clients(p_admin_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO clients (name, company, email, phone, website, notes, created_by)
  VALUES
    ('Mario Rossi', 'Rossi & Partners', 'mario@rossipartners.it', '+39 081 1234567', 'https://rossipartners.it', 'Cliente storico, settore legale', p_admin_id),
    ('Lucia Bianchi', 'Bianchi Fashion', 'lucia@bianchifashion.it', '+39 02 9876543', 'https://bianchifashion.it', 'Brand di moda emergente', p_admin_id),
    ('Giuseppe Verde', 'Verde Ristorazione', 'info@verderistorante.it', '+39 06 5551234', 'https://verderistorante.it', 'Catena di ristoranti campani', p_admin_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00011_create_analytics_functions.sql
-- ============================================
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


-- ============================================
-- 00012_create_contracts_payments.sql
-- ============================================
-- ============================================
-- Migration 00012: Client Contracts & Payments
-- ============================================

DO $$ BEGIN CREATE TYPE contract_status AS ENUM ('active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contracts table
CREATE TABLE IF NOT EXISTS client_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  monthly_fee NUMERIC(10, 2) NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months IN (6, 12)),
  start_date DATE NOT NULL,
  status contract_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contracts_client_id ON client_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_status ON client_contracts(status);

DROP TRIGGER IF EXISTS set_client_contracts_updated_at ON client_contracts;
CREATE TRIGGER set_client_contracts_updated_at
  BEFORE UPDATE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payments table
CREATE TABLE IF NOT EXISTS client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  month_index INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, month_index)
);

CREATE INDEX IF NOT EXISTS idx_client_payments_contract_id ON client_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_is_paid ON client_payments(is_paid);

DROP TRIGGER IF EXISTS set_client_payments_updated_at ON client_payments;
CREATE TRIGGER set_client_payments_updated_at
  BEFORE UPDATE ON client_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS (admin only)
-- ============================================
ALTER TABLE client_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view contracts" ON client_contracts;
CREATE POLICY "Admins can view contracts" ON client_contracts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert contracts" ON client_contracts;
CREATE POLICY "Admins can insert contracts" ON client_contracts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update contracts" ON client_contracts;
CREATE POLICY "Admins can update contracts" ON client_contracts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete contracts" ON client_contracts;
CREATE POLICY "Admins can delete contracts" ON client_contracts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payments" ON client_payments;
CREATE POLICY "Admins can view payments" ON client_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert payments" ON client_payments;
CREATE POLICY "Admins can insert payments" ON client_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update payments" ON client_payments;
CREATE POLICY "Admins can update payments" ON client_payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete payments" ON client_payments;
CREATE POLICY "Admins can delete payments" ON client_payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Auto-generate payment rows
-- ============================================
CREATE OR REPLACE FUNCTION generate_contract_payments(p_contract_id UUID)
RETURNS VOID AS $$
DECLARE
  v_contract RECORD;
BEGIN
  SELECT * INTO v_contract FROM client_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  DELETE FROM client_payments WHERE contract_id = p_contract_id;

  INSERT INTO client_payments (contract_id, month_index, due_date, amount)
  SELECT
    p_contract_id,
    i,
    v_contract.start_date + (i || ' months')::INTERVAL,
    v_contract.monthly_fee
  FROM generate_series(0, v_contract.duration_months - 1) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Financial summary
-- ============================================
CREATE OR REPLACE FUNCTION get_client_financial_summary(p_client_id UUID)
RETURNS TABLE (
  contract_id UUID,
  monthly_fee NUMERIC,
  duration_months INTEGER,
  start_date DATE,
  contract_status contract_status,
  total_value NUMERIC,
  total_paid NUMERIC,
  remaining NUMERIC,
  months_paid BIGINT,
  months_remaining BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.monthly_fee,
    cc.duration_months,
    cc.start_date,
    cc.status,
    (cc.monthly_fee * cc.duration_months),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    (cc.monthly_fee * cc.duration_months) - COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = true),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = false)
  FROM client_contracts cc
  LEFT JOIN client_payments cp ON cp.contract_id = cc.id
  WHERE cc.client_id = p_client_id
    AND cc.status = 'active'
  GROUP BY cc.id, cc.monthly_fee, cc.duration_months, cc.start_date, cc.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00013_create_payment_logs.sql
-- ============================================
-- ============================================
-- Migration 00013: Payment Activity Logs
-- ============================================

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('paid', 'unpaid')),
  amount NUMERIC(10, 2) NOT NULL,
  month_index INTEGER NOT NULL,
  due_date DATE NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_client ON payment_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_contract ON payment_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_performed_at ON payment_logs(performed_at DESC);

ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payment logs" ON payment_logs;
CREATE POLICY "Admins can view payment logs" ON payment_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert payment logs" ON payment_logs;
CREATE POLICY "Admins can insert payment logs" ON payment_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00014_contract_payment_type_and_attachment.sql
-- ============================================
-- ============================================
-- Migration 00014: Add payment_type and attachment to contracts
-- ============================================

DO $$ BEGIN CREATE TYPE payment_timing AS ENUM ('inizio_mese', 'fine_mese'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS payment_timing payment_timing NOT NULL DEFAULT 'inizio_mese';
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Storage bucket for contracts (private, admin only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can view contracts files" ON storage.objects;
CREATE POLICY "Admins can view contracts files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can upload contracts files" ON storage.objects;
CREATE POLICY "Admins can upload contracts files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete contracts files" ON storage.objects;
CREATE POLICY "Admins can delete contracts files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contracts' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00015_cashflow_functions.sql
-- ============================================
-- ============================================
-- Migration 00015: Cashflow Functions
-- ============================================

-- Monthly cashflow: expected vs received per month
CREATE OR REPLACE FUNCTION get_cashflow_monthly(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  month_date DATE,
  expected NUMERIC,
  received NUMERIC,
  pending NUMERIC,
  num_clients BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('month', cp.due_date)::DATE AS md,
    SUM(cp.amount),
    SUM(cp.amount) FILTER (WHERE cp.is_paid = true),
    SUM(cp.amount) FILTER (WHERE cp.is_paid = false),
    COUNT(DISTINCT cc.client_id)
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active'
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cashflow summary for a period
CREATE OR REPLACE FUNCTION get_cashflow_summary(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  active_contracts BIGINT,
  active_clients BIGINT,
  avg_monthly_revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    (SELECT COUNT(*) FROM client_contracts WHERE status = 'active'),
    (SELECT COUNT(DISTINCT client_id) FROM client_contracts WHERE status = 'active'),
    CASE
      WHEN COUNT(DISTINCT date_trunc('month', cp.due_date)) = 0 THEN 0
      ELSE ROUND(COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0) /
           COUNT(DISTINCT date_trunc('month', cp.due_date)), 2)
    END
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revenue per client
CREATE OR REPLACE FUNCTION get_revenue_per_client(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  company TEXT,
  monthly_fee NUMERIC,
  total_expected NUMERIC,
  total_paid NUMERIC,
  total_pending NUMERIC,
  months_paid BIGINT,
  months_total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.company,
    cc.monthly_fee,
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = true),
    COUNT(cp.id)
  FROM clients c
  JOIN client_contracts cc ON cc.client_id = c.id AND cc.status = 'active'
  JOIN client_payments cp ON cp.contract_id = cc.id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
  GROUP BY c.id, c.name, c.company, cc.monthly_fee
  ORDER BY COALESCE(SUM(cp.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00016_employee_contract_fields.sql
-- ============================================
-- ============================================
-- Migration 00016: Employee contract fields on profiles
-- ============================================

DO $$ BEGIN CREATE TYPE employee_contract_type AS ENUM ('6_mesi', '12_mesi', 'indeterminato'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary NUMERIC(10, 2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_type employee_contract_type;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_start_date DATE;


-- ============================================
-- 00017_cashflow_expenses.sql
-- ============================================
-- ============================================
-- Migration 00017: Cashflow with expenses (employee salaries)
-- ============================================

-- Monthly expenses based on active employee salaries
CREATE OR REPLACE FUNCTION get_monthly_expenses(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_monthly_salaries NUMERIC,
  num_employees BIGINT,
  employees_detail JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(p.salary), 0),
    COUNT(p.id),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'role', p.role,
      'salary', p.salary,
      'contract_type', p.contract_type
    ) ORDER BY p.salary DESC) FILTER (WHERE p.salary IS NOT NULL), '[]'::jsonb)
  FROM profiles p
  WHERE p.is_active = true
    AND p.role != 'admin'
    AND p.salary IS NOT NULL
    AND p.salary > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Full P&L summary
CREATE OR REPLACE FUNCTION get_profit_loss_summary(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_received NUMERIC,
  total_pending_revenue NUMERIC,
  monthly_salary_cost NUMERIC,
  total_salary_cost_period NUMERIC,
  gross_margin NUMERIC,
  gross_margin_pct NUMERIC,
  net_margin NUMERIC,
  net_margin_pct NUMERIC,
  num_months INTEGER
) AS $$
DECLARE
  v_months INTEGER;
  v_monthly_salaries NUMERIC;
  v_total_expected NUMERIC;
  v_total_received NUMERIC;
  v_total_pending NUMERIC;
BEGIN
  -- Calculate months in period
  v_months := GREATEST(1, EXTRACT(MONTH FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER +
    EXTRACT(YEAR FROM age(p_end_date::timestamp, p_start_date::timestamp))::INTEGER * 12 + 1);

  -- Get monthly salary total
  SELECT COALESCE(SUM(salary), 0) INTO v_monthly_salaries
  FROM profiles
  WHERE is_active = true AND role != 'admin' AND salary IS NOT NULL AND salary > 0;

  -- Get revenue data
  SELECT
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0)
  INTO v_total_expected, v_total_received, v_total_pending
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active';

  RETURN QUERY SELECT
    v_total_expected,
    v_total_received,
    v_total_pending,
    v_monthly_salaries,
    v_monthly_salaries * v_months,
    v_total_expected - (v_monthly_salaries * v_months),
    CASE WHEN v_total_expected = 0 THEN 0
         ELSE ROUND(((v_total_expected - (v_monthly_salaries * v_months)) / v_total_expected) * 100, 1)
    END,
    v_total_received - (v_monthly_salaries * v_months),
    CASE WHEN v_total_received = 0 THEN 0
         ELSE ROUND(((v_total_received - (v_monthly_salaries * v_months)) / v_total_received) * 100, 1)
    END,
    v_months;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00018_create_attendance.sql
-- ============================================
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


-- ============================================
-- 00019_attendance_monthly_details.sql
-- ============================================
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


-- ============================================
-- 00020_client_fiscal_data.sql
-- ============================================
-- ============================================
-- Migration 00020: Dati fiscali clienti
-- ============================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS ragione_sociale TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS partita_iva TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS codice_sdi TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pec TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS provincia TEXT;


-- ============================================
-- 00021_create_chat.sql
-- ============================================
-- ============================================
-- Migration 00021: Chat System
-- ============================================

DO $$ BEGIN CREATE TYPE channel_type AS ENUM ('team', 'direct'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Channels
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type channel_type NOT NULL DEFAULT 'team',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channel members
CREATE TABLE IF NOT EXISTS chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON chat_channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON chat_channel_members(channel_id);

-- Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Channels: user sees channels they are a member of
DROP POLICY IF EXISTS "Users can view their channels" ON chat_channels;
CREATE POLICY "Users can view their channels" ON chat_channels FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated can create channels" ON chat_channels;
CREATE POLICY "Authenticated can create channels" ON chat_channels FOR INSERT TO authenticated
  WITH CHECK (true);

-- Channel members
DROP POLICY IF EXISTS "Users can view channel members" ON chat_channel_members;
CREATE POLICY "Users can view channel members" ON chat_channel_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_channel_members cm WHERE cm.channel_id = chat_channel_members.channel_id AND cm.user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated can add members" ON chat_channel_members;
CREATE POLICY "Authenticated can add members" ON chat_channel_members FOR INSERT TO authenticated
  WITH CHECK (true);

-- Messages: user sees messages from channels they belong to
DROP POLICY IF EXISTS "Users can view channel messages" ON chat_messages;
CREATE POLICY "Users can view channel messages" ON chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can send messages" ON chat_messages;
CREATE POLICY "Users can send messages" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid())
  );

-- Enable realtime on messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- ============================================
-- Auto-create team channel and add all active users
-- ============================================
CREATE OR REPLACE FUNCTION setup_team_chat()
RETURNS UUID AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  -- Check if team channel exists
  SELECT id INTO v_channel_id FROM chat_channels WHERE type = 'team' AND name = 'Team PiraWeb' LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels (name, type) VALUES ('Team PiraWeb', 'team') RETURNING id INTO v_channel_id;
  END IF;

  -- Add all active users who are not yet members
  INSERT INTO chat_channel_members (channel_id, user_id)
  SELECT v_channel_id, p.id
  FROM profiles p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = v_channel_id AND user_id = p.id)
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or find direct channel between two users
CREATE OR REPLACE FUNCTION get_or_create_direct_channel(p_user1 UUID, p_user2 UUID)
RETURNS UUID AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  -- Find existing direct channel between these two users
  SELECT cm1.channel_id INTO v_channel_id
  FROM chat_channel_members cm1
  JOIN chat_channel_members cm2 ON cm1.channel_id = cm2.channel_id
  JOIN chat_channels cc ON cc.id = cm1.channel_id
  WHERE cm1.user_id = p_user1 AND cm2.user_id = p_user2 AND cc.type = 'direct'
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels (name, type, created_by)
    VALUES ('Direct', 'direct', p_user1)
    RETURNING id INTO v_channel_id;

    INSERT INTO chat_channel_members (channel_id, user_id) VALUES (v_channel_id, p_user1);
    INSERT INTO chat_channel_members (channel_id, user_id) VALUES (v_channel_id, p_user2);
  END IF;

  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00022_chat_notifications.sql
-- ============================================
-- ============================================
-- Migration 00022: Notifiche Chat
-- ============================================

-- Trigger: notifica tutti i membri del canale quando arriva un nuovo messaggio
CREATE OR REPLACE FUNCTION notify_chat_message()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name TEXT;
  v_channel_name TEXT;
  v_channel_type channel_type;
  v_member RECORD;
BEGIN
  -- Get sender name
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  -- Get channel info
  SELECT name, type INTO v_channel_name, v_channel_type FROM chat_channels WHERE id = NEW.channel_id;

  -- Notify each member except sender
  FOR v_member IN
    SELECT user_id FROM chat_channel_members
    WHERE channel_id = NEW.channel_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_member.user_id,
      'comment_added',
      CASE v_channel_type
        WHEN 'team' THEN v_sender_name || ' in ' || v_channel_name
        ELSE 'Messaggio da ' || v_sender_name
      END,
      LEFT(NEW.content, 100),
      '/chat',
      jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_chat_message_sent ON chat_messages;
CREATE TRIGGER on_chat_message_sent
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_message();


-- ============================================
-- 00023_chat_project_channels.sql
-- ============================================
-- ============================================
-- Migration 00023: Chat di progetto
-- ============================================

-- Aggiungi 'project' al tipo channel_type
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'project';

-- Aggiungi riferimento al progetto
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chat_channels_project ON chat_channels(project_id);

-- Funzione: crea o trova il canale chat di un progetto
-- Aggiunge automaticamente tutti i membri del progetto + il creatore
CREATE OR REPLACE FUNCTION get_or_create_project_channel(p_project_id UUID)
RETURNS UUID AS $$
DECLARE
  v_channel_id UUID;
  v_project_name TEXT;
BEGIN
  -- Cerca canale esistente per questo progetto
  SELECT id INTO v_channel_id FROM chat_channels WHERE project_id = p_project_id AND type = 'project' LIMIT 1;

  IF v_channel_id IS NULL THEN
    -- Prendi il nome del progetto
    SELECT name INTO v_project_name FROM projects WHERE id = p_project_id;

    -- Crea il canale
    INSERT INTO chat_channels (name, type, project_id)
    VALUES (v_project_name, 'project', p_project_id)
    RETURNING id INTO v_channel_id;
  END IF;

  -- Aggiungi tutti i membri del progetto che non sono già nel canale
  INSERT INTO chat_channel_members (channel_id, user_id)
  SELECT v_channel_id, pm.user_id
  FROM project_members pm
  WHERE pm.project_id = p_project_id
    AND NOT EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = v_channel_id AND user_id = pm.user_id)
  ON CONFLICT DO NOTHING;

  -- Aggiungi anche il creatore del progetto
  INSERT INTO chat_channel_members (channel_id, user_id)
  SELECT v_channel_id, p.created_by
  FROM projects p
  WHERE p.id = p_project_id
    AND NOT EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = v_channel_id AND user_id = p.created_by)
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: quando un membro viene aggiunto a un progetto, aggiungilo anche alla chat
CREATE OR REPLACE FUNCTION sync_project_member_to_chat()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_channel_id FROM chat_channels WHERE project_id = NEW.project_id AND type = 'project';
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_project_member_added ON project_members;
CREATE TRIGGER on_project_member_added
  AFTER INSERT ON project_members
  FOR EACH ROW EXECUTE FUNCTION sync_project_member_to_chat();


-- ============================================
-- 00024_auto_project_per_client.sql
-- ============================================
-- ============================================
-- Migration 00024: Auto-crea progetto per ogni cliente
-- ============================================

-- Funzione: crea un progetto per un cliente se non esiste
CREATE OR REPLACE FUNCTION get_or_create_client_project(p_client_id UUID, p_created_by UUID)
RETURNS UUID AS $$
DECLARE
  v_project_id UUID;
  v_client_name TEXT;
  v_client_company TEXT;
BEGIN
  -- Cerca progetto esistente per questo cliente
  SELECT id INTO v_project_id FROM projects WHERE client_id = p_client_id AND status != 'archived' LIMIT 1;

  IF v_project_id IS NULL THEN
    SELECT name, company INTO v_client_name, v_client_company FROM clients WHERE id = p_client_id;

    INSERT INTO projects (name, client_id, status, color, created_by)
    VALUES (COALESCE(v_client_company, v_client_name), p_client_id, 'active', '#c8f55a', p_created_by)
    RETURNING id INTO v_project_id;

    -- Aggiungi il creatore come membro del progetto
    INSERT INTO project_members (project_id, user_id)
    VALUES (v_project_id, p_created_by)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crea progetti per tutti i clienti esistenti che non ne hanno uno
DO $$
DECLARE
  v_client RECORD;
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    FOR v_client IN SELECT id FROM clients WHERE is_active = true LOOP
      PERFORM get_or_create_client_project(v_client.id, v_admin_id);
    END LOOP;
  END IF;
END $$;

-- Permetti a tutti gli utenti autenticati di vedere i progetti dei clienti
DROP POLICY IF EXISTS "Projects viewable by members and admins" ON projects;
CREATE POLICY "Projects viewable by authenticated" ON projects FOR SELECT TO authenticated
  USING (true);


-- ============================================
-- 00025_client_knowledge_base.sql
-- ============================================
-- ============================================
-- Migration 00025: Client Knowledge Base
-- ============================================

CREATE TABLE IF NOT EXISTS client_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  strategy TEXT,
  objectives TEXT,
  target_audience TEXT,
  tone_of_voice TEXT,
  brand_guidelines TEXT,
  services TEXT,
  competitors TEXT,
  keywords TEXT,
  additional_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_client ON client_knowledge_base(client_id);

DROP TRIGGER IF EXISTS set_kb_updated_at ON client_knowledge_base;
CREATE TRIGGER set_kb_updated_at
  BEFORE UPDATE ON client_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view knowledge base" ON client_knowledge_base;
CREATE POLICY "Authenticated can view knowledge base" ON client_knowledge_base FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert knowledge base" ON client_knowledge_base;
CREATE POLICY "Admins can insert knowledge base" ON client_knowledge_base FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update knowledge base" ON client_knowledge_base;
CREATE POLICY "Admins can update knowledge base" ON client_knowledge_base FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Funzione per ottenere il contesto completo del cliente per l'AI
CREATE OR REPLACE FUNCTION get_client_ai_context(p_client_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_client RECORD;
  v_kb RECORD;
  v_context TEXT := '';
BEGIN
  SELECT name, company, website, notes INTO v_client FROM clients WHERE id = p_client_id;
  SELECT * INTO v_kb FROM client_knowledge_base WHERE client_id = p_client_id;

  v_context := format('
=== CONTESTO CLIENTE ===
Nome: %s
Azienda: %s
Sito web: %s
', v_client.name, COALESCE(v_client.company, 'N/A'), COALESCE(v_client.website, 'N/A'));

  IF v_kb IS NOT NULL THEN
    IF v_kb.strategy IS NOT NULL AND v_kb.strategy != '' THEN
      v_context := v_context || format('
STRATEGIA: %s
', v_kb.strategy);
    END IF;
    IF v_kb.objectives IS NOT NULL AND v_kb.objectives != '' THEN
      v_context := v_context || format('
OBIETTIVI: %s
', v_kb.objectives);
    END IF;
    IF v_kb.target_audience IS NOT NULL AND v_kb.target_audience != '' THEN
      v_context := v_context || format('
TARGET AUDIENCE: %s
', v_kb.target_audience);
    END IF;
    IF v_kb.tone_of_voice IS NOT NULL AND v_kb.tone_of_voice != '' THEN
      v_context := v_context || format('
TONE OF VOICE: %s
', v_kb.tone_of_voice);
    END IF;
    IF v_kb.brand_guidelines IS NOT NULL AND v_kb.brand_guidelines != '' THEN
      v_context := v_context || format('
BRAND GUIDELINES: %s
', v_kb.brand_guidelines);
    END IF;
    IF v_kb.services IS NOT NULL AND v_kb.services != '' THEN
      v_context := v_context || format('
SERVIZI ATTIVI: %s
', v_kb.services);
    END IF;
    IF v_kb.competitors IS NOT NULL AND v_kb.competitors != '' THEN
      v_context := v_context || format('
COMPETITOR: %s
', v_kb.competitors);
    END IF;
    IF v_kb.keywords IS NOT NULL AND v_kb.keywords != '' THEN
      v_context := v_context || format('
PAROLE CHIAVE: %s
', v_kb.keywords);
    END IF;
    IF v_kb.additional_notes IS NOT NULL AND v_kb.additional_notes != '' THEN
      v_context := v_context || format('
NOTE AGGIUNTIVE: %s
', v_kb.additional_notes);
    END IF;
  END IF;

  RETURN v_context;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00026_client_onboarding.sql
-- ============================================
-- ============================================
-- Migration 00026: Client Onboarding & Credenziali Social
-- ============================================

CREATE TABLE IF NOT EXISTS client_social_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  instagram_username TEXT,
  instagram_password TEXT,
  facebook_username TEXT,
  facebook_password TEXT,
  tiktok_username TEXT,
  tiktok_password TEXT,
  other_platforms JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_social_creds_updated_at ON client_social_credentials;
CREATE TRIGGER set_social_creds_updated_at
  BEFORE UPDATE ON client_social_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_social_credentials ENABLE ROW LEVEL SECURITY;

-- Solo admin vede le credenziali
DROP POLICY IF EXISTS "Admins can view social credentials" ON client_social_credentials;
CREATE POLICY "Admins can view social credentials" ON client_social_credentials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert social credentials" ON client_social_credentials;
CREATE POLICY "Admins can insert social credentials" ON client_social_credentials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update social credentials" ON client_social_credentials;
CREATE POLICY "Admins can update social credentials" ON client_social_credentials FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Checklist onboarding
CREATE TABLE IF NOT EXISTS client_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  contract_signed BOOLEAN NOT NULL DEFAULT false,
  logo_received BOOLEAN NOT NULL DEFAULT false,
  social_credentials BOOLEAN NOT NULL DEFAULT false,
  brand_guidelines_received BOOLEAN NOT NULL DEFAULT false,
  strategy_defined BOOLEAN NOT NULL DEFAULT false,
  first_meeting_done BOOLEAN NOT NULL DEFAULT false,
  social_accounts_access BOOLEAN NOT NULL DEFAULT false,
  content_plan_created BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_onboarding_updated_at ON client_onboarding;
CREATE TRIGGER set_onboarding_updated_at
  BEFORE UPDATE ON client_onboarding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view onboarding" ON client_onboarding;
CREATE POLICY "Admins can view onboarding" ON client_onboarding FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert onboarding" ON client_onboarding;
CREATE POLICY "Admins can insert onboarding" ON client_onboarding FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update onboarding" ON client_onboarding;
CREATE POLICY "Admins can update onboarding" ON client_onboarding FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00027_performance_indexes.sql
-- ============================================
-- ============================================
-- Migration 00027: Performance Indexes
-- ============================================

-- Compound index for analytics queries: client activity log by client + time
CREATE INDEX IF NOT EXISTS idx_payment_logs_client_time
  ON payment_logs(client_id, performed_at DESC);

-- Index for contracts filtered by creator
CREATE INDEX IF NOT EXISTS idx_client_contracts_created_by
  ON client_contracts(created_by);

-- Compound index for tasks filtered by assignee + status (list view)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status
  ON tasks(assigned_to, status);

-- Index for tasks ordered by updated_at (default sort in list view)
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at
  ON tasks(updated_at DESC);

-- Index for chat messages ordered by channel + time (last message lookup)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_time
  ON chat_messages(channel_id, created_at DESC);


-- ============================================
-- 00028_ensure_my_profile.sql
-- ============================================
-- ============================================
-- Migration 00028: ensure_my_profile RPC
-- Self-healing: creates a missing profile for the current user.
-- Runs as SECURITY DEFINER to bypass RLS insert restrictions.
-- Called from the client-side auth hook as a fallback.
-- ============================================

CREATE OR REPLACE FUNCTION ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_email   TEXT;
  v_name    TEXT;
BEGIN
  -- Fetch email and name from auth.users
  SELECT
    email,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  INTO v_email, v_name
  FROM auth.users
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user not found in auth.users';
  END IF;

  -- Return existing profile if present
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  -- Auto-create missing profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (auth.uid(), v_email, v_name, 'content_creator')
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_my_profile() TO authenticated;


-- ============================================
-- 00029_add_iban_to_profiles.sql
-- ============================================
-- ============================================
-- Migration 00029: Add IBAN field to profiles
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iban TEXT;


-- ============================================
-- 00030_security_fixes_and_indexes.sql
-- ============================================
-- ============================================
-- Migration 00030: Security Fixes, Missing Enums & Indexes
-- ============================================

-- ============================================
-- 1. FIX ENUM: Add 'gemini' to ai_provider
-- ============================================
ALTER TYPE ai_provider ADD VALUE IF NOT EXISTS 'gemini';

-- ============================================
-- 2. FIX ENUM: Add 'group' to channel_type
-- ============================================
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'group';

-- ============================================
-- 3. FIX CHECK: Allow duration_months = 0
-- ============================================
ALTER TABLE client_contracts DROP CONSTRAINT IF EXISTS client_contracts_duration_months_check;
ALTER TABLE client_contracts ADD CONSTRAINT client_contracts_duration_months_check
  CHECK (duration_months IN (0, 6, 12));

-- ============================================
-- 4. SECURITY: Restrict profile self-update
--    Prevent users from changing their own role, salary, iban, contract fields
-- ============================================
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND salary IS NOT DISTINCT FROM (SELECT p.salary FROM profiles p WHERE p.id = auth.uid())
    AND iban IS NOT DISTINCT FROM (SELECT p.iban FROM profiles p WHERE p.id = auth.uid())
    AND contract_type IS NOT DISTINCT FROM (SELECT p.contract_type FROM profiles p WHERE p.id = auth.uid())
    AND contract_start_date IS NOT DISTINCT FROM (SELECT p.contract_start_date FROM profiles p WHERE p.id = auth.uid())
  );

-- ============================================
-- 5. SECURITY: Restrict SECURITY DEFINER functions
--    Add role checks to cashflow functions
-- ============================================
CREATE OR REPLACE FUNCTION get_cashflow_monthly(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  month TEXT,
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  total_expenses NUMERIC,
  net_position NUMERIC
) AS $$
BEGIN
  -- Only admins can access cashflow data
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    to_char(months.month, 'YYYY-MM') AS month,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'), 0) AS total_expected,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true AND cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'), 0) AS total_received,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false AND cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'), 0) AS total_pending,
    0::NUMERIC AS total_expenses,
    0::NUMERIC AS net_position
  FROM generate_series(p_start_date::TIMESTAMP, p_end_date::TIMESTAMP, '1 month') AS months(month)
  LEFT JOIN client_payments cp ON cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'
  LEFT JOIN client_contracts cc ON cp.contract_id = cc.id
  WHERE cc.status = 'active' OR cc.status IS NULL
  GROUP BY months.month
  ORDER BY months.month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_cashflow_summary(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  total_overdue NUMERIC,
  collection_rate NUMERIC
) AS $$
BEGIN
  -- Only admins can access cashflow data
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(cp.amount), 0) AS total_expected,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0) AS total_received,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0) AS total_pending,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false AND cp.due_date < CURRENT_DATE), 0) AS total_overdue,
    CASE
      WHEN SUM(cp.amount) > 0
      THEN ROUND((SUM(cp.amount) FILTER (WHERE cp.is_paid = true) / SUM(cp.amount)) * 100, 1)
      ELSE 0
    END AS collection_rate
  FROM client_payments cp
  JOIN client_contracts cc ON cp.contract_id = cc.id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. SECURITY: Restrict chat member insertion
-- ============================================
DROP POLICY IF EXISTS "Authenticated can add members" ON chat_channel_members;
CREATE POLICY "Members can add to their channels" ON chat_channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Can add yourself to any channel
    user_id = auth.uid()
    -- Or admins can add anyone
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    -- Or existing members can add others
    OR EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_channel_members.channel_id AND user_id = auth.uid())
  );

-- ============================================
-- 7. MISSING RLS: DELETE policies
-- ============================================

-- client_social_credentials DELETE
DROP POLICY IF EXISTS "Admins can delete social credentials" ON client_social_credentials;
CREATE POLICY "Admins can delete social credentials" ON client_social_credentials
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- client_onboarding DELETE
DROP POLICY IF EXISTS "Admins can delete onboarding" ON client_onboarding;
CREATE POLICY "Admins can delete onboarding" ON client_onboarding
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- client_knowledge_base DELETE
DROP POLICY IF EXISTS "Admins can delete knowledge base" ON client_knowledge_base;
CREATE POLICY "Admins can delete knowledge base" ON client_knowledge_base
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- chat_channels UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can update channels" ON chat_channels;
CREATE POLICY "Admins can update channels" ON chat_channels
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete channels" ON chat_channels;
CREATE POLICY "Admins can delete channels" ON chat_channels
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- chat_channel_members DELETE
DROP POLICY IF EXISTS "Admins can remove members" ON chat_channel_members;
CREATE POLICY "Admins can remove members" ON chat_channel_members
  FOR DELETE TO authenticated
  USING (
    -- Admins can remove anyone
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    -- Users can remove themselves
    OR user_id = auth.uid()
  );

-- ============================================
-- 8. PERFORMANCE: Composite indexes
-- ============================================

-- Notifications: frequent query pattern (user + unread + recent)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- Client payments: cashflow date range queries
CREATE INDEX IF NOT EXISTS idx_client_payments_due_date
  ON client_payments(due_date);

-- AI scripts: listing by creator + time
CREATE INDEX IF NOT EXISTS idx_ai_scripts_created_by_time
  ON ai_scripts(created_by, created_at DESC);


-- ============================================
-- 00031_developer_notes.sql
-- ============================================
-- ============================================
-- Migration 00031: Note allo Sviluppatore
-- ============================================

-- 1. ENUMS
DO $$ BEGIN CREATE TYPE dev_note_category AS ENUM ('bug', 'feature_request', 'improvement'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dev_note_status AS ENUM ('open', 'in_progress', 'resolved', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABLE
CREATE TABLE IF NOT EXISTS developer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category dev_note_category NOT NULL,
  priority task_priority NOT NULL DEFAULT 'medium',
  status dev_note_status NOT NULL DEFAULT 'open',
  screenshot_url TEXT,
  resolved_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES profiles(id),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_dev_notes_author ON developer_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_dev_notes_status ON developer_notes(status);
CREATE INDEX IF NOT EXISTS idx_dev_notes_category ON developer_notes(category);
CREATE INDEX IF NOT EXISTS idx_dev_notes_created ON developer_notes(created_at DESC);

-- 4. TRIGGER updated_at
DROP TRIGGER IF EXISTS set_developer_notes_updated_at ON developer_notes;
CREATE TRIGGER set_developer_notes_updated_at
  BEFORE UPDATE ON developer_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS
ALTER TABLE developer_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: admin vede tutto, non-admin solo le proprie
DROP POLICY IF EXISTS "Dev notes visible to admin or author" ON developer_notes;
CREATE POLICY "Dev notes visible to admin or author" ON developer_notes
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT: qualsiasi utente autenticato, ma solo come autore
DROP POLICY IF EXISTS "Authenticated users can create notes" ON developer_notes;
CREATE POLICY "Authenticated users can create notes" ON developer_notes
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- UPDATE: admin puo aggiornare tutto, non-admin solo le proprie se status = 'open'
DROP POLICY IF EXISTS "Admin can update any note" ON developer_notes;
CREATE POLICY "Admin can update any note" ON developer_notes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Authors can update own open notes" ON developer_notes;
CREATE POLICY "Authors can update own open notes" ON developer_notes
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND status = 'open')
  WITH CHECK (author_id = auth.uid());

-- DELETE: admin puo eliminare tutto, non-admin solo le proprie se status = 'open'
DROP POLICY IF EXISTS "Admin can delete any note" ON developer_notes;
CREATE POLICY "Admin can delete any note" ON developer_notes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Authors can delete own open notes" ON developer_notes;
CREATE POLICY "Authors can delete own open notes" ON developer_notes
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'open');

-- 6. STORAGE BUCKET per screenshot
INSERT INTO storage.buckets (id, name, public)
VALUES ('dev-note-screenshots', 'dev-note-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Authenticated can view dev screenshots" ON storage.objects;
CREATE POLICY "Authenticated can view dev screenshots" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dev-note-screenshots');

DROP POLICY IF EXISTS "Authenticated can upload dev screenshots" ON storage.objects;
CREATE POLICY "Authenticated can upload dev screenshots" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dev-note-screenshots');

DROP POLICY IF EXISTS "Admin can delete dev screenshots" ON storage.objects;
CREATE POLICY "Admin can delete dev screenshots" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dev-note-screenshots'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00032_tasks_visible_to_all.sql
-- ============================================
-- ============================================
-- Migration 00032: Tasks visibili a tutti gli utenti autenticati
-- Permette a tutti i collaboratori di avere una panoramica completa dei task
-- ============================================

DROP POLICY IF EXISTS "Tasks viewable by project members and admins" ON tasks;
CREATE POLICY "Tasks viewable by all authenticated users" ON tasks
  FOR SELECT TO authenticated
  USING (true);


-- ============================================
-- 00033_calendar.sql
-- ============================================
-- ============================================
-- Migration 00033: Calendario con integrazione CalDAV
-- ============================================

-- 1. TABLE: calendar_events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  all_day BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#c8f55a',
  ical_uid TEXT,
  assigned_to UUID[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABLE: calendar_sync_config
CREATE TABLE IF NOT EXISTS calendar_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) UNIQUE,
  caldav_url TEXT NOT NULL DEFAULT 'https://caldav.icloud.com',
  caldav_username TEXT,
  caldav_password TEXT,
  calendar_path TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'active' CHECK (sync_status IN ('active', 'paused', 'error')),
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end ON calendar_events(end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_calendar_events_ical_uid ON calendar_events(ical_uid);

-- 4. TRIGGERS
DROP TRIGGER IF EXISTS set_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER set_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_calendar_sync_config_updated_at ON calendar_sync_config;
CREATE TRIGGER set_calendar_sync_config_updated_at
  BEFORE UPDATE ON calendar_sync_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_config ENABLE ROW LEVEL SECURITY;

-- Events: tutti possono vedere tutti gli eventi
DROP POLICY IF EXISTS "Calendar events visible to all" ON calendar_events;
CREATE POLICY "Calendar events visible to all" ON calendar_events
  FOR SELECT TO authenticated USING (true);

-- Events: tutti possono creare
DROP POLICY IF EXISTS "Authenticated can create events" ON calendar_events;
CREATE POLICY "Authenticated can create events" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Events: creatore o admin puo modificare
DROP POLICY IF EXISTS "Creator or admin can update events" ON calendar_events;
CREATE POLICY "Creator or admin can update events" ON calendar_events
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Events: creatore o admin puo eliminare
DROP POLICY IF EXISTS "Creator or admin can delete events" ON calendar_events;
CREATE POLICY "Creator or admin can delete events" ON calendar_events
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Sync config: solo il proprietario e admin
DROP POLICY IF EXISTS "User can view own sync config" ON calendar_sync_config;
CREATE POLICY "User can view own sync config" ON calendar_sync_config
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "User can manage own sync config" ON calendar_sync_config;
CREATE POLICY "User can manage own sync config" ON calendar_sync_config
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00034_client_extra_fields.sql
-- ============================================
-- Add extra info fields to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_types text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS relationship_start date;


-- ============================================
-- 00035_client_sector.sql
-- ============================================
-- Add business sector field to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sector text;


-- ============================================
-- 00036_fix_cashflow_functions.sql
-- ============================================
-- Fix: get_cashflow_summary should always return active_contracts and active_clients
-- even when there are no payments in the selected period
CREATE OR REPLACE FUNCTION get_cashflow_summary(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  active_contracts BIGINT,
  active_clients BIGINT,
  avg_monthly_revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active'
    ), 0) AS total_expected,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = true
    ), 0) AS total_received,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = false
    ), 0) AS total_pending,
    (SELECT COUNT(*) FROM client_contracts WHERE status = 'active') AS active_contracts,
    (SELECT COUNT(DISTINCT client_id) FROM client_contracts WHERE status = 'active') AS active_clients,
    COALESCE((
      SELECT CASE
        WHEN COUNT(DISTINCT date_trunc('month', cp.due_date)) = 0 THEN 0
        ELSE ROUND(SUM(cp.amount) FILTER (WHERE cp.is_paid = true) / COUNT(DISTINCT date_trunc('month', cp.due_date)), 2)
      END
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active'
    ), 0) AS avg_monthly_revenue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix: get_cashflow_monthly should include all months even without active contract filter issue
CREATE OR REPLACE FUNCTION get_cashflow_monthly(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  month_date DATE,
  expected NUMERIC,
  received NUMERIC,
  pending NUMERIC,
  num_clients BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('month', cp.due_date)::DATE AS md,
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    COUNT(DISTINCT cc.client_id)
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00037_profile_color.sql
-- ============================================
-- Add color field to profiles for user identification
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS color text DEFAULT '#8c7af5';


-- ============================================
-- 00038_performance_indexes.sql
-- ============================================
-- Performance indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);
CREATE INDEX IF NOT EXISTS idx_client_payments_due_date ON client_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_client_payments_contract_paid ON client_payments(contract_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date);


-- ============================================
-- 00039_security_rls_fixes.sql
-- ============================================
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


-- ============================================
-- 00040_time_tracking_and_approvals.sql
-- ============================================
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


-- ============================================
-- 00041_social_calendar_assets_meetings.sql
-- ============================================
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


-- ============================================
-- 00042_briefs_freelancers.sql
-- ============================================
-- ============================================================
-- Migration 00042: Creative Briefs & Freelancer Management
-- ============================================================

-- ==================== CREATIVE BRIEFS ====================

CREATE TABLE IF NOT EXISTS creative_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  objective TEXT,           -- What we want to achieve
  target_audience TEXT,     -- Who we're targeting
  key_message TEXT,         -- Core message
  tone_of_voice TEXT,       -- Brand voice for this brief
  deliverables TEXT,        -- List of deliverables expected
  references_urls TEXT[] DEFAULT '{}', -- Mood board / reference links
  do_list TEXT,             -- What to do
  dont_list TEXT,           -- What NOT to do
  budget_notes TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_progress', 'completed')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_briefs_project ON creative_briefs(project_id);
CREATE INDEX idx_creative_briefs_client ON creative_briefs(client_id) WHERE client_id IS NOT NULL;

CREATE TRIGGER set_creative_briefs_updated_at
  BEFORE UPDATE ON creative_briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE creative_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Briefs viewable by project members and admin" ON creative_briefs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_briefs.project_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can create briefs" ON creative_briefs
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators and admin can update briefs" ON creative_briefs
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete briefs" ON creative_briefs
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==================== FREELANCERS ====================

CREATE TABLE IF NOT EXISTS freelancers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT NOT NULL,   -- e.g. 'graphic_designer', 'copywriter', 'video_editor', 'photographer', 'developer'
  hourly_rate NUMERIC(8,2),
  portfolio_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_freelancers_active ON freelancers(is_active) WHERE is_active = true;
CREATE INDEX idx_freelancers_specialty ON freelancers(specialty);

CREATE TRIGGER set_freelancers_updated_at
  BEFORE UPDATE ON freelancers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Task assignments to freelancers
CREATE TABLE IF NOT EXISTS task_freelancer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  agreed_rate NUMERIC(8,2),       -- rate for this specific task
  estimated_hours NUMERIC(5,1),
  actual_hours NUMERIC(5,1),
  total_cost NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, freelancer_id)
);

CREATE INDEX idx_task_freelancer_task ON task_freelancer_assignments(task_id);
CREATE INDEX idx_task_freelancer_freelancer ON task_freelancer_assignments(freelancer_id);

CREATE TRIGGER set_task_freelancer_updated_at
  BEFORE UPDATE ON task_freelancer_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate total_cost
CREATE OR REPLACE FUNCTION calculate_freelancer_cost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actual_hours IS NOT NULL AND NEW.agreed_rate IS NOT NULL THEN
    NEW.total_cost := NEW.actual_hours * NEW.agreed_rate;
  ELSIF NEW.estimated_hours IS NOT NULL AND NEW.agreed_rate IS NOT NULL AND NEW.total_cost IS NULL THEN
    NEW.total_cost := NEW.estimated_hours * NEW.agreed_rate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_freelancer_cost
  BEFORE INSERT OR UPDATE ON task_freelancer_assignments
  FOR EACH ROW EXECUTE FUNCTION calculate_freelancer_cost();

ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_freelancer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Freelancers viewable by authenticated" ON freelancers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage freelancers" ON freelancers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Task freelancer assignments viewable by authenticated" ON task_freelancer_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage task freelancer assignments" ON task_freelancer_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00043_templates_recurring_budget.sql
-- ============================================
-- ============================================================
-- Migration 00043: Project Templates, Recurring Tasks, Budget
-- ============================================================

-- ==================== PROJECT TEMPLATES ====================

CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  default_color TEXT DEFAULT '#8c7af5',
  category TEXT, -- e.g. 'social_media', 'branding', 'web', 'video', 'marketing'
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_role TEXT, -- role that should handle this task
  priority task_priority NOT NULL DEFAULT 'medium',
  estimated_hours NUMERIC(5,1),
  position INTEGER NOT NULL DEFAULT 0,
  day_offset INTEGER DEFAULT 0, -- days from project start when this should be due
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_tasks_template ON template_tasks(template_id, position);

CREATE TRIGGER set_project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create project from template
CREATE OR REPLACE FUNCTION create_project_from_template(
  p_template_id UUID,
  p_project_name TEXT,
  p_client_id UUID,
  p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
  v_template RECORD;
  v_project_id UUID;
  v_task RECORD;
  v_assigned_to UUID;
BEGIN
  SELECT * INTO v_template FROM project_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template non trovato';
  END IF;

  -- Create project
  INSERT INTO projects (name, client_id, status, color, created_by)
  VALUES (p_project_name, p_client_id, 'active', v_template.default_color, p_created_by)
  RETURNING id INTO v_project_id;

  -- Add creator as member
  INSERT INTO project_members (project_id, user_id)
  VALUES (v_project_id, p_created_by)
  ON CONFLICT DO NOTHING;

  -- Create tasks from template
  FOR v_task IN
    SELECT * FROM template_tasks WHERE template_id = p_template_id ORDER BY position
  LOOP
    -- Find a user with matching role
    v_assigned_to := NULL;
    IF v_task.assigned_role IS NOT NULL THEN
      SELECT id INTO v_assigned_to FROM profiles
      WHERE role = v_task.assigned_role AND is_active = true
      LIMIT 1;
    END IF;

    INSERT INTO tasks (title, description, project_id, assigned_to, priority, position, estimated_hours, deadline, created_by)
    VALUES (
      v_task.title,
      v_task.description,
      v_project_id,
      v_assigned_to,
      v_task.priority,
      v_task.position,
      v_task.estimated_hours,
      CASE WHEN v_task.day_offset IS NOT NULL THEN now() + (v_task.day_offset || ' days')::INTERVAL ELSE NULL END,
      p_created_by
    );

    -- Add assigned user as project member
    IF v_assigned_to IS NOT NULL THEN
      INSERT INTO project_members (project_id, user_id)
      VALUES (v_project_id, v_assigned_to)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates viewable by authenticated" ON project_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage templates" ON project_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Template tasks viewable by authenticated" ON template_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage template tasks" ON template_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed common templates
INSERT INTO project_templates (name, description, category, created_by) VALUES
  ('Social Media Management', 'Setup completo per gestione social media di un nuovo cliente', 'social_media',
   (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)),
  ('Rebranding', 'Processo completo di rebranding aziendale', 'branding',
   (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)),
  ('Sito Web', 'Sviluppo sito web da zero', 'web',
   (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1))
ON CONFLICT DO NOTHING;

-- Seed template tasks for Social Media Management
INSERT INTO template_tasks (template_id, title, description, assigned_role, priority, estimated_hours, position, day_offset)
SELECT t.id, v.title, v.description, v.assigned_role, v.priority::task_priority, v.estimated_hours, v.position, v.day_offset
FROM project_templates t,
(VALUES
  ('Raccolta brief e brand guidelines', 'Raccogliere dal cliente: logo, font, colori, tone of voice, competitor', 'admin', 'high', 2, 0, 0),
  ('Setup credenziali social', 'Ottenere accesso a tutti gli account social del cliente', 'social_media_manager', 'high', 1, 1, 1),
  ('Analisi competitor', 'Analizzare i 3-5 competitor principali sui social', 'social_media_manager', 'medium', 4, 2, 3),
  ('Definizione strategia editoriale', 'Creare strategia di contenuto per i prossimi 3 mesi', 'social_media_manager', 'high', 6, 3, 5),
  ('Creazione piano editoriale mese 1', 'Pianificare i contenuti del primo mese', 'content_creator', 'high', 4, 4, 7),
  ('Design template grafici', 'Creare template grafici per post, stories, reel', 'graphic_social', 'high', 8, 5, 7),
  ('Produzione contenuti settimana 1', 'Creare i contenuti della prima settimana', 'content_creator', 'medium', 6, 6, 10),
  ('Review e approvazione cliente', 'Presentare contenuti al cliente per approvazione', 'admin', 'high', 2, 7, 14),
  ('Pubblicazione e monitoring', 'Pubblicare contenuti approvati e monitorare performance', 'social_media_manager', 'medium', 3, 8, 15),
  ('Report primo mese', 'Creare report con KPI del primo mese di attivita', 'social_media_manager', 'medium', 3, 9, 30)
) AS v(title, description, assigned_role, priority, estimated_hours, position, day_offset)
WHERE t.name = 'Social Media Management';

-- ==================== RECURRING TASKS ====================

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority task_priority NOT NULL DEFAULT 'medium',
  estimated_hours NUMERIC(5,1),
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'biweekly', 'monthly')),
  recurrence_day INTEGER, -- 0-6 for weekly (0=Monday), 1-28 for monthly
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_tasks_active ON recurring_tasks(is_active, next_due_at) WHERE is_active = true;
CREATE INDEX idx_recurring_tasks_project ON recurring_tasks(project_id);

CREATE TRIGGER set_recurring_tasks_updated_at
  BEFORE UPDATE ON recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to generate recurring tasks (called by cron or API)
CREATE OR REPLACE FUNCTION generate_recurring_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_next TIMESTAMPTZ;
BEGIN
  FOR v_rec IN
    SELECT * FROM recurring_tasks
    WHERE is_active = true
    AND (next_due_at IS NULL OR next_due_at <= now())
  LOOP
    -- Create task
    INSERT INTO tasks (title, description, project_id, assigned_to, priority, estimated_hours, deadline, created_by, status)
    VALUES (
      v_rec.title,
      COALESCE(v_rec.description, '') || E'\n[Task ricorrente]',
      v_rec.project_id,
      v_rec.assigned_to,
      v_rec.priority,
      v_rec.estimated_hours,
      CASE v_rec.recurrence_type
        WHEN 'daily' THEN now() + INTERVAL '1 day'
        WHEN 'weekly' THEN now() + INTERVAL '7 days'
        WHEN 'biweekly' THEN now() + INTERVAL '14 days'
        WHEN 'monthly' THEN now() + INTERVAL '1 month'
      END,
      v_rec.created_by,
      'todo'
    );

    -- Calculate next due date
    v_next := CASE v_rec.recurrence_type
      WHEN 'daily' THEN now() + INTERVAL '1 day'
      WHEN 'weekly' THEN now() + INTERVAL '7 days'
      WHEN 'biweekly' THEN now() + INTERVAL '14 days'
      WHEN 'monthly' THEN now() + INTERVAL '1 month'
    END;

    UPDATE recurring_tasks
    SET last_generated_at = now(), next_due_at = v_next
    WHERE id = v_rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recurring tasks viewable by project members" ON recurring_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = recurring_tasks.project_id AND pm.user_id = auth.uid())
  );

CREATE POLICY "Admin can manage recurring tasks" ON recurring_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==================== DEADLINE ALERTS FUNCTION ====================

CREATE OR REPLACE FUNCTION generate_deadline_alerts()
RETURNS INTEGER AS $$
DECLARE
  v_task RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Alert for tasks due in next 24 hours
  FOR v_task IN
    SELECT t.id, t.title, t.assigned_to, t.project_id
    FROM tasks t
    WHERE t.deadline IS NOT NULL
    AND t.status NOT IN ('done', 'archived')
    AND t.deadline BETWEEN now() AND now() + INTERVAL '24 hours'
    AND t.assigned_to IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.metadata->>'task_id' = t.id::TEXT
      AND n.type = 'deadline_approaching'
      AND n.created_at > now() - INTERVAL '24 hours'
    )
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_task.assigned_to,
      'deadline_approaching',
      'Deadline domani',
      format('Il task "%s" scade tra meno di 24 ore', v_task.title),
      format('/tasks/%s', v_task.id),
      jsonb_build_object('task_id', v_task.id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Alert for overdue tasks
  FOR v_task IN
    SELECT t.id, t.title, t.assigned_to
    FROM tasks t
    WHERE t.deadline IS NOT NULL
    AND t.status NOT IN ('done', 'archived')
    AND t.deadline < now()
    AND t.assigned_to IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.metadata->>'task_id' = t.id::TEXT
      AND n.type = 'deadline_approaching'
      AND n.created_at > now() - INTERVAL '3 days'
      AND n.message LIKE '%scadut%'
    )
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_task.assigned_to,
      'deadline_approaching',
      'Task scaduta!',
      format('Il task "%s" ha superato la deadline', v_task.title),
      format('/tasks/%s', v_task.id),
      jsonb_build_object('task_id', v_task.id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 00044_crm_pipeline.sql
-- ============================================
-- ============================================================
-- Migration 00044: CRM Pipeline (HubSpot-style)
-- ============================================================

-- Pipeline stages
DO $$ BEGIN
  CREATE TYPE deal_stage AS ENUM (
    'lead',           -- Primo contatto / interesse
    'qualified',      -- Lead qualificato
    'proposal',       -- Proposta inviata
    'negotiation',    -- In negoziazione
    'closed_won',     -- Chiuso - Vinto
    'closed_lost'     -- Chiuso - Perso
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deal_source AS ENUM (
    'website',
    'referral',
    'social_media',
    'cold_outreach',
    'event',
    'ads',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Deals (opportunities)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  stage deal_stage NOT NULL DEFAULT 'lead',
  value NUMERIC(12,2) DEFAULT 0,         -- Deal value in EUR
  monthly_value NUMERIC(10,2),            -- Expected monthly revenue
  probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  source deal_source DEFAULT 'other',
  services TEXT,                          -- Services interested in
  notes TEXT,
  expected_close_date DATE,
  actual_close_date DATE,
  lost_reason TEXT,                       -- Why we lost this deal
  -- Conversion
  converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- Ownership
  owner_id UUID NOT NULL REFERENCES profiles(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_owner ON deals(owner_id);
CREATE INDEX idx_deals_close_date ON deals(expected_close_date) WHERE stage NOT IN ('closed_won', 'closed_lost');
CREATE INDEX idx_deals_created ON deals(created_at DESC);

CREATE TRIGGER set_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Deal activities (log of interactions)
CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note', 'stage_change', 'proposal_sent', 'follow_up')),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_activities_deal ON deal_activities(deal_id, created_at DESC);

-- Deal files (proposals, contracts, etc.)
CREATE TABLE IF NOT EXISTS deal_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_files_deal ON deal_files(deal_id);

-- Auto-update probability based on stage
CREATE OR REPLACE FUNCTION update_deal_probability()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-set probability based on stage if not manually overridden
  IF NEW.stage != OLD.stage THEN
    NEW.probability := CASE NEW.stage
      WHEN 'lead' THEN 10
      WHEN 'qualified' THEN 25
      WHEN 'proposal' THEN 50
      WHEN 'negotiation' THEN 75
      WHEN 'closed_won' THEN 100
      WHEN 'closed_lost' THEN 0
    END;

    -- Set close date when won or lost
    IF NEW.stage IN ('closed_won', 'closed_lost') AND NEW.actual_close_date IS NULL THEN
      NEW.actual_close_date := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_deal_probability
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_deal_probability();

-- Log stage changes as activities
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_labels TEXT[] := ARRAY['Lead', 'Qualificato', 'Proposta', 'Negoziazione', 'Chiuso Vinto', 'Chiuso Perso'];
  v_old_label TEXT;
  v_new_label TEXT;
BEGIN
  IF NEW.stage != OLD.stage THEN
    v_old_label := CASE OLD.stage
      WHEN 'lead' THEN 'Lead'
      WHEN 'qualified' THEN 'Qualificato'
      WHEN 'proposal' THEN 'Proposta'
      WHEN 'negotiation' THEN 'Negoziazione'
      WHEN 'closed_won' THEN 'Chiuso Vinto'
      WHEN 'closed_lost' THEN 'Chiuso Perso'
    END;
    v_new_label := CASE NEW.stage
      WHEN 'lead' THEN 'Lead'
      WHEN 'qualified' THEN 'Qualificato'
      WHEN 'proposal' THEN 'Proposta'
      WHEN 'negotiation' THEN 'Negoziazione'
      WHEN 'closed_won' THEN 'Chiuso Vinto'
      WHEN 'closed_lost' THEN 'Chiuso Perso'
    END;

    INSERT INTO deal_activities (deal_id, type, title, description, completed, created_by)
    VALUES (
      NEW.id,
      'stage_change',
      format('Passato a: %s', v_new_label),
      format('Da "%s" a "%s"', v_old_label, v_new_label),
      true,
      COALESCE(auth.uid(), NEW.owner_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_deal_stage_change
  AFTER UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals viewable by authenticated" ON deals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin and owner can manage deals" ON deals
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Activities viewable by authenticated" ON deal_activities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create activities" ON deal_activities
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creator can update activities" ON deal_activities
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Deal files viewable by authenticated" ON deal_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upload deal files" ON deal_files
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Admin can delete deal files" ON deal_files
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00045_scaling_features.sql
-- ============================================
-- ============================================================
-- Migration 00045: Scaling Features
-- Client Health, Automations, Invoicing
-- ============================================================

-- ==================== CLIENT HEALTH SCORE ====================

-- Materialized view would be ideal but we use a function for Supabase compatibility
CREATE OR REPLACE FUNCTION calculate_client_health(p_client_id UUID)
RETURNS TABLE (
  health_score INTEGER,
  payment_score INTEGER,
  delivery_score INTEGER,
  budget_score INTEGER,
  engagement_score INTEGER,
  risk_level TEXT
) AS $$
DECLARE
  v_payment_score INTEGER := 0;
  v_delivery_score INTEGER := 0;
  v_budget_score INTEGER := 0;
  v_engagement_score INTEGER := 0;
  v_total INTEGER;
  v_total_payments INTEGER;
  v_paid_on_time INTEGER;
  v_total_tasks INTEGER;
  v_done_on_time INTEGER;
  v_total_estimated NUMERIC;
  v_total_logged NUMERIC;
  v_last_activity TIMESTAMPTZ;
BEGIN
  -- 1. Payment Score (0-25): % of payments paid on time
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_paid = true)
  INTO v_total_payments, v_paid_on_time
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  WHERE cc.client_id = p_client_id
  AND cp.due_date <= now();

  IF v_total_payments > 0 THEN
    v_payment_score := ROUND((v_paid_on_time::NUMERIC / v_total_payments) * 25);
  ELSE
    v_payment_score := 25; -- No payments due yet = good
  END IF;

  -- 2. Delivery Score (0-25): % of tasks completed on time
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'done' AND (deadline IS NULL OR updated_at::DATE <= deadline))
  INTO v_total_tasks, v_done_on_time
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.client_id = p_client_id
  AND t.status IN ('done', 'review')
  AND t.created_at > now() - INTERVAL '90 days';

  IF v_total_tasks > 0 THEN
    v_delivery_score := ROUND((v_done_on_time::NUMERIC / v_total_tasks) * 25);
  ELSE
    v_delivery_score := 20;
  END IF;

  -- 3. Budget Score (0-25): logged hours vs estimated
  SELECT COALESCE(SUM(estimated_hours), 0), COALESCE(SUM(logged_hours), 0)
  INTO v_total_estimated, v_total_logged
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.client_id = p_client_id
  AND t.estimated_hours IS NOT NULL AND t.estimated_hours > 0;

  IF v_total_estimated > 0 THEN
    IF v_total_logged <= v_total_estimated THEN
      v_budget_score := 25;
    ELSIF v_total_logged <= v_total_estimated * 1.2 THEN
      v_budget_score := 18;
    ELSIF v_total_logged <= v_total_estimated * 1.5 THEN
      v_budget_score := 10;
    ELSE
      v_budget_score := 5;
    END IF;
  ELSE
    v_budget_score := 20;
  END IF;

  -- 4. Engagement Score (0-25): recent activity
  SELECT MAX(t.updated_at)
  INTO v_last_activity
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  WHERE p.client_id = p_client_id;

  IF v_last_activity IS NOT NULL THEN
    IF v_last_activity > now() - INTERVAL '7 days' THEN
      v_engagement_score := 25;
    ELSIF v_last_activity > now() - INTERVAL '14 days' THEN
      v_engagement_score := 20;
    ELSIF v_last_activity > now() - INTERVAL '30 days' THEN
      v_engagement_score := 15;
    ELSIF v_last_activity > now() - INTERVAL '60 days' THEN
      v_engagement_score := 8;
    ELSE
      v_engagement_score := 3;
    END IF;
  ELSE
    v_engagement_score := 10;
  END IF;

  v_total := v_payment_score + v_delivery_score + v_budget_score + v_engagement_score;

  RETURN QUERY SELECT
    v_total,
    v_payment_score,
    v_delivery_score,
    v_budget_score,
    v_engagement_score,
    CASE
      WHEN v_total >= 80 THEN 'healthy'
      WHEN v_total >= 60 THEN 'needs_attention'
      WHEN v_total >= 40 THEN 'at_risk'
      ELSE 'critical'
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== AUTOMATION ENGINE ====================

CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'deal_stage_changed',
    'task_completed',
    'task_overdue',
    'client_payment_overdue',
    'approval_submitted',
    'approval_reviewed'
  )),
  trigger_config JSONB DEFAULT '{}', -- e.g. { "stage": "closed_won" }
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_project_from_template',
    'create_notification',
    'change_task_status',
    'assign_task',
    'send_email'
  )),
  action_config JSONB DEFAULT '{}', -- e.g. { "template_id": "...", "notification_message": "..." }
  is_active BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_trigger ON automations(trigger_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_data JSONB,
  action_result JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_logs_automation ON automation_logs(automation_id, created_at DESC);

CREATE TRIGGER set_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Automations viewable by admin" ON automations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage automations" ON automations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Logs viewable by admin" ON automation_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==================== INVOICING ====================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  -- Amounts
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 22.00,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Details
  description TEXT,
  period_start DATE,
  period_end DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  -- Payment
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  -- Metadata
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(issue_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate totals
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC;
  v_invoice RECORD;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT * INTO v_invoice FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  UPDATE invoices SET
    subtotal = v_subtotal,
    vat_amount = ROUND(v_subtotal * (v_invoice.vat_rate / 100), 2),
    total = ROUND(v_subtotal * (1 + v_invoice.vat_rate / 100), 2)
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recalculate_invoice
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_invoice_totals();

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    SELECT COUNT(*) + 1 INTO v_count FROM invoices WHERE invoice_number LIKE 'FT-' || v_year || '-%';
    NEW.invoice_number := 'FT-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoices viewable by admin" ON invoices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage invoices" ON invoices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Invoice items viewable by admin" ON invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage invoice items" ON invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00046_lead_prospecting.sql
-- ============================================
-- ============================================================
-- Migration 00046: Lead Prospecting & Digital Analysis
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Business info (from Google Places or manual)
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  sector TEXT,
  phone TEXT,
  website TEXT,
  google_maps_url TEXT,
  google_place_id TEXT UNIQUE,
  google_rating NUMERIC(2,1),
  google_reviews_count INTEGER,
  -- Social media links
  instagram_url TEXT,
  facebook_url TEXT,
  tiktok_url TEXT,
  linkedin_url TEXT,
  -- Digital analysis scores (0-100)
  score_website INTEGER DEFAULT 0,       -- Has site? Mobile? SSL? Speed?
  score_social INTEGER DEFAULT 0,        -- Active social? Multiple platforms?
  score_content INTEGER DEFAULT 0,       -- Regular posts? Quality?
  score_advertising INTEGER DEFAULT 0,   -- Running ads?
  score_seo INTEGER DEFAULT 0,           -- Google presence? Reviews?
  score_total INTEGER DEFAULT 0,         -- Weighted average
  -- Analysis details
  analysis_notes JSONB DEFAULT '{}',     -- Detailed findings per area
  analyzed_at TIMESTAMPTZ,
  -- Outreach
  outreach_status TEXT NOT NULL DEFAULT 'new' CHECK (outreach_status IN ('new', 'to_contact', 'contacted', 'interested', 'not_interested', 'converted')),
  outreach_message TEXT,                 -- Generated message
  outreach_channel TEXT CHECK (outreach_channel IN ('whatsapp', 'email', 'phone', 'instagram_dm')),
  outreach_sent_at TIMESTAMPTZ,
  outreach_notes TEXT,
  -- Conversion
  converted_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  -- Meta
  search_query TEXT,                     -- Original search that found this
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_prospects_city_sector ON lead_prospects(city, sector);
CREATE INDEX idx_lead_prospects_score ON lead_prospects(score_total ASC);
CREATE INDEX idx_lead_prospects_outreach ON lead_prospects(outreach_status);
CREATE INDEX idx_lead_prospects_place_id ON lead_prospects(google_place_id) WHERE google_place_id IS NOT NULL;

CREATE TRIGGER set_lead_prospects_updated_at
  BEFORE UPDATE ON lead_prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE lead_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prospects viewable by admin" ON lead_prospects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can manage prospects" ON lead_prospects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00047_audit_fixes.sql
-- ============================================
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


-- ============================================
-- 00048_meta_integration.sql
-- ============================================
-- ============================================================
-- Migration 00048: Meta Business Integration
-- Store connected Facebook Pages + Instagram accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  fb_user_id TEXT,
  fb_user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  instagram_business_id TEXT,
  instagram_username TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(page_id)
);

CREATE TABLE IF NOT EXISTS meta_scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
  meta_page_id UUID NOT NULL REFERENCES meta_pages(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  message TEXT,
  media_url TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  meta_post_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_pages_client ON meta_pages(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_meta_scheduled_status ON meta_scheduled_posts(status);

CREATE TRIGGER set_meta_connections_updated_at BEFORE UPDATE ON meta_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_meta_pages_updated_at BEFORE UPDATE ON meta_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage meta connections" ON meta_connections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage meta pages" ON meta_pages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Team can view meta pages" ON meta_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can manage scheduled posts" ON meta_scheduled_posts FOR ALL TO authenticated
  USING (true);


-- ============================================
-- 00049_agent_runs_log.sql
-- ============================================
-- ============================================
-- Agent Runs Log: traccia ogni esecuzione degli agenti lead generation
-- ============================================

CREATE TYPE agent_type AS ENUM ('lead_scout', 'lead_analyzer', 'lead_outreach');
CREATE TYPE agent_run_status AS ENUM ('running', 'completed', 'failed');

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent agent_type NOT NULL,
  status agent_run_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Cosa ha fatto questo run
  search_params JSONB DEFAULT '{}',
  -- Risultati
  leads_found INTEGER DEFAULT 0,
  leads_analyzed INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_skipped INTEGER DEFAULT 0,
  -- Errori e note
  error_message TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice per query dashboard
CREATE INDEX idx_agent_runs_agent_started ON agent_runs (agent, started_at DESC);
CREATE INDEX idx_agent_runs_status ON agent_runs (status) WHERE status = 'running';

-- RLS: solo admin
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view agent runs"
  ON agent_runs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================
-- 00050_lead_email_and_sender.sql
-- ============================================
-- ============================================
-- Aggiunge email ai lead e tipo agente lead_sender
-- ============================================

-- Campo email per contatto automatico
ALTER TABLE lead_prospects ADD COLUMN IF NOT EXISTS email TEXT;

-- Traccia quando e' stata inviata l'email/whatsapp
ALTER TABLE lead_prospects ADD COLUMN IF NOT EXISTS outreach_sent_at TIMESTAMPTZ;

-- Link WhatsApp pre-generato
ALTER TABLE lead_prospects ADD COLUMN IF NOT EXISTS whatsapp_link TEXT;

-- Nuovo tipo agente
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'lead_sender';


-- ============================================
-- 00051_task_archived_status.sql
-- ============================================
-- Aggiunge lo stato "archived" ai task
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'archived';

-- Funzione cron: archivia automaticamente i task "done" da più di 7 giorni
CREATE OR REPLACE FUNCTION archive_done_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archived_count integer;
BEGIN
  UPDATE tasks
  SET status = 'archived', updated_at = now()
  WHERE status = 'done'
    AND updated_at < now() - interval '7 days';

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;


-- ============================================
-- 00052_create_invoices_with_sdi.sql
-- ============================================
-- ==================== INVOICING + SDI ====================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 22.00,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  period_start DATE,
  period_end DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  notes TEXT,
  -- SDI / Aruba Fatturazione Elettronica
  sdi_status TEXT DEFAULT NULL,
  sdi_identifier TEXT DEFAULT NULL,
  sdi_message TEXT DEFAULT NULL,
  sdi_sent_at TIMESTAMPTZ DEFAULT NULL,
  sdi_filename TEXT DEFAULT NULL,
  -- Metadata
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_sdi_filename ON invoices(sdi_filename) WHERE sdi_filename IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Updated at trigger
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate totals
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC;
  v_invoice RECORD;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT * INTO v_invoice FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  UPDATE invoices SET
    subtotal = v_subtotal,
    vat_amount = ROUND(v_subtotal * (v_invoice.vat_rate / 100), 2),
    total = ROUND(v_subtotal * (1 + v_invoice.vat_rate / 100), 2)
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recalculate_invoice
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_invoice_totals();

-- Auto-generate invoice number (FT-YYYY-0001)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    SELECT COUNT(*) + 1 INTO v_count FROM invoices WHERE invoice_number LIKE 'FT-' || v_year || '-%';
    NEW.invoice_number := 'FT-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoices viewable by admin" ON invoices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage invoices" ON invoices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Invoice items viewable by admin" ON invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage invoice items" ON invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00053_task_delivery_url.sql
-- ============================================
-- Add delivery_url field to tasks for Google Drive / Figma / Canva links
-- Required when marking a task as "done" so admin can see the completed work
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delivery_url TEXT DEFAULT NULL;


-- ============================================
-- 00054_team_tools.sql
-- ============================================
-- Team Tools: quick-access links to external tools with optional saved credentials
CREATE TABLE IF NOT EXISTS team_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon_url TEXT,
  icon_emoji TEXT,
  category TEXT NOT NULL DEFAULT 'generale',
  description TEXT,
  username TEXT,
  password TEXT,
  notes TEXT,
  roles TEXT[] DEFAULT NULL, -- NULL = visible to all, otherwise array of roles
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_tools_active ON team_tools(is_active, sort_order);

CREATE TRIGGER set_team_tools_updated_at
  BEFORE UPDATE ON team_tools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE team_tools ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active tools
CREATE POLICY "Tools viewable by all" ON team_tools
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Only admins can manage tools
CREATE POLICY "Admin can manage tools" ON team_tools
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00055_operating_expenses_and_cfo.sql
-- ============================================
-- Operating expenses table for tracking all non-salary business costs
CREATE TABLE IF NOT EXISTS operating_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'altro',
  amount NUMERIC(10,2) NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'quarterly', 'yearly', 'one_time')),
  start_date DATE,
  end_date DATE,
  vendor TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_active ON operating_expenses(is_active, category);

CREATE TRIGGER set_operating_expenses_updated_at
  BEFORE UPDATE ON operating_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Expenses viewable by admin" ON operating_expenses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage expenses" ON operating_expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 00056_payslips_and_invoice_analysis.sql
-- ============================================
-- Payslips: actual payslip data uploaded by admin for each employee per month
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of the month (e.g. 2026-04-01)
  -- Amounts from the actual payslip
  ral NUMERIC(10,2), -- Retribuzione Annua Lorda
  lordo_mensile NUMERIC(10,2) NOT NULL, -- Stipendio lordo mensile
  netto_mensile NUMERIC(10,2) NOT NULL, -- Netto in busta
  inps_dipendente NUMERIC(10,2) DEFAULT 0, -- INPS carico dipendente
  irpef NUMERIC(10,2) DEFAULT 0, -- IRPEF trattenuta
  addizionale_regionale NUMERIC(10,2) DEFAULT 0,
  addizionale_comunale NUMERIC(10,2) DEFAULT 0,
  bonus_100 NUMERIC(10,2) DEFAULT 0, -- ex bonus Renzi
  straordinari NUMERIC(10,2) DEFAULT 0,
  premi NUMERIC(10,2) DEFAULT 0,
  trattenute_varie NUMERIC(10,2) DEFAULT 0,
  -- Costo azienda
  inps_azienda NUMERIC(10,2) DEFAULT 0, -- INPS carico azienda
  tfr_accantonamento NUMERIC(10,2) DEFAULT 0,
  inail NUMERIC(10,2) DEFAULT 0,
  costo_totale_azienda NUMERIC(10,2), -- Costo totale per l'azienda per quel mese
  -- File
  attachment_url TEXT,
  attachment_name TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month)
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id, month DESC);

CREATE TRIGGER set_payslips_updated_at
  BEFORE UPDATE ON payslips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payslips viewable by admin" ON payslips
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can manage payslips" ON payslips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 20260415_add_sdi_fields.sql
-- ============================================
-- Add SDI (Sistema di Interscambio) fields to invoices table for Aruba integration
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_status text DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_identifier text DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_message text DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_sent_at timestamptz DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_filename text DEFAULT NULL;

-- Index for quick lookup by SDI filename
CREATE INDEX IF NOT EXISTS idx_invoices_sdi_filename ON invoices(sdi_filename) WHERE sdi_filename IS NOT NULL;


-- ============================================
-- 20260417_user_totp.sql
-- ============================================
-- Tabella per salvare i segreti TOTP per la 2FA
create table if not exists user_totp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  secret text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- RLS: solo il service role può accedere (le API usano service role client)
alter table user_totp enable row level security;

-- Policy: nessun accesso diretto dal browser (solo via API server-side con service role)
-- Non creiamo policy per anon/authenticated, così il browser non può leggere/scrivere i secrets


-- ============================================
-- 20260418062850_create_api_usage_table.sql
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service text NOT NULL,
  month text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(service, month)
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

