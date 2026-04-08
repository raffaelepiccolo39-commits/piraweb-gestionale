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
