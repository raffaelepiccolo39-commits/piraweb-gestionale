-- Log degli errori applicativi (client, server, API, cron).
-- Diverso da audit_log (azioni sensibili volute) e da activity_log (azioni
-- di team): qui finisce solo ciò che NON doveva succedere.
--
-- Obiettivo: smettere di perdere gli errori. Oggi la maggior parte dei catch
-- del gestionale non riporta da nessuna parte, e l'ErrorBoundary fa solo
-- console.error — cioè l'errore evapora nella console del browser.

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Gravità. 'error' = qualcosa si è rotto, 'warning' = degradato ma gestito.
  level TEXT NOT NULL DEFAULT 'error'
    CHECK (level IN ('error', 'warning', 'info')),

  -- Da dove arriva: browser, render server, route API, job cron, boundary React.
  source TEXT NOT NULL DEFAULT 'server'
    CHECK (source IN ('client', 'server', 'api', 'cron', 'boundary')),

  message TEXT NOT NULL,
  stack TEXT,

  -- Rotta o pagina in cui è successo (es. '/tasks', '/api/webhook/contact-form').
  route TEXT,

  -- Chiave di raggruppamento: errori uguali sulla stessa rotta condividono il
  -- fingerprint, così la pagina Log mostra "47 volte" invece di 47 righe uguali.
  fingerprint TEXT NOT NULL,

  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,

  -- Contesto libero: payload, id entità, parametri della query fallita...
  context JSONB DEFAULT '{}'::jsonb,

  user_agent TEXT,
  -- Commit SHA del deploy: distingue "già risolto" da "ancora vivo".
  build_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Triage dalla pagina Log.
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs (level, created_at DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Solo admin legge (stesso pattern di audit_log).
CREATE POLICY "Admins can view error logs"
  ON error_logs FOR SELECT
  USING (public.is_admin());

-- Solo admin può marcare risolto/riaprire.
CREATE POLICY "Admins can update error logs"
  ON error_logs FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Nessuna policy INSERT/DELETE → le scritture passano solo dal service role
-- dell'app (lib/logger.ts), come per audit_log.


-- ─────────────────────────────────────────────────────────────────────────────
-- Vista aggregata: un gruppo per fingerprint, con conteggio e ultimo esemplare.
-- È quello che legge la pagina Log: mostra i problemi, non le occorrenze.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW error_log_groups
WITH (security_invoker = true) AS
SELECT
  fingerprint,
  (array_agg(id ORDER BY created_at DESC))[1]           AS last_id,
  (array_agg(message ORDER BY created_at DESC))[1]      AS message,
  (array_agg(stack ORDER BY created_at DESC))[1]        AS stack,
  (array_agg(level ORDER BY created_at DESC))[1]        AS level,
  (array_agg(source ORDER BY created_at DESC))[1]       AS source,
  (array_agg(route ORDER BY created_at DESC))[1]        AS route,
  (array_agg(context ORDER BY created_at DESC))[1]      AS context,
  (array_agg(build_id ORDER BY created_at DESC))[1]     AS build_id,
  (array_agg(user_email ORDER BY created_at DESC))[1]   AS last_user_email,
  count(*)                                              AS occurrences,
  count(DISTINCT user_id)                               AS users_affected,
  min(created_at)                                       AS first_seen,
  max(created_at)                                       AS last_seen,
  -- Il gruppo è "risolto" solo se ogni occorrenza lo è: se ricompare dopo il
  -- fix, la nuova riga ha resolved_at NULL e il gruppo torna aperto da solo.
  bool_and(resolved_at IS NOT NULL)                     AS resolved
FROM error_logs
GROUP BY fingerprint;

-- security_invoker = la vista eredita la RLS di error_logs (solo admin legge).
GRANT SELECT ON error_log_groups TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Retention: gli errori non servono in eterno e la tabella non deve gonfiarsi.
-- Tiene 60 giorni. Chiamata dal cron giornaliero.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_old_error_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM error_logs
  WHERE created_at < now() - interval '60 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
