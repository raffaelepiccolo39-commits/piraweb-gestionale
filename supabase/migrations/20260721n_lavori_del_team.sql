-- ============================================================
-- "A cosa stiamo lavorando": le task viste dal cliente
-- ============================================================
--
-- Il cliente paga un canone mensile e per gran parte del mese non vede
-- succedere niente: i contenuti arrivano tutti insieme quando il piano è
-- pronto. Questa pagina mostra il lavoro mentre accade — ed è anche la
-- risposta migliore alla domanda "ma cosa fate tutto il mese?".
--
-- ⚠️ SI MOSTRA SOLO IL TITOLO, MAI LA DESCRIZIONE.
-- Le descrizioni sono scritte fra noi e contengono commenti che al cliente
-- non devono arrivare. Esempio reale trovato in produzione il 21/07, su una
-- task del Notaio D'Ausilio: "SE D'AUSILIO RISPONDESSE FORSE". I titoli
-- invece descrivono il lavoro ("montare video", "programmazione agosto") e
-- si possono mostrare.
--
-- Anche i titoli però restano scritti da noi per noi: serve una via d'uscita
-- per il caso singolo, ed è la colonna qui sotto.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS nascosta_al_cliente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.nascosta_al_cliente IS
  'Esclude la task dalla pagina "A cosa stiamo lavorando" del portale. Default false: si mostra tutto, si nasconde l''eccezione.';

-- Per la lettura del portale, che filtra sempre su questa colonna.
CREATE INDEX IF NOT EXISTS idx_tasks_visibili_cliente
  ON tasks(project_id) WHERE NOT nascosta_al_cliente;


-- ============================================================
-- Il cliente vede i propri progetti e le proprie task
-- ============================================================
-- Le task non hanno client_id: il legame passa dal progetto. Serve quindi
-- anche la lettura dei progetti, altrimenti il join non torna nulla.

DROP POLICY IF EXISTS "Il cliente vede i propri progetti" ON projects;
CREATE POLICY "Il cliente vede i propri progetti" ON projects
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

DROP POLICY IF EXISTS "Il cliente vede le proprie lavorazioni" ON tasks;
CREATE POLICY "Il cliente vede le proprie lavorazioni" ON tasks
  FOR SELECT TO authenticated
  USING (
    NOT nascosta_al_cliente
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id
        AND p.client_id = public.current_client_id()
    )
  );

-- Nessuna scrittura: il cliente guarda e basta. La pagina non ha pulsanti
-- che tocchino le task, e non deve poterlo fare nemmeno per altre strade.


-- ============================================================
-- Verifica
-- ============================================================
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'nascosta_al_cliente'
  ) THEN 'ok' ELSE 'MANCA' END AS colonna,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'tasks'
     AND policyname = 'Il cliente vede le proprie lavorazioni') AS policy_task,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'projects'
     AND policyname = 'Il cliente vede i propri progetti') AS policy_progetti;

NOTIFY pgrst, 'reload schema';
