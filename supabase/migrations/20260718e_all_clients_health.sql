-- ============================================================
-- Salute clienti: tutti i clienti in UNA query (non 20 chiamate).
-- ============================================================
-- La pagina Direzione chiamava calculate_client_health() una volta per cliente
-- (fino a 20 round-trip a ogni apertura). Questa versione set-based calcola gli
-- stessi 4 punteggi per TUTTI i clienti attivi in un colpo solo, con identica
-- logica e soglie. calculate_client_health() resta invariata per altri usi.

CREATE OR REPLACE FUNCTION calculate_all_clients_health()
RETURNS TABLE (
  client_id UUID,
  health_score INTEGER,
  payment_score INTEGER,
  delivery_score INTEGER,
  budget_score INTEGER,
  engagement_score INTEGER,
  risk_level TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT c.id AS client_id FROM clients c WHERE c.is_active = true
  ),
  pay AS (
    SELECT cc.client_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE cp.is_paid) AS on_time
    FROM client_payments cp
    JOIN client_contracts cc ON cc.id = cp.contract_id
    WHERE cp.due_date <= now()
    GROUP BY cc.client_id
  ),
  deliv AS (
    SELECT p.client_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE t.status = 'done' AND (t.deadline IS NULL OR t.updated_at::date <= t.deadline)) AS on_time
    FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE t.status IN ('done', 'review') AND t.created_at > now() - INTERVAL '90 days'
    GROUP BY p.client_id
  ),
  budg AS (
    SELECT p.client_id,
           COALESCE(SUM(t.estimated_hours), 0) AS est,
           COALESCE(SUM(t.logged_hours), 0) AS logged
    FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE t.estimated_hours IS NOT NULL AND t.estimated_hours > 0
    GROUP BY p.client_id
  ),
  eng AS (
    SELECT p.client_id, MAX(t.updated_at) AS last_activity
    FROM tasks t JOIN projects p ON p.id = t.project_id
    GROUP BY p.client_id
  ),
  scored AS (
    SELECT
      b.client_id,
      CASE WHEN COALESCE(pay.total, 0) > 0
           THEN ROUND((pay.on_time::numeric / pay.total) * 25)::int ELSE 25 END AS payment_score,
      CASE WHEN COALESCE(deliv.total, 0) > 0
           THEN ROUND((deliv.on_time::numeric / deliv.total) * 25)::int ELSE 20 END AS delivery_score,
      CASE
        WHEN COALESCE(budg.est, 0) > 0 THEN
          CASE
            WHEN budg.logged <= budg.est THEN 25
            WHEN budg.logged <= budg.est * 1.2 THEN 18
            WHEN budg.logged <= budg.est * 1.5 THEN 10
            ELSE 5
          END
        ELSE 20 END AS budget_score,
      CASE
        WHEN eng.last_activity IS NULL THEN 10
        WHEN eng.last_activity > now() - INTERVAL '7 days' THEN 25
        WHEN eng.last_activity > now() - INTERVAL '14 days' THEN 20
        WHEN eng.last_activity > now() - INTERVAL '30 days' THEN 15
        WHEN eng.last_activity > now() - INTERVAL '60 days' THEN 8
        ELSE 3 END AS engagement_score
    FROM base b
    LEFT JOIN pay ON pay.client_id = b.client_id
    LEFT JOIN deliv ON deliv.client_id = b.client_id
    LEFT JOIN budg ON budg.client_id = b.client_id
    LEFT JOIN eng ON eng.client_id = b.client_id
  )
  SELECT
    client_id,
    (payment_score + delivery_score + budget_score + engagement_score) AS health_score,
    payment_score, delivery_score, budget_score, engagement_score,
    CASE
      WHEN (payment_score + delivery_score + budget_score + engagement_score) >= 80 THEN 'healthy'
      WHEN (payment_score + delivery_score + budget_score + engagement_score) >= 60 THEN 'needs_attention'
      WHEN (payment_score + delivery_score + budget_score + engagement_score) >= 40 THEN 'at_risk'
      ELSE 'critical'
    END AS risk_level
  FROM scored;
$$;

GRANT EXECUTE ON FUNCTION calculate_all_clients_health() TO authenticated;

NOTIFY pgrst, 'reload schema';
