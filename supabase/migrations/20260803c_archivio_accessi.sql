-- Archivio degli accessi dei clienti.
--
-- Esisteva gia' `client_social_credentials`, ma con tre difetti che la
-- rendevano inservibile — e infatti era vuota, nessuno l'ha mai usata:
-- colonne fisse per Instagram/Facebook/TikTok (niente sito, niente LinkedIn),
-- una riga sola per cliente, e password in chiaro.
--
-- Qui invece: una riga per accesso, la piattaforma e' un valore e non una
-- colonna (aggiungerne una nuova non richiede una migration), e la password
-- e' cifrata dal server prima di arrivare qui.
--
-- Sulla cifratura, per chiarezza: NON protegge dai colleghi — il team vede
-- tutto, e' una scelta esplicita. Protegge il database: backup, esportazioni,
-- copie di sviluppo e chiunque ottenga la chiave di servizio troverebbero
-- testo illeggibile invece di un elenco di password pronte all'uso.

CREATE TABLE IF NOT EXISTS client_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Testo e non enum: il giorno che arriva l'ennesimo social non si deve
  -- toccare lo schema. I valori usati dall'app: sito, instagram, facebook,
  -- tiktok, linkedin, google, altro.
  piattaforma TEXT NOT NULL,
  -- Per distinguere due accessi sulla stessa piattaforma ("profilo aziendale",
  -- "pannello hosting", "area fatturazione").
  etichetta TEXT,

  username TEXT,
  -- Cifrata (AES-256-GCM) dal server. Nessuno scrive qui direttamente.
  password_cifrata TEXT,
  url TEXT,
  note TEXT,

  creato_da UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_credentials_client ON client_credentials(client_id);
CREATE INDEX IF NOT EXISTS idx_client_credentials_piattaforma ON client_credentials(piattaforma);

DROP TRIGGER IF EXISTS set_client_credentials_updated_at ON client_credentials;
CREATE TRIGGER set_client_credentials_updated_at
  BEFORE UPDATE ON client_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_credentials ENABLE ROW LEVEL SECURITY;

-- Il team vede e gestisce tutto (scelta di Raffaele, 2026-08-03).
-- `is_staff()` esclude i clienti del portale, che qui non devono entrare mai:
-- vedrebbero le credenziali degli altri clienti.
DROP POLICY IF EXISTS "Accessi: solo il team" ON client_credentials;
CREATE POLICY "Accessi: solo il team"
  ON client_credentials FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- La vecchia tabella era vuota e sostituita da questa: tenerla significherebbe
-- lasciare in giro un secondo posto dove cercare le password, con lo schema
-- sbagliato. Verificato vuoto il 2026-08-03 (0 righe).
DROP TABLE IF EXISTS client_social_credentials;
