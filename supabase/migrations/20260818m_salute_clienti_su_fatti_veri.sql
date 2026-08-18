-- ============================================================
-- Salute clienti: misurare il lavoro, non le righe toccate
-- ============================================================
--
-- Due criteri su quattro guardavano `tasks.updated_at`, che dice quando la
-- riga è stata toccata l'ultima volta — non quando è stato fatto il lavoro.
-- Archiviare una task la tocca. Fra il 6 e il 14 agosto ne sono state
-- archiviate 206, e il risultato è che:
--
--   · 14 task consegnate PUNTUALMENTE risultano in ritardo, perché la loro
--     `updated_at` è finita dopo la scadenza il giorno dell'archiviazione;
--   · un cliente fermo da mesi sembra vivissimo, perché archiviare le sue
--     vecchie task conta come attività recente.
--
-- La colonna giusta c'era già: `completed_at`, valorizzata su tutte e 203 le
-- task chiuse. Qui si usa quella per le consegne, e per l'attività si guarda
-- l'ultimo fatto reale — una task creata o una task completata — invece
-- dell'ultimo tocco.
--
-- TERZA CORREZIONE: i clienti senza dati non sono clienti messi male.
-- Chi non ha rate scadute, task o stime prende i valori d'ufficio (25+20+20
-- +10 = 75) e finisce in "da attenzionare" esattamente come chi ha problemi
-- veri. Sono cose diverse e vanno distinte: la funzione ora dichiara
-- `senza_dati`, e la Direzione lo mostra come "dati insufficienti" invece di
-- colorarlo come un allarme.
--
-- Le soglie e i pesi NON cambiano: stessa scala, stessi 25 punti a criterio.
-- Cambia solo da dove si prendono i fatti.
--
-- Nota: `calculate_client_health()` (00045), la versione per singolo cliente,
-- ha lo stesso difetto ma non è chiamata da nessuna parte del codice. La si
-- lascia com'è invece di correggere una funzione morta.
-- ============================================================

-- Il tipo restituito cambia (colonna nuova), quindi CREATE OR REPLACE non
-- basta: Postgres non lascia cambiare la firma di ritorno.
DROP FUNCTION IF EXISTS calculate_all_clients_health();

CREATE FUNCTION calculate_all_clients_health()
RETURNS TABLE (
  client_id UUID,
  health_score INTEGER,
  payment_score INTEGER,
  delivery_score INTEGER,
  budget_score INTEGER,
  engagement_score INTEGER,
  risk_level TEXT,
  senza_dati BOOLEAN
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
    -- La data di consegna è completed_at, non updated_at: archiviare una
    -- task dopo la scadenza non deve trasformarla in un ritardo.
    -- COALESCE per le poche righe antecedenti alla colonna.
    SELECT p.client_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (
             WHERE t.status = 'done'
               AND (t.deadline IS NULL
                    OR COALESCE(t.completed_at, t.updated_at)::date <= t.deadline)
           ) AS on_time
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
    -- Ultimo fatto reale: una task creata o una task completata. Prima era
    -- MAX(updated_at), che contava anche l'archiviazione come segno di vita.
    SELECT p.client_id,
           MAX(GREATEST(t.created_at, COALESCE(t.completed_at, t.created_at))) AS last_activity
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
        ELSE 3 END AS engagement_score,
      -- Nessun segnale su cui basarsi: né rate scadute, né task, né stime.
      -- Il punteggio che ne esce è fatto solo di valori d'ufficio.
      (COALESCE(pay.total, 0) = 0
       AND COALESCE(deliv.total, 0) = 0
       AND eng.last_activity IS NULL) AS senza_dati
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
    END AS risk_level,
    senza_dati
  FROM scored;
$$;

REVOKE EXECUTE ON FUNCTION calculate_all_clients_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION calculate_all_clients_health() TO authenticated;

NOTIFY pgrst, 'reload schema';
