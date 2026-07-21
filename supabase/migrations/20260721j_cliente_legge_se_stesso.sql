-- ============================================================
-- Il cliente deve poter leggere la PROPRIA riga in clients
-- ============================================================
--
-- Bug trovato il 21/07 da un'analisi con agenti, e confermato con un
-- account portale vero: la query del PortalGate restituisce client: null.
-- Conseguenza visibile — nel portale il nome del cliente e' vuoto
-- ("Benvenuto nell'area dedicata a " e basta) e il logo ripiega
-- sull'iniziale di una stringa vuota.
--
-- Perche' era sfuggito: `clients` aveva una policy di lettura per tutti gli
-- autenticati, giustamente ristretta a is_staff() con la 20260720b. In quel
-- momento i clienti del portale non esistevano ancora, e quando sono
-- arrivati nessuno ha ridato loro l'accesso alla riga che li riguarda.
--
-- Le verifiche fatte allora controllavano che il cliente NON leggesse i
-- dati altrui — e infatti non li legge. Non controllavano che leggesse i
-- propri: un test che cerca solo le fughe non trova i buchi al contrario.
--
-- Qui si concede UNA riga sola: la sua.
-- ============================================================

DROP POLICY IF EXISTS "Il cliente vede il proprio cliente" ON clients;
CREATE POLICY "Il cliente vede il proprio cliente" ON clients
  FOR SELECT TO authenticated
  USING (id = public.current_client_id());


-- ============================================================
-- Verifica
-- ============================================================
-- Devono comparire due policy SELECT: quella del team (is_staff) e questa.
SELECT policyname, cmd, coalesce(qual, '-') AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'clients' AND cmd = 'SELECT'
ORDER BY policyname;

NOTIFY pgrst, 'reload schema';
