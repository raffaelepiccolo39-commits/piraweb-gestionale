-- CRM revamp v1: nuovi campi + cleanup stage.
-- - priority enum (high/medium/low)
-- - tags text[] libero (per "urgente", "top", ecc.)
-- - service_categories text[] (multi-select Web/Social/Ads/...)
-- - migra deal "qualified" → "lead" (l'enum value resta nel DB ma sparisce dall'UI)

-- ============================================
-- 1. Enum priority
-- ============================================
DO $$ BEGIN
  CREATE TYPE deal_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. Colonne nuove su deals
-- ============================================
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS priority deal_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS service_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_deals_priority ON deals (priority)
  WHERE stage NOT IN ('closed_won', 'closed_lost');
CREATE INDEX IF NOT EXISTS idx_deals_tags ON deals USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_deals_service_categories ON deals USING gin (service_categories);

-- ============================================
-- 3. Stage cleanup: deals "qualified" rinconfluiscono in "lead".
-- L'enum value "qualified" resta nel DB (Postgres non drop), la UI smette
-- di mostrarlo. Se in futuro si vorrà ripristinare, basta riaggiungerlo
-- nella STAGES const.
-- ============================================
UPDATE deals SET stage = 'lead' WHERE stage = 'qualified';

NOTIFY pgrst, 'reload schema';
