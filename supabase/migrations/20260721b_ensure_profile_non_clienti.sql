-- ============================================================
-- ensure_my_profile() non deve promuovere i clienti a dipendenti
-- ============================================================
--
-- Incidente del 21/07. Alle 08:22 viene creato un accesso al portale per
-- raffaele303@outlook.it — correttamente SENZA riga in profiles, perché è
-- quella riga a distinguere il team dai clienti (public.is_staff()).
-- Alle 09:18 quella riga compare lo stesso, con nome "raffaele303" e ruolo
-- content_creator.
--
-- Non è stato il trigger handle_new_user, che resta inattivo. È stata
-- questa funzione: `use-auth` la chiama quando un utente autenticato non ha
-- un profilo, e lei glielo crea. Il cliente ha aperto /dashboard e si è
-- auto-promosso a dipendente.
--
-- È il buco più grave trovato finora, perché annulla in silenzio tutta la
-- separazione costruita con la 20260720b: bastava che un cliente visitasse
-- una pagina del gestionale.
--
-- La funzione nasceva per un'esigenza legittima (un dipendente rimasto
-- senza profilo se lo ricrea da solo). Continua a farlo — ma solo se non è
-- un cliente del portale.
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_email   TEXT;
  v_name    TEXT;
BEGIN
  -- Chi ha un accesso al portale NON è del team: creargli un profilo
  -- significherebbe dargli le chiavi del gestionale.
  IF EXISTS (SELECT 1 FROM public.client_portal_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Questo account è un accesso cliente: non può avere un profilo del team';
  END IF;

  SELECT
    email,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  INTO v_email, v_name
  FROM auth.users
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user not found in auth.users';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (auth.uid(), v_email, v_name, 'content_creator')
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_my_profile() TO authenticated;


-- ============================================================
-- Rete di sicurezza al livello giusto: il database
-- ============================================================
-- Il controllo dentro la funzione copre la strada da cui è passato
-- l'incidente, ma un profilo può nascere anche da altre parti (l'invito
-- dipendenti, o un domani il trigger handle_new_user se venisse
-- riattivato). Questo vincolo lo impedisce a prescindere da chi lo tenta.

CREATE OR REPLACE FUNCTION public.blocca_profilo_per_clienti()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_portal_users WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Impossibile creare un profilo del team: % è un accesso cliente al portale', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS no_profilo_per_clienti ON public.profiles;
CREATE TRIGGER no_profilo_per_clienti
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.blocca_profilo_per_clienti();


-- Speculare: non si crea un accesso portale per chi è già del team.
CREATE OR REPLACE FUNCTION public.blocca_portale_per_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Impossibile creare un accesso cliente: % è un membro del team', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS no_portale_per_team ON public.client_portal_users;
CREATE TRIGGER no_portale_per_team
  BEFORE INSERT ON public.client_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.blocca_portale_per_team();


-- ============================================================
-- Verifica
-- ============================================================
-- Deve restituire ZERO righe: nessun account può essere entrambe le cose.
SELECT p.id, p.email, p.role
FROM public.profiles p
JOIN public.client_portal_users c ON c.id = p.id;

NOTIFY pgrst, 'reload schema';
