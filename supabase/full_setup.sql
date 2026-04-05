-- ============================================
-- PiraWeb Gestionale - Setup Completo Database
-- Copia e incolla tutto nell'SQL Editor di Supabase
-- ============================================

-- ============================================
-- 1. ENUM TYPES
-- ============================================
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin','social_media_manager','content_creator','graphic_social','graphic_brand'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE project_status AS ENUM ('draft','active','paused','completed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('backlog','todo','in_progress','review','done'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('task_assigned','task_updated','task_completed','project_created','post_created','comment_added','mention','deadline_approaching','ai_script_ready'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_provider AS ENUM ('claude','openai'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE script_type AS ENUM ('social_post','blog_article','email_campaign','ad_copy','video_script','brand_guidelines','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE post_category AS ENUM ('announcement','update','idea','question','celebration'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE activity_action AS ENUM ('created','updated','deleted','completed','assigned','commented','status_changed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE activity_entity AS ENUM ('client','project','task','post','ai_script'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 2. HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'content_creator',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile" ON profiles FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 4. CLIENTS
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
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

CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);

DROP TRIGGER IF EXISTS set_clients_updated_at ON clients;
CREATE TRIGGER set_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients viewable by all authenticated users" ON clients;
CREATE POLICY "Clients viewable by all authenticated users" ON clients FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can insert clients" ON clients;
CREATE POLICY "Admins can insert clients" ON clients FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins can update clients" ON clients;
CREATE POLICY "Admins can update clients" ON clients FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins can delete clients" ON clients;
CREATE POLICY "Admins can delete clients" ON clients FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 5. PROJECTS
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
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

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);

DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Projects viewable by members and admins" ON projects;
CREATE POLICY "Projects viewable by members and admins" ON projects FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR EXISTS (SELECT 1 FROM project_members WHERE project_id = id AND user_id = auth.uid()) OR created_by = auth.uid());
DROP POLICY IF EXISTS "Admins can insert projects" ON projects;
CREATE POLICY "Admins can insert projects" ON projects FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins can update projects" ON projects;
CREATE POLICY "Admins can update projects" ON projects FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;
CREATE POLICY "Admins can delete projects" ON projects FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Project members viewable by authenticated" ON project_members;
CREATE POLICY "Project members viewable by authenticated" ON project_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage project members" ON project_members;
CREATE POLICY "Admins can manage project members" ON project_members FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 6. TASKS
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(project_id, status, position);

DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

DROP TRIGGER IF EXISTS set_task_comments_updated_at ON task_comments;
CREATE TRIGGER set_task_comments_updated_at BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tasks viewable by project members and admins" ON tasks;
CREATE POLICY "Tasks viewable by project members and admins" ON tasks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR assigned_to = auth.uid() OR EXISTS (SELECT 1 FROM project_members WHERE project_id = tasks.project_id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins can insert tasks" ON tasks;
CREATE POLICY "Admins can insert tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins and assignees can update tasks" ON tasks;
CREATE POLICY "Admins and assignees can update tasks" ON tasks FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR assigned_to = auth.uid());
DROP POLICY IF EXISTS "Admins can delete tasks" ON tasks;
CREATE POLICY "Admins can delete tasks" ON tasks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Comments viewable by project members" ON task_comments;
CREATE POLICY "Comments viewable by project members" ON task_comments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id WHERE t.id = task_comments.task_id AND pm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Authenticated users can add comments" ON task_comments;
CREATE POLICY "Authenticated users can add comments" ON task_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own comments" ON task_comments;
CREATE POLICY "Users can update own comments" ON task_comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own comments or admin" ON task_comments;
CREATE POLICY "Users can delete own comments or admin" ON task_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Attachments viewable by project members" ON task_attachments;
CREATE POLICY "Attachments viewable by project members" ON task_attachments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id WHERE t.id = task_attachments.task_id AND pm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON task_attachments;
CREATE POLICY "Authenticated users can upload attachments" ON task_attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
DROP POLICY IF EXISTS "Uploaders and admins can delete attachments" ON task_attachments;
CREATE POLICY "Uploaders and admins can delete attachments" ON task_attachments FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 7. AI SCRIPTS
-- ============================================
CREATE TABLE IF NOT EXISTS ai_scripts (
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

CREATE INDEX IF NOT EXISTS idx_ai_scripts_client ON ai_scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_scripts_project ON ai_scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_scripts_created_by ON ai_scripts(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_scripts_type ON ai_scripts(script_type);

DROP TRIGGER IF EXISTS set_ai_scripts_updated_at ON ai_scripts;
CREATE TRIGGER set_ai_scripts_updated_at BEFORE UPDATE ON ai_scripts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_scripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scripts viewable by creator and admins" ON ai_scripts;
CREATE POLICY "Scripts viewable by creator and admins" ON ai_scripts FOR SELECT TO authenticated USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Authenticated users can create scripts" ON ai_scripts;
CREATE POLICY "Authenticated users can create scripts" ON ai_scripts FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Creators can update own scripts" ON ai_scripts;
CREATE POLICY "Creators can update own scripts" ON ai_scripts FOR UPDATE TO authenticated USING (created_by = auth.uid());
DROP POLICY IF EXISTS "Creators and admins can delete scripts" ON ai_scripts;
CREATE POLICY "Creators and admins can delete scripts" ON ai_scripts FOR DELETE TO authenticated USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 8. BACHECA (Posts)
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category post_category NOT NULL DEFAULT 'update',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(is_pinned DESC, created_at DESC);

DROP TRIGGER IF EXISTS set_posts_updated_at ON posts;
CREATE TRIGGER set_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);

DROP TRIGGER IF EXISTS set_post_comments_updated_at ON post_comments;
CREATE TRIGGER set_post_comments_updated_at BEFORE UPDATE ON post_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Posts viewable by all authenticated" ON posts;
CREATE POLICY "Posts viewable by all authenticated" ON posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can create posts" ON posts;
CREATE POLICY "Authenticated users can create posts" ON posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors and admins can update posts" ON posts;
CREATE POLICY "Authors and admins can update posts" ON posts FOR UPDATE TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Authors and admins can delete posts" ON posts;
CREATE POLICY "Authors and admins can delete posts" ON posts FOR DELETE TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Post comments viewable by all authenticated" ON post_comments;
CREATE POLICY "Post comments viewable by all authenticated" ON post_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can add post comments" ON post_comments;
CREATE POLICY "Authenticated users can add post comments" ON post_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can update own post comments" ON post_comments;
CREATE POLICY "Authors can update own post comments" ON post_comments FOR UPDATE TO authenticated USING (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors and admins can delete post comments" ON post_comments;
CREATE POLICY "Authors and admins can delete post comments" ON post_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reactions viewable by all authenticated" ON post_reactions;
CREATE POLICY "Reactions viewable by all authenticated" ON post_reactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can add own reactions" ON post_reactions;
CREATE POLICY "Users can add own reactions" ON post_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can remove own reactions" ON post_reactions;
CREATE POLICY "Users can remove own reactions" ON post_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================
-- 9. NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID, p_type notification_type, p_title TEXT,
  p_message TEXT DEFAULT NULL, p_link TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_task_assigned() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    PERFORM create_notification(NEW.assigned_to, 'task_assigned', 'Nuovo task assegnato',
      format('Ti è stato assegnato il task: %s', NEW.title),
      format('/projects/%s', NEW.project_id),
      jsonb_build_object('task_id', NEW.id, 'project_id', NEW.project_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_task_assigned ON tasks;
CREATE TRIGGER on_task_assigned AFTER INSERT OR UPDATE OF assigned_to ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

CREATE OR REPLACE FUNCTION notify_task_completed() RETURNS TRIGGER AS $$
DECLARE v_project_creator UUID;
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    SELECT created_by INTO v_project_creator FROM projects WHERE id = NEW.project_id;
    IF v_project_creator IS NOT NULL AND v_project_creator != auth.uid() THEN
      PERFORM create_notification(v_project_creator, 'task_completed', 'Task completato',
        format('Il task "%s" è stato completato', NEW.title),
        format('/projects/%s', NEW.project_id),
        jsonb_build_object('task_id', NEW.id, 'project_id', NEW.project_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_task_completed ON tasks;
CREATE TRIGGER on_task_completed AFTER UPDATE OF status ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_completed();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================
-- 10. ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action activity_action NOT NULL,
  entity_type activity_entity NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Activity viewable by admins" ON activity_log;
CREATE POLICY "Activity viewable by admins" ON activity_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR user_id = auth.uid());
DROP POLICY IF EXISTS "System can insert activity" ON activity_log;
CREATE POLICY "System can insert activity" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION log_activity(
  p_user_id UUID, p_action activity_action, p_entity_type activity_entity,
  p_entity_id UUID, p_entity_name TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, metadata)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_entity_name, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_task_stats()
RETURNS TABLE (status task_status, count BIGINT) AS $$
BEGIN RETURN QUERY SELECT t.status, COUNT(*) FROM tasks t GROUP BY t.status; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_tasks_per_user()
RETURNS TABLE (user_id UUID, full_name TEXT, role user_role, total_tasks BIGINT, completed_tasks BIGINT, in_progress_tasks BIGINT) AS $$
BEGIN RETURN QUERY SELECT p.id, p.full_name, p.role, COUNT(t.id), COUNT(t.id) FILTER (WHERE t.status = 'done'), COUNT(t.id) FILTER (WHERE t.status = 'in_progress') FROM profiles p LEFT JOIN tasks t ON t.assigned_to = p.id WHERE p.is_active = true GROUP BY p.id, p.full_name, p.role; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_project_progress()
RETURNS TABLE (project_id UUID, project_name TEXT, total_tasks BIGINT, completed_tasks BIGINT, progress_pct NUMERIC) AS $$
BEGIN RETURN QUERY SELECT pr.id, pr.name, COUNT(t.id), COUNT(t.id) FILTER (WHERE t.status = 'done'), CASE WHEN COUNT(t.id) = 0 THEN 0 ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::NUMERIC / COUNT(t.id)) * 100, 1) END FROM projects pr LEFT JOIN tasks t ON t.project_id = pr.id WHERE pr.status IN ('active', 'draft') GROUP BY pr.id, pr.name; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('client-logos', 'client-logos', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
DROP POLICY IF EXISTS "Attachments accessible by authenticated" ON storage.objects;
CREATE POLICY "Attachments accessible by authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attachments');
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments');
DROP POLICY IF EXISTS "Client logos are publicly accessible" ON storage.objects;
CREATE POLICY "Client logos are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'client-logos');
DROP POLICY IF EXISTS "Admins can upload client logos" ON storage.objects;
CREATE POLICY "Admins can upload client logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-logos' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 12. SEED: Setup team roles function
-- ============================================
CREATE OR REPLACE FUNCTION setup_team_roles() RETURNS void AS $$
BEGIN
  UPDATE profiles SET full_name = 'Raffaele Antonio Piccolo', role = 'admin' WHERE email = 'info@piraweb.it';
  UPDATE profiles SET full_name = 'Bernis Del Villano', role = 'social_media_manager' WHERE email = 'bernis@piraweb.it';
  UPDATE profiles SET full_name = 'Manuela Del Villano', role = 'content_creator' WHERE email = 'manuela@piraweb.it';
  UPDATE profiles SET full_name = 'Raffaela Sparaco', role = 'graphic_social' WHERE email = 'raffaela@piraweb.it';
  UPDATE profiles SET full_name = 'Gaia Coppeto', role = 'graphic_brand' WHERE email = 'gaia@piraweb.it';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION seed_sample_clients(p_admin_id UUID) RETURNS void AS $$
BEGIN
  INSERT INTO clients (name, company, email, phone, website, notes, created_by) VALUES
    ('Mario Rossi', 'Rossi & Partners', 'mario@rossipartners.it', '+39 081 1234567', 'https://rossipartners.it', 'Cliente storico, settore legale', p_admin_id),
    ('Lucia Bianchi', 'Bianchi Fashion', 'lucia@bianchifashion.it', '+39 02 9876543', 'https://bianchifashion.it', 'Brand di moda emergente', p_admin_id),
    ('Giuseppe Verde', 'Verde Ristorazione', 'info@verderistorante.it', '+39 06 5551234', 'https://verderistorante.it', 'Catena di ristoranti campani', p_admin_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- DONE! Ora esegui in ordine:
-- 1. SELECT setup_team_roles();
-- 2. (Opzionale) SELECT seed_sample_clients('IL_TUO_ADMIN_UUID');
-- ============================================
