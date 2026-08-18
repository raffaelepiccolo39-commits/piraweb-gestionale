-- Ricostruzione dello schema esistente su cui poggia la migration.
-- Copiato dalle migration reali: 00001, 00002, 00007, 00044, 20260601,
-- 20260531_rls_helpers, 20260718c.

-- Ruoli Supabase, altrimenti GRANT ... TO authenticated e le policy falliscono
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
-- auth.uid() pilotabile dai test via GUC
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

CREATE TYPE user_role AS ENUM ('admin','social_media_manager','content_creator','graphic_social','graphic_brand');
CREATE TYPE notification_type AS ENUM ('task_assigned','task_updated','task_completed','project_created','post_created','comment_added','mention','deadline_approaching','ai_script_ready');
CREATE TYPE deal_stage AS ENUM ('lead','qualified','proposal','negotiation','closed_won','closed_lost');
CREATE TYPE deal_source AS ENUM ('website','referral','social_media','cold_outreach','event','ads','other');
CREATE TYPE deal_priority AS ENUM ('high','medium','low');

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'content_creator',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID, p_type notification_type, p_title TEXT,
  p_message TEXT DEFAULT NULL, p_link TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid());
$$;

CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  stage deal_stage NOT NULL DEFAULT 'lead',
  value NUMERIC(12,2) DEFAULT 0,
  monthly_value NUMERIC(10,2),
  probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  source deal_source DEFAULT 'other',
  services TEXT,
  notes TEXT,
  expected_close_date DATE,
  actual_close_date DATE,
  lost_reason TEXT,
  converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  priority deal_priority NOT NULL DEFAULT 'medium',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  service_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE TRIGGER set_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','note','stage_change','proposal_sent','follow_up')),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_deal_probability() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage != OLD.stage THEN
    NEW.probability := CASE NEW.stage
      WHEN 'lead' THEN 10 WHEN 'qualified' THEN 25 WHEN 'proposal' THEN 50
      WHEN 'negotiation' THEN 75 WHEN 'closed_won' THEN 100 WHEN 'closed_lost' THEN 0 END;
    IF NEW.stage IN ('closed_won','closed_lost') AND NEW.actual_close_date IS NULL THEN
      NEW.actual_close_date := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_update_deal_probability BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_deal_probability();

CREATE OR REPLACE FUNCTION log_deal_stage_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.stage != OLD.stage THEN
    INSERT INTO deal_activities (deal_id, type, title, description, completed, created_by)
    VALUES (NEW.id, 'stage_change', format('Passato a: %s', NEW.stage), NULL, true, COALESCE(auth.uid(), NEW.owner_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_log_deal_stage_change AFTER UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- RLS di `deals` com'è in produzione: la policy di lettura viene dalla
-- 20260722 (che aveva chiuso una lettura aperta a tutto il team), quella di
-- scrittura è ancora quella del 00044. Senza queste righe i test girano
-- contro una tabella senza policy e passano anche quando non dovrebbero.
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals viewable by admin" ON deals
  FOR SELECT TO authenticated
  USING (public.is_admin() OR owner_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Admin and owner can manage deals" ON deals
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR created_by = auth.uid() OR public.is_admin());

CREATE POLICY "Activities viewable by admin" ON deal_activities
  FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM deals d WHERE d.id = deal_activities.deal_id
      AND (d.owner_id = auth.uid() OR d.created_by = auth.uid())));

CREATE TABLE company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  office_lat double precision,
  office_lng double precision,
  office_radius_m integer NOT NULL DEFAULT 150,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);
INSERT INTO company_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
