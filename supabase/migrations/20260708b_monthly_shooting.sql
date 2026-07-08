-- ============================================================
-- Shooting mensile per cliente.
-- - Flag sul cliente: chi fa lo shooting ogni mese.
-- - Eventi calendario collegati al cliente + tipo evento (shooting/general).
-- - Tabella "salti": cliente che questo mese NON fa shooting.
-- Il pannello Calendario mostra i clienti flaggati che non hanno ancora
-- uno shooting programmato nel mese corrente e non sono stati saltati.
-- ============================================================

-- 1) Flag cliente
ALTER TABLE clients ADD COLUMN IF NOT EXISTS needs_monthly_shooting BOOLEAN NOT NULL DEFAULT false;

-- 2) Eventi calendario: collegamento cliente + tipo
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type);

-- 3) Salti mensili (client + mese 'YYYY-MM')
CREATE TABLE IF NOT EXISTS client_shooting_skips (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month)
);
ALTER TABLE client_shooting_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shooting_skips_select" ON client_shooting_skips;
CREATE POLICY "shooting_skips_select" ON client_shooting_skips
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shooting_skips_insert" ON client_shooting_skips;
CREATE POLICY "shooting_skips_insert" ON client_shooting_skips
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shooting_skips_delete" ON client_shooting_skips;
CREATE POLICY "shooting_skips_delete" ON client_shooting_skips
  FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
