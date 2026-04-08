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
