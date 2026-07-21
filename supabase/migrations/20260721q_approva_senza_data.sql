-- ============================================================
-- 🔴 "Approva tutto" sul gruppo Senza data approvava TUTTO
-- ============================================================
--
-- Trovato dall'audit del 21/07 e verificato sul codice vero.
--
-- Il piano editoriale è raggruppato per mese, e ogni gruppo ha il suo
-- "Approva tutto (N)". Per il gruppo "Senza data" la pagina chiamava
-- portal_approva_mese(NULL), e qui dentro NULL voleva dire "approva tutto
-- l'arretrato, di qualunque mese".
--
-- Risultato: il cliente leggeva "Approvare 2 contenuti di senza data?",
-- confermava, e ne approvava dodici — di mesi che non aveva mai aperto,
-- senza poter tornare indietro. È il contrario esatto di ciò che questa
-- funzione era stata scritta per garantire: nessun sì alla cieca.
--
-- Oggi il gruppo Senza data è vuoto, quindi il danno non si è ancora
-- prodotto; sarebbe scattato al primo contenuto creato senza data.
--
-- Errore mio: avevo previsto NULL per un pulsante "approva tutto" che poi
-- non è mai esistito nell'interfaccia, e quel significato è rimasto lì ad
-- aspettare che qualcuno ci passasse sopra.
--
-- Da qui in avanti NULL significa una cosa sola: i contenuti SENZA data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_approva_mese(p_mese date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_quanti int;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Nessun accesso al portale';
  END IF;

  UPDATE social_posts
  SET client_approval    = 'approved',
      client_comment     = NULL,
      client_reviewed_at = now()
  WHERE client_id = v_client
    -- Solo ciò che è davvero in attesa: chi ha già chiesto modifiche non
    -- viene travolto da un "approva tutto" che cancellerebbe la richiesta.
    AND client_approval = 'pending'
    AND status IN ('ready', 'scheduled')
    AND (
      CASE
        -- NULL = il gruppo "Senza data" della pagina, e SOLO quello.
        WHEN p_mese IS NULL THEN scheduled_at IS NULL
        ELSE scheduled_at >= p_mese::timestamptz
         AND scheduled_at <  (p_mese + INTERVAL '1 month')::timestamptz
      END
    );

  GET DIAGNOSTICS v_quanti = ROW_COUNT;
  RETURN v_quanti;
END;
$$;

COMMENT ON FUNCTION public.portal_approva_mese(date) IS
  'Approva in blocco i contenuti in attesa di UN periodo: il mese indicato, oppure quelli senza data se il parametro è NULL. Non tocca quelli su cui il cliente ha già chiesto modifiche. NULL non significa "tutto": significa "senza data".';


-- ============================================================
-- Le task archiviate non sono "in corso"
-- ============================================================
--
-- Sempre dall'audit: in "A cosa stiamo lavorando" una task archiviata ma non
-- conclusa restava "In corso adesso" per sempre. Ce ne sono due in
-- produzione: al cliente sembrerebbe che ci stiamo lavorando da mesi.
--
-- Archiviata e non conclusa vuol dire che è stata messa da parte. Non è una
-- cosa a cui stiamo lavorando, e mostrarla come tale è una bugia — per di
-- più imbarazzante.

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
    SELECT
      t.id,
      t.title,
      t.status::text,
      t.completed_at,
      t.created_at,
      split_part(coalesce(p.full_name, ''), ' ', 1)
    FROM tasks t
    JOIN projects pr ON pr.id = t.project_id
    LEFT JOIN profiles p ON p.id = t.assigned_to
    WHERE pr.client_id = v_client
      AND NOT t.nascosta_al_cliente
      -- Archiviata e non conclusa = messa da parte: non la si mostra.
      -- Archiviata e conclusa resta, perché è lavoro fatto davvero.
      AND (t.archived_at IS NULL OR t.status = 'done')
    ORDER BY t.completed_at DESC NULLS FIRST, t.created_at DESC
    LIMIT 300;
END;
$$;


-- ============================================================
-- Verifica
-- ============================================================
-- Deve tornare 0: nessun contenuto CON data viene toccato da NULL.
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'portal_approva_mese') AS funzione_approva,
  (SELECT count(*) FROM pg_proc WHERE proname = 'portal_lavorazioni') AS funzione_lavorazioni;

NOTIFY pgrst, 'reload schema';
