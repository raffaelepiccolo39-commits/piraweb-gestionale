-- ============================================================
-- La disposizione della dashboard, una per persona
-- ============================================================
--
-- Sta su `profiles` e non in una tabella a parte per un motivo pratico: è un
-- dato che si legge SEMPRE insieme al profilo e non si legge MAI da solo.
-- Una tabella separata avrebbe aggiunto una query all'apertura della pagina
-- proprio mentre si lavora per toglierne.
--
-- È di chi la scrive: ognuno sistema la propria e se la ritrova su ogni
-- dispositivo, perché segue il profilo e non il browser. Chi non l'ha mai
-- toccata ha NULL e vede la disposizione predefinita — che resta quella
-- decisa nel codice, non una copia congelata nel database.
--
-- Forma del contenuto (validata dall'applicazione, non da un vincolo SQL:
-- i riquadri disponibili cambiano col codice, e un CHECK qui dentro
-- diventerebbe una migration ogni volta che se ne aggiunge uno):
--
--   { "riquadri": [ { "i": "urgenti", "x": 0, "y": 0, "w": 8, "h": 6 }, … ],
--     "spenti":   [ "attivita" ] }
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb;

COMMENT ON COLUMN public.profiles.dashboard_layout IS
  'Disposizione personale dei riquadri della dashboard. NULL = quella predefinita del codice.';

-- Nessuna nuova policy: "Users can update own profile" (riscritta nella
-- 20260722c) permette già a ciascuno di aggiornare la PROPRIA riga —
-- USING (auth.uid() = id) — a patto di non cambiarsi il ruolo da solo.
-- Verificato prima di scrivere questa migration, perché se l'aggiornamento
-- fosse stato riservato agli admin il salvataggio sarebbe fallito in
-- silenzio per tutto il team.

NOTIFY pgrst, 'reload schema';
