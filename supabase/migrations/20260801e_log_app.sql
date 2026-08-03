-- Distinguere gli errori dell'app da quelli del sito.
--
-- Finora un errore era solo "client": non si sapeva se veniva da un browser
-- sul computer, da un iPhone o da un Android, ne' da quale versione dell'app.
-- Senza quei due dati il registro non serve a migliorare l'app: un errore che
-- capita solo su iOS 1.1 e' un'informazione, "un errore nel browser" no.
--
-- Due colonne, non un JSON dentro `context`: si filtra e si raggruppa per
-- queste, e un campo che si interroga di continuo merita di essere una
-- colonna vera.

ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS app_version TEXT;

-- L'indice serve alla sezione "App" del registro, che filtra sempre per
-- piattaforma. Parziale: le righe del sito non hanno piattaforma e sono la
-- maggioranza, tenerle nell'indice sarebbe peso inutile.
CREATE INDEX IF NOT EXISTS idx_error_logs_platform
  ON error_logs(platform, created_at DESC)
  WHERE platform IS NOT NULL;

-- La pagina legge la vista raggruppata, non la tabella: senza aggiungerle qui
-- le due colonne nuove resterebbero invisibili.
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
  bool_and(resolved_at IS NOT NULL)                     AS resolved,
  -- Le tre colonne nuove vanno IN FONDO: CREATE OR REPLACE VIEW non sa
  -- infilare colonne in mezzo a quelle esistenti (prova a rinominare la
  -- prima che trova e si ferma con un 42P16). Aggiungerle qui evita di
  -- dover cancellare e ricreare la vista, che vorrebbe dire perdere i
  -- permessi concessi.
  --
  -- L'ultima piattaforma vista e l'ultima versione: bastano a dire "questo
  -- succede su iPhone" senza aprire il dettaglio.
  (array_agg(platform ORDER BY created_at DESC))[1]     AS platform,
  (array_agg(app_version ORDER BY created_at DESC))[1]  AS app_version,
  -- Su quante piattaforme diverse si e' visto: 1 = problema di quel telefono,
  -- 2+ = problema del gestionale, che si vede anche altrove.
  count(DISTINCT platform)                              AS piattaforme
FROM error_logs
GROUP BY fingerprint;

GRANT SELECT ON error_log_groups TO authenticated;
