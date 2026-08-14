-- ============================================================
-- Sicurezza: il bucket 'inbox' accettava qualsiasi tipo di file
-- ============================================================
--
-- Gli allegati della chat clienti finiscono nel bucket 'inbox', creato con un
-- limite di dimensione ma SENZA allowed_mime_types; ne' l'interfaccia mette un
-- filtro. Un cliente poteva quindi caricare un finto listino .svg/.html con
-- dentro uno <script>: aperto dal team via link firmato, il browser lo
-- eseguiva sull'origine dello storage. Impatto limitato (origine diversa
-- dall'app, nessun accesso alla sessione del gestionale), ma content-spoofing
-- e XSS sull'origine storage a partire da contenuto del cliente.
--
-- Fix alla radice: una whitelist dei tipi legittimi in una chat cliente-agenzia
-- (foto — HEIC/HEIF compresi per gli iPhone —, PDF, documenti Office, testo).
-- Restano fuori svg, html e xml, che sono i vettori eseguibili. Vale per i
-- NUOVI upload; i file gia' presenti non sono toccati.
-- ============================================================

DO $$
BEGIN
  UPDATE storage.buckets
  SET allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
  WHERE id = 'inbox';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'allowed_mime_types su inbox non impostato da SQL (%). Mettilo da Storage > Buckets > inbox.', SQLERRM;
END $$;
