-- ============================================================
-- Reel o post: distinguerli anche quando la copertina è una foto
-- ============================================================
--
-- Nel portale il simbolo del play compariva solo se il file caricato era un
-- video. Ma un reel in fase di piano editoriale ha spesso come anteprima un
-- fotogramma, non il video girato — che magari non esiste ancora.
--
-- Nel PED (esportato da Notion) la colonna "Tipologia" dice Video o Post:
-- è quel dato che va conservato, altrimenti importando un piano editoriale
-- si perde la distinzione più importante per chi lo guarda.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE content_format AS ENUM ('post', 'reel', 'storia', 'carosello');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS formato content_format NOT NULL DEFAULT 'post';

COMMENT ON COLUMN social_posts.formato IS
  'Come esce il contenuto. Indipendente dal file caricato: un reel può avere un fotogramma come anteprima.';

NOTIFY pgrst, 'reload schema';
