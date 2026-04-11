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
