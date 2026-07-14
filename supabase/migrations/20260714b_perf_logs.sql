-- Metriche di lentezza.
--
-- Gli errori dicono cosa si è ROTTO, non cosa è LENTO: una pagina che ci mette
-- 8 secondi ma risponde non genera nessun errore. Qui misuriamo le durate.
--
-- Il grosso del gestionale interroga Supabase direttamente dal browser (tutte
-- e 45 le pagine sono 'use client'), quindi intercettando il fetch del client
-- Supabase si misura quasi tutto il traffico dati senza toccare le pagine.

CREATE TABLE IF NOT EXISTS perf_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'query' = chiamata a Supabase; 'route' = handler API; 'page' = caricamento pagina.
  kind TEXT NOT NULL DEFAULT 'query'
    CHECK (kind IN ('query', 'route', 'page')),

  -- Cosa è stato misurato. Per le query: "GET tasks" / "PATCH deals".
  name TEXT NOT NULL,

  duration_ms INTEGER NOT NULL,

  -- Da quale pagina è partita: serve a capire QUALE schermata è lenta.
  route TEXT,

  -- Status HTTP: distingue una query lenta da una query lenta E fallita.
  status INTEGER,

  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Filtri della query, numero di righe, ecc.
  context JSONB DEFAULT '{}'::jsonb,

  build_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_logs_created_at ON perf_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_logs_name ON perf_logs (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_logs_slow ON perf_logs (duration_ms DESC, created_at DESC);

ALTER TABLE perf_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view perf logs"
  ON perf_logs FOR SELECT
  USING (public.is_admin());

-- Scritture solo dal service role (via POST /api/perf), come per error_logs.


-- ─────────────────────────────────────────────────────────────────────────────
-- Vista di sintesi: la classifica di cosa ottimizzare.
--
-- Ordina per tempo TOTALE (p95 × chiamate), non per la singola più lenta: una
-- query da 2s chiamata una volta al giorno conta meno di una da 400ms chiamata
-- 500 volte. Quello che rallenta davvero il team è il secondo caso.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW perf_summary
WITH (security_invoker = true) AS
SELECT
  kind,
  name,
  route,
  count(*)                                                                AS samples,
  round(avg(duration_ms))::int                                            AS avg_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::int           AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int          AS p95_ms,
  max(duration_ms)                                                        AS max_ms,
  -- Il costo complessivo: quanti secondi di attesa ha generato in tutto.
  round(sum(duration_ms) / 1000.0)::int                                   AS total_seconds,
  count(*) FILTER (WHERE status >= 400)                                   AS failures,
  max(created_at)                                                         AS last_seen
FROM perf_logs
WHERE created_at > now() - interval '7 days'
GROUP BY kind, name, route;

GRANT SELECT ON perf_summary TO authenticated;


-- Retention più corta degli errori: sono tanti e invecchiano in fretta.
CREATE OR REPLACE FUNCTION purge_old_perf_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM perf_logs
  WHERE created_at < now() - interval '14 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
