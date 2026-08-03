-- Dispositivi a cui mandare le notifiche push.
--
-- Una riga per (utente, dispositivo). Il token lo rilascia il sistema
-- operativo — APNs su iOS, FCM su Android — e cambia da solo: alla
-- reinstallazione, al ripristino da backup, ogni tanto senza motivo apparente.
-- Per questo la chiave e' il token e non l'utente: la stessa persona ha il
-- telefono e il tablet, e lo stesso telefono puo' passare di mano.
--
-- Non e' un registro storico: quando un token non vale piu' (APNs risponde
-- 410, FCM UNREGISTERED) la riga si cancella. Tenerla significherebbe
-- ritentare per sempre invii che nessuno ricevera'.

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  -- Aggiornato a ogni avvio dell'app: un token fermo da mesi e' un telefono
  -- che non c'e' piu', e prima o poi va ripulito.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Ognuno vede e gestisce solo i propri dispositivi. L'invio avviene lato
-- server con la service key, che l'RLS non riguarda.
DROP POLICY IF EXISTS "Device tokens: propri" ON device_tokens;
CREATE POLICY "Device tokens: propri"
  ON device_tokens FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Il token appartiene al dispositivo, non alla persona: se sullo stesso
-- telefono entra un altro utente, la riga passa a lui invece di duplicarsi.
-- Serve una funzione perche' l'upsert va fatto sul token, che pero' potrebbe
-- essere di un altro utente — e l'RLS, giustamente, non lo lascerebbe toccare.
CREATE OR REPLACE FUNCTION register_device_token(p_token TEXT, p_platform TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Serve un accesso valido per registrare un dispositivo';
  END IF;

  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Piattaforma non valida: %', p_platform;
  END IF;

  INSERT INTO device_tokens (user_id, token, platform)
  VALUES (auth.uid(), p_token, p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(),
        platform = p_platform,
        last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION register_device_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_device_token(TEXT, TEXT) TO authenticated;
