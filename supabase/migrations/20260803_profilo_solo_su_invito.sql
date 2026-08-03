-- Un profilo del team si ottiene solo su invito.
--
-- `ensure_my_profile()` nasce per un caso legittimo: un dipendente rimasto
-- senza profilo se lo ricrea da solo aprendo il gestionale. Il problema e'
-- che non sapeva distinguere un dipendente da uno sconosciuto: bastava avere
-- un account e aprire /dashboard per diventare del team, con accesso a
-- clienti, fatture e compensi.
--
-- Non e' teoria. Il 21 luglio e' successo davvero con un cliente del portale,
-- e il 2026-08-03 l'ho riprodotto creando un account nuovo: 0 righe visibili
-- ovunque, finche' non apre la dashboard.
--
-- Il controllo esistente ("non e' un cliente del portale") copre un solo caso
-- e lascia fuori tutti gli altri. Qui si rovescia il criterio: non "chi
-- escludo", ma "chi ammetto". Si ammette chi e' stato invitato, e l'invito
-- lascia una traccia nei metadati dell'account, scritta da chi invita.
--
-- Nota: chi e' gia' dentro non e' toccato. Gli inviti creano il profilo
-- subito, quindi questa funzione per loro non entra nemmeno in gioco: e' una
-- rete di sicurezza, e una rete di sicurezza non deve essere una porta.

CREATE OR REPLACE FUNCTION ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  public.profiles;
  v_email    TEXT;
  v_name     TEXT;
  v_invitato BOOLEAN;
BEGIN
  -- Se il profilo c'e' gia' non si tocca niente: la funzione viene chiamata a
  -- ogni avvio, deve poter essere richiamata mille volte senza effetti.
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  -- Chi ha un accesso al portale NON e' del team: creargli un profilo
  -- significherebbe dargli le chiavi del gestionale.
  IF EXISTS (SELECT 1 FROM public.client_portal_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Questo account è un accesso cliente: non può avere un profilo del team';
  END IF;

  SELECT email,
         raw_user_meta_data->>'full_name',
         coalesce((raw_user_meta_data->>'invitato')::boolean, false)
    INTO v_email, v_name, v_invitato
    FROM auth.users
   WHERE id = auth.uid();

  -- Nessun invito alle spalle: prima gli si creava un profilo da dipendente.
  -- Ora no. Il codice P0002 e' quello che il client riconosce per mostrare
  -- "chiedi un invito all'amministratore" invece di uno spinner infinito.
  IF NOT v_invitato THEN
    RAISE EXCEPTION 'Questo account non è stato invitato: chiedi all''amministratore di aggiungerti al team'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (auth.uid(), v_email, COALESCE(v_name, split_part(v_email, '@', 1)), 'content_creator')
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;
