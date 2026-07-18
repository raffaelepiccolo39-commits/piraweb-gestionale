-- ============================================================
-- Piano editoriale opzionale per cliente.
-- ============================================================
-- Prima l'avviso "Scadenze piani editoriali" in dashboard mostrava OGNI cliente
-- attivo senza copertura impostata. Ma i clienti di cui gestiamo solo il sito
-- web non hanno un piano editoriale, e comparivano per errore.
--
-- needs_ped = "gestiamo il piano editoriale (social) per questo cliente".
-- Default true (comportamento invariato per i clienti esistenti). I clienti
-- "solo sito" già registrati vengono esclusi (backfill sotto).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS needs_ped boolean NOT NULL DEFAULT true;

-- I clienti attualmente gestiti solo come sito web non hanno piano editoriale.
UPDATE clients
SET needs_ped = false
WHERE id IN (SELECT client_id FROM website_managements);

NOTIFY pgrst, 'reload schema';
