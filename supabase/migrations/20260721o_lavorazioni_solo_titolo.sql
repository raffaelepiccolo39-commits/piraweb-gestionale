-- ============================================================
-- Le lavorazioni al cliente passano da una funzione, non dalla tabella
-- ============================================================
--
-- 🔴 CORREGGE UN BUCO INTRODOTTO DALLA 20260721n, TROVATO SUBITO DOPO.
--
-- Quella migration dava al cliente una policy di SELECT su `tasks`. La RLS
-- però decide riga per riga, non colonna per colonna: una volta concessa la
-- riga, il cliente poteva chiedere `select=description` e leggersi le note
-- interne. Verificato con un account portale vero: la descrizione tornava.
--
-- La pagina del portale non la mostrava, ma questo non protegge niente —
-- basta chiamare l'API con il proprio token. Fra le descrizioni in
-- produzione ce n'è una che dice "SE D'AUSILIO RISPONDESSE FORSE".
--
-- I permessi di colonna non servono a chiudere il buco: Supabase concede già
-- i privilegi di tabella al ruolo `authenticated`, e team e clienti sono lo
-- stesso ruolo Postgres (è la trappola già documentata in questo progetto).
-- La strada giusta è quella usata per tutte le altre letture del portale:
-- una funzione SECURITY DEFINER che restituisce SOLO i campi previsti.
-- ============================================================

-- Via l'accesso diretto alla tabella.
DROP POLICY IF EXISTS "Il cliente vede le proprie lavorazioni" ON tasks;

-- Anche quello ai progetti: serviva solo a far funzionare il join, e un
-- progetto porta con sé budget, note e date che non riguardano il cliente.
DROP POLICY IF EXISTS "Il cliente vede i propri progetti" ON projects;


-- ============================================================
-- Solo ciò che si può mostrare
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_lavorazioni()
RETURNS TABLE (
  id uuid,
  titolo text,
  stato text,
  completata_il timestamptz,
  creata_il timestamptz,
  chi text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    -- Le colonne restituite vanno qualificate con l'alias: hanno gli stessi
    -- nomi dei parametri di uscita, e senza alias Postgres non sa a quale
    -- dei due ci si riferisce (errore gia' visto in questo progetto).
    SELECT
      t.id,
      t.title,
      t.status::text,
      t.completed_at,
      t.created_at,
      -- Solo il nome di battesimo: basta a dire chi ci sta lavorando senza
      -- consegnare al cliente l'anagrafica del team.
      split_part(coalesce(p.full_name, ''), ' ', 1)
    FROM tasks t
    JOIN projects pr ON pr.id = t.project_id
    LEFT JOIN profiles p ON p.id = t.assigned_to
    WHERE pr.client_id = v_client
      AND NOT t.nascosta_al_cliente
    ORDER BY t.completed_at DESC NULLS FIRST, t.created_at DESC
    LIMIT 300;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_lavorazioni() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_lavorazioni() TO authenticated;

COMMENT ON FUNCTION public.portal_lavorazioni() IS
  'Lavorazioni del proprio cliente per il portale. Restituisce SOLO titolo, stato, date e nome di battesimo: mai descrizione, ore, budget o scadenze interne.';


-- ============================================================
-- Verifica
-- ============================================================
SELECT
  CASE WHEN to_regprocedure('public.portal_lavorazioni()') IS NOT NULL
       THEN 'ok' ELSE 'MANCA' END AS funzione,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'tasks'
     AND policyname = 'Il cliente vede le proprie lavorazioni') AS policy_task_rimossa_deve_essere_0,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'projects'
     AND policyname = 'Il cliente vede i propri progetti') AS policy_progetti_rimossa_deve_essere_0;

NOTIFY pgrst, 'reload schema';
