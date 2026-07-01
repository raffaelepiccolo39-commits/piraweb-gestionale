-- Licenziamento membri del team.
-- terminated_at distingue un membro LICENZIATO (accesso bloccato via ban auth,
-- storico conservato) da uno solo SOSPESO (is_active=false, ma può ancora loggarsi).
-- NULL = attivo o sospeso; valorizzato = licenziato.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terminated_at timestamptz;

NOTIFY pgrst, 'reload schema';
