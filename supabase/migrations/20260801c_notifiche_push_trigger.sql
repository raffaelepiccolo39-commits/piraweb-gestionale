-- Ogni notifica scritta nel database diventa anche una notifica sul telefono.
--
-- Perche' un trigger e non una chiamata nel codice: le notifiche nascono in
-- una quarantina di punti diversi (cron, pagine, altri trigger). Aggiungere
-- l'invio a ognuno significa dimenticarselo al quarantunesimo. Qui il gancio
-- e' uno solo, a valle: chi domani inserira' una riga in `notifications`
-- avra' la push senza saperlo.
--
-- pg_net fa la chiamata in modo asincrono: la INSERT non aspetta la risposta
-- di Apple, e se il server delle push e' giu' la notifica in-app viene
-- scritta lo stesso. Le notifiche sono un avviso, non un pagamento: meglio
-- perderne una che bloccare l'operazione che l'ha generata.
--
-- PRIMA DI ESEGUIRE, imposta le due impostazioni (una volta sola, sono
-- lette da qui e non compaiono nel codice):
--
--   ALTER DATABASE postgres SET app.push_endpoint = 'https://gestionale.piraweb.it/api/push/send';
--   ALTER DATABASE postgres SET app.push_secret   = '<valore di PUSH_HOOK_SECRET su Vercel>';
--
-- e riapri la connessione (o riavvia il progetto) perche' vengano lette.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notifica_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_endpoint TEXT := current_setting('app.push_endpoint', true);
  v_secret   TEXT := current_setting('app.push_secret', true);
BEGIN
  -- Impianto non configurato: si esce in silenzio, la notifica in-app resta.
  IF v_endpoint IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', COALESCE(NEW.message, ''),
      'link', NEW.link
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Una push che non parte non deve mai impedire la scrittura della notifica.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifica_push ON notifications;
CREATE TRIGGER trg_notifica_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifica_push();
