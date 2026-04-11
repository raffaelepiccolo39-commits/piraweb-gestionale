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
