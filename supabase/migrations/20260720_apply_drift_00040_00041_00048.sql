-- ============================================================
-- Recupero drift: migration 00040 / 00041 / 00048 mai applicate in prod
-- ============================================================
--
-- Audit del 20/07/2026 (PostgREST + service key su tutte le 79 tabelle create
-- dalle migration del repo): 10 tabelle risultano ASSENTI dal database.
-- Le pagine che le usano falliscono da mesi in silenzio:
--   - social_posts        -> /social-calendar, /ai-content, assistente cliente
--   - client_assets       -> libreria asset nella scheda cliente
--   - meetings + action   -> /meetings e la prenotazione pubblica /api/booking
--   - content_approvals   -> approvazione contenuti nelle task, /review/[token]
--   - meta_*              -> integrazione Meta (OAuth + pubblicazione)
--
-- NON incluse qui le tabelle automations/automation_logs della 00045: la
-- sezione Automazioni è stata deliberatamente nascosta perché decorativa.
--
-- Lo script è RIPETIBILE: si può rilanciare senza danno (IF NOT EXISTS
-- ovunque, DROP ... IF EXISTS prima di trigger e policy). Va eseguito nel
-- SQL Editor di Supabase, tutto in una volta.
--
-- DIFFERENZA VOLUTA rispetto agli originali: le policy usano public.is_admin()
-- e (select auth.uid()) invece di EXISTS(... FROM profiles ...) e auth.uid()
-- nudo. È lo standard adottato dal repo con la 20260715_rls_perf_optimization
-- (auth.uid() non wrappato viene rivalutato riga per riga). Semantica identica,
-- costo per query molto minore.
-- ============================================================


-- ============================================================
-- PARTE 1 — da 00040: approvazione contenuti
-- ============================================================

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'revision_requested');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS content_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_url TEXT,
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

CREATE INDEX IF NOT EXISTS idx_content_approvals_task ON content_approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_content_approvals_status ON content_approvals(status);
CREATE INDEX IF NOT EXISTS idx_content_approvals_share ON content_approvals(share_token) WHERE share_token IS NOT NULL;

DROP TRIGGER IF EXISTS set_content_approvals_updated_at ON content_approvals;
CREATE TRIGGER set_content_approvals_updated_at
  BEFORE UPDATE ON content_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE content_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approvals viewable by project members and admin" ON content_approvals;
CREATE POLICY "Approvals viewable by project members and admin"
  ON content_approvals FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR submitted_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE t.id = content_approvals.task_id AND pm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can submit approvals" ON content_approvals;
CREATE POLICY "Authenticated users can submit approvals"
  ON content_approvals FOR INSERT TO authenticated
  WITH CHECK (submitted_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins and submitters can update approvals" ON content_approvals;
CREATE POLICY "Admins and submitters can update approvals"
  ON content_approvals FOR UPDATE TO authenticated
  USING (submitted_by = (select auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Admins can delete approvals" ON content_approvals;
CREATE POLICY "Admins can delete approvals"
  ON content_approvals FOR DELETE TO authenticated
  USING (public.is_admin() OR submitted_by = (select auth.uid()));

-- NB: /review/[token] è pubblica nel middleware ma qui NON c'è nessuna policy
-- per il ruolo anon, quindi un cliente non loggato continuerà a vedere "Link
-- non valido". È voluto: l'accesso cliente va costruito col portale, non con
-- un token anonimo senza scadenza.


-- ============================================================
-- PARTE 2 — da 00041: piano editoriale, libreria asset, riunioni
-- ============================================================

DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'pinterest', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE social_post_status AS ENUM ('idea', 'draft', 'ready', 'scheduled', 'published', 'rejected');
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

CREATE INDEX IF NOT EXISTS idx_social_posts_client ON social_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_date_range ON social_posts(scheduled_at DESC, client_id);

DROP TRIGGER IF EXISTS set_social_posts_updated_at ON social_posts;
CREATE TRIGGER set_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Social posts viewable by team" ON social_posts;
CREATE POLICY "Social posts viewable by team" ON social_posts
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR created_by = (select auth.uid())
    OR assigned_to = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = social_posts.client_id AND pm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated can create social posts" ON social_posts;
CREATE POLICY "Authenticated can create social posts" ON social_posts
  FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Creators and admin can update social posts" ON social_posts;
CREATE POLICY "Creators and admin can update social posts" ON social_posts
  FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR assigned_to = (select auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin can delete social posts" ON social_posts;
CREATE POLICY "Admin can delete social posts" ON social_posts
  FOR DELETE TO authenticated
  USING (created_by = (select auth.uid()) OR public.is_admin());


-- ---------- Libreria asset ----------

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('logo', 'color', 'font', 'image', 'template', 'guideline', 'video', 'other');
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
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_assets_client ON client_assets(client_id);
CREATE INDEX IF NOT EXISTS idx_client_assets_type ON client_assets(client_id, type);

DROP TRIGGER IF EXISTS set_client_assets_updated_at ON client_assets;
CREATE TRIGGER set_client_assets_updated_at
  BEFORE UPDATE ON client_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assets viewable by authorized users" ON client_assets;
CREATE POLICY "Assets viewable by authorized users" ON client_assets
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = client_assets.client_id AND pm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated can upload assets" ON client_assets;
CREATE POLICY "Authenticated can upload assets" ON client_assets
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = (select auth.uid()));

DROP POLICY IF EXISTS "Uploaders and admin can update assets" ON client_assets;
CREATE POLICY "Uploaders and admin can update assets" ON client_assets
  FOR UPDATE TO authenticated
  USING (uploaded_by = (select auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Uploaders and admin can delete assets" ON client_assets;
CREATE POLICY "Uploaders and admin can delete assets" ON client_assets
  FOR DELETE TO authenticated
  USING (uploaded_by = (select auth.uid()) OR public.is_admin());


-- ---------- Riunioni ----------

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  attendees UUID[] DEFAULT '{}',
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON meetings(client_id) WHERE client_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_meetings_updated_at ON meetings;
CREATE TRIGGER set_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting ON meeting_action_items(meeting_id);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Meetings viewable by authenticated" ON meetings;
CREATE POLICY "Meetings viewable by authenticated" ON meetings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can create meetings" ON meetings;
CREATE POLICY "Authenticated can create meetings" ON meetings
  FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Creator and admin can update meetings" ON meetings;
CREATE POLICY "Creator and admin can update meetings" ON meetings
  FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Admin can delete meetings" ON meetings;
CREATE POLICY "Admin can delete meetings" ON meetings
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Action items viewable by authenticated" ON meeting_action_items;
CREATE POLICY "Action items viewable by authenticated" ON meeting_action_items
  FOR SELECT TO authenticated USING (true);

-- Versione ristretta della 00047 (l'originale non passò mai: la tabella non
-- esisteva e lo script si fermava alla prima riga).
DROP POLICY IF EXISTS "Authenticated can create action items" ON meeting_action_items;
DROP POLICY IF EXISTS "Meeting participants can create action items" ON meeting_action_items;
CREATE POLICY "Meeting participants can create action items" ON meeting_action_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_action_items.meeting_id
      AND (m.created_by = (select auth.uid())
           OR (select auth.uid()) = ANY(m.attendees)
           OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Assigned and admin can update action items" ON meeting_action_items;
CREATE POLICY "Assigned and admin can update action items" ON meeting_action_items
  FOR UPDATE TO authenticated
  USING (
    assigned_to = (select auth.uid())
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_action_items.meeting_id AND m.created_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Admin can delete action items" ON meeting_action_items;
CREATE POLICY "Admin can delete action items" ON meeting_action_items
  FOR DELETE TO authenticated USING (public.is_admin());


-- ============================================================
-- PARTE 3 — da 00048: integrazione Meta
-- (dopo social_posts: meta_scheduled_posts la referenzia)
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

CREATE INDEX IF NOT EXISTS idx_meta_pages_client ON meta_pages(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_scheduled_status ON meta_scheduled_posts(status);

DROP TRIGGER IF EXISTS set_meta_connections_updated_at ON meta_connections;
CREATE TRIGGER set_meta_connections_updated_at BEFORE UPDATE ON meta_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_meta_pages_updated_at ON meta_pages;
CREATE TRIGGER set_meta_pages_updated_at BEFORE UPDATE ON meta_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_scheduled_posts ENABLE ROW LEVEL SECURITY;

-- I token di accesso Meta stanno in chiaro in queste tabelle: la lettura resta
-- riservata agli admin (meta_pages ha in più una SELECT per il team, che però
-- espone page_access_token — da restringere quando si toccherà l'integrazione).
DROP POLICY IF EXISTS "Admin can manage meta connections" ON meta_connections;
CREATE POLICY "Admin can manage meta connections" ON meta_connections FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage meta pages" ON meta_pages;
CREATE POLICY "Admin can manage meta pages" ON meta_pages FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Team can view meta pages" ON meta_pages;
CREATE POLICY "Team can view meta pages" ON meta_pages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team can manage scheduled posts" ON meta_scheduled_posts;
CREATE POLICY "Team can manage scheduled posts" ON meta_scheduled_posts FOR ALL TO authenticated
  USING (true);


-- ============================================================
-- PARTE 4 — recupero della 00047 (fix 2), mai eseguito
-- Riallinea tasks.logged_hours ai time_entries già registrati.
-- Idempotente: ricalcola sempre dalla somma, non incrementa.
-- ============================================================

UPDATE tasks SET logged_hours = COALESCE((
  SELECT SUM(duration_minutes) / 60.0
  FROM time_entries
  WHERE task_id = tasks.id AND duration_minutes IS NOT NULL
), 0)
WHERE EXISTS (SELECT 1 FROM time_entries WHERE task_id = tasks.id);


-- ============================================================
-- Ricarica lo schema cache di PostgREST: senza questo le tabelle
-- appena create continuano a rispondere 404 (PGRST205) all'app.
-- ============================================================
NOTIFY pgrst, 'reload schema';
