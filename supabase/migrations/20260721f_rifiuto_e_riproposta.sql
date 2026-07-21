-- ============================================================
-- Quando il cliente chiede modifiche, il team deve saperlo
-- ============================================================
--
-- Il giro era monco: il cliente scriveva la motivazione (obbligatoria) ma
-- l'unico modo di accorgersene era aprire il calendario e guardare le
-- schede rosse. Se nessuno guardava, la richiesta restava lì.
--
-- La notifica nasce nel DATABASE, non nel codice della pagina: la risposta
-- arriva da una funzione (portal_review_post / portal_review_material) e
-- deve avvisare comunque, chiunque sia collegato in quel momento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.avvisa_team_modifiche_richieste()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente TEXT;
  v_titolo TEXT;
  v_link TEXT;
  v_destinatario UUID;
BEGIN
  -- Solo al passaggio a "modifiche richieste", non a ogni salvataggio.
  IF NEW.client_approval <> 'changes_requested'
     OR OLD.client_approval = 'changes_requested' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(company, name) INTO v_cliente FROM clients WHERE id = NEW.client_id;
  v_titolo := COALESCE(NEW.title, 'Contenuto');
  v_link := CASE TG_TABLE_NAME
    WHEN 'social_posts' THEN '/social-calendar'
    ELSE '/clients/scheda?id=' || NEW.client_id
  END;

  -- Va a chi l'ha creato e a tutti gli admin: chi ha preparato il contenuto
  -- e' quello che lo correggera, gli admin perche' e' un impegno col cliente.
  FOR v_destinatario IN
    SELECT id FROM profiles WHERE role = 'admin' AND is_active
    UNION
    SELECT NEW.created_by WHERE NEW.created_by IS NOT NULL
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_destinatario,
      'task_updated',
      'Il cliente chiede modifiche',
      format('%s — %s: «%s»', v_cliente, v_titolo,
             left(COALESCE(NEW.client_comment, 'nessuna motivazione'), 140)),
      v_link,
      jsonb_build_object('tabella', TG_TABLE_NAME, 'id', NEW.id, 'client_id', NEW.client_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS avvisa_modifiche_post ON social_posts;
CREATE TRIGGER avvisa_modifiche_post
  AFTER UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION public.avvisa_team_modifiche_richieste();

DROP TRIGGER IF EXISTS avvisa_modifiche_materiali ON client_materials;
CREATE TRIGGER avvisa_modifiche_materiali
  AFTER UPDATE ON client_materials
  FOR EACH ROW EXECUTE FUNCTION public.avvisa_team_modifiche_richieste();


-- ============================================================
-- Storico delle risposte
-- ============================================================
-- Rimandando in approvazione, la motivazione precedente verrebbe persa.
-- Ma è proprio quella che serve rileggere quando il cliente rifiuta due
-- volte di fila: la prima obiezione spiega la seconda.

CREATE TABLE IF NOT EXISTS approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quale contenuto: si tiene generico per coprire post e materiali.
  tabella TEXT NOT NULL CHECK (tabella IN ('social_posts', 'client_materials')),
  record_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  esito client_approval NOT NULL,
  commento TEXT,
  -- NULL quando la risposta arriva dal cliente.
  team_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_history_record ON approval_history(tabella, record_id, created_at DESC);

ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Il team legge lo storico approvazioni" ON approval_history;
CREATE POLICY "Il team legge lo storico approvazioni" ON approval_history
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Il team scrive lo storico approvazioni" ON approval_history;
CREATE POLICY "Il team scrive lo storico approvazioni" ON approval_history
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

-- Il cliente vede lo storico del proprio contenuto: sapere cosa aveva
-- chiesto la volta prima evita che ripeta la stessa richiesta.
DROP POLICY IF EXISTS "Il cliente vede il proprio storico" ON approval_history;
CREATE POLICY "Il cliente vede il proprio storico" ON approval_history
  FOR SELECT TO authenticated USING (client_id = public.current_client_id());


-- Ogni risposta del cliente finisce nello storico, da qualunque strada arrivi.
CREATE OR REPLACE FUNCTION public.registra_risposta_cliente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_approval IS DISTINCT FROM OLD.client_approval THEN
    INSERT INTO approval_history (tabella, record_id, client_id, esito, commento)
    VALUES (TG_TABLE_NAME, NEW.id, NEW.client_id, NEW.client_approval, NEW.client_comment);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storico_risposta_post ON social_posts;
CREATE TRIGGER storico_risposta_post
  AFTER UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION public.registra_risposta_cliente();

DROP TRIGGER IF EXISTS storico_risposta_materiali ON client_materials;
CREATE TRIGGER storico_risposta_materiali
  AFTER UPDATE ON client_materials
  FOR EACH ROW EXECUTE FUNCTION public.registra_risposta_cliente();


-- ============================================================
-- Verifica
-- ============================================================
SELECT tgname AS trigger, relname AS tabella
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname LIKE 'avvisa_modifiche%' OR tgname LIKE 'storico_risposta%'
ORDER BY relname, tgname;

NOTIFY pgrst, 'reload schema';
