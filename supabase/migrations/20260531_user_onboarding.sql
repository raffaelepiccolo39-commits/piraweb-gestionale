-- User onboarding fields
-- - must_change_password: nuovi utenti devono impostare una loro password al primo accesso
-- - onboarded_at: timestamp di completamento wizard primo accesso
-- Esistenti vengono backfillati: must_change_password=false, onboarded_at=created_at

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ NULL;

-- Backfill utenti già attivi: non li forziamo al wizard
UPDATE profiles
SET must_change_password = FALSE,
    onboarded_at = COALESCE(onboarded_at, created_at)
WHERE onboarded_at IS NULL
  AND created_at < NOW();

-- Index per query rapide "utenti pending" in admin UI
CREATE INDEX IF NOT EXISTS idx_profiles_onboarded_at_null
  ON profiles (created_at DESC)
  WHERE onboarded_at IS NULL;

-- RLS: l'utente può aggiornare le proprie colonne onboarding sul suo profilo
-- (la policy "Users can update own profile" esistente già lo consente, questo è solo defensive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
