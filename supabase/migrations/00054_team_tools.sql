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
