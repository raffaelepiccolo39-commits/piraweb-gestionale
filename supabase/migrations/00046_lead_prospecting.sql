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
