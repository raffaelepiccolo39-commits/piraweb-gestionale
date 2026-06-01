-- Audit log per azioni sensibili: creazioni utenti, modifiche ruoli,
-- emissioni fatture SDI, invii inviti, ecc.
-- Non sostituisce activity_log esistente (che tracka azioni applicative
-- di team su clienti/progetti), questo è dedicato a security/compliance.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Solo admin può leggere. Nessuno può INSERT/UPDATE/DELETE direttamente
-- (le scritture passano dal service role dell'app).
CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  USING (public.is_admin());

-- Nessuna policy di INSERT/UPDATE/DELETE → bloccato per tutti tranne service_role
