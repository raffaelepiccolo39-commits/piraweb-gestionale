-- Note private per collaboratore, per cliente (diario datato).
-- Ogni nota appartiene a un utente: RLS strettamente privata — la vede e
-- modifica SOLO l'autore, nessuna eccezione admin.

CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_user_client
  ON client_notes(user_id, client_id, created_at DESC);

ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_notes own select" ON client_notes;
CREATE POLICY "client_notes own select" ON client_notes
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "client_notes own insert" ON client_notes;
CREATE POLICY "client_notes own insert" ON client_notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "client_notes own update" ON client_notes;
CREATE POLICY "client_notes own update" ON client_notes
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "client_notes own delete" ON client_notes;
CREATE POLICY "client_notes own delete" ON client_notes
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_client_notes_updated_at ON client_notes;
CREATE TRIGGER set_client_notes_updated_at
  BEFORE UPDATE ON client_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
