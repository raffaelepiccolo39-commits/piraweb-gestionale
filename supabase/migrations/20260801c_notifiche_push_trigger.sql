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

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- Dove tenere endpoint e segreto
-- ============================================
-- Non in `ALTER DATABASE ... SET`: nel SQL Editor di Supabase non si e'
-- superuser e Postgres rifiuta ("permission denied to set parameter").
-- Non nel corpo della funzione: la definizione di una funzione e' leggibile
-- e il segreto smetterebbe di essere tale.
--
-- Quindi una tabella in uno schema tutto suo: `private` non e' tra gli schemi
-- che PostgREST espone, percio' non e' raggiungibile dall'app ne' con la
-- chiave anon ne' da un utente collegato. Ci arriva solo chi gira dentro il
-- database, cioe' la funzione del trigger.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_config (
  chiave TEXT PRIMARY KEY,
  valore TEXT NOT NULL,
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.app_config FROM anon, authenticated;

-- I due valori (l'indirizzo della rotta di invio e il segreto che la protegge)
-- si scrivono una volta sola. Il segreto e' lo stesso di PUSH_HOOK_SECRET su
-- Vercel: se un giorno va cambiato, si cambia in tutti e due i posti.
INSERT INTO private.app_config (chiave, valore) VALUES
  ('push_endpoint', 'https://gestionale.piraweb.it/api/push/send'),
  ('push_secret', '<INCOLLA QUI IL VALORE DI PUSH_HOOK_SECRET>')
ON CONFLICT (chiave) DO UPDATE
  SET valore = EXCLUDED.valore, aggiornato_il = now();

-- ============================================
-- Il trigger
-- ============================================
CREATE OR REPLACE FUNCTION notifica_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_endpoint TEXT;
  v_secret   TEXT;
BEGIN
  SELECT valore INTO v_endpoint FROM private.app_config WHERE chiave = 'push_endpoint';
  SELECT valore INTO v_secret   FROM private.app_config WHERE chiave = 'push_secret';

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
