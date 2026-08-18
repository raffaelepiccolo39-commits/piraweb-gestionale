-- ============================================================
-- Pulizia: via i dati di Conformità IA e dei Template
-- ============================================================
--
-- Il codice di entrambi i moduli è stato rimosso il 18/08/2026 (commit
-- 075eb41 e e3a819e). Questa migration toglie anche quello che era rimasto
-- nel database, su richiesta esplicita del referente.
--
-- IRREVERSIBILE. Prima di eseguirla è stato salvato un backup completo in
-- ~/Desktop/backup-ai-act-e-template-2026-08-18.json — 27 righe:
--   ai_systems               8   (Claude, ChatGPT, Gemini, Midjourney, …)
--   ai_training_modules      1
--   ai_training_sessions     5   (chi aveva preso visione della formazione)
--   project_templates        3   (Social Media Management, Rebranding, Sito Web)
--   template_tasks          10
--   le altre quattro tabelle erano vuote, e il bucket ai-act-docs non
--   conteneva nessun file.
--
-- COSA NON SI TOCCA, ed è la ragione per cui questa migration è scritta a
-- mano invece che rovesciando la 00043: quella migration crea i template ma
-- crea anche `recurring_tasks` e le funzioni generate_recurring_tasks() /
-- generate_deadline_alerts(), che il cron giornaliero usa tutti i giorni.
-- Qui si eliminano SOLO le due tabelle dei template e la loro funzione.
-- ============================================================

-- ── Template di progetto ────────────────────────────────────
-- L'ordine conta: template_tasks ha una chiave esterna su project_templates.

DROP FUNCTION IF EXISTS public.create_project_from_template(UUID, TEXT, UUID, UUID);
DROP TABLE IF EXISTS public.template_tasks;
DROP TABLE IF EXISTS public.project_templates;

-- Nota: 'create_project_from_template' resta come valore fra le azioni
-- possibili di /automations. Quella pagina non ha mai avuto un motore di
-- esecuzione — è un elenco, non un'automazione che gira — quindi il valore
-- resta innocuo. Toglierlo vorrebbe dire rifare un enum per niente.


-- ── Conformità IA ───────────────────────────────────────────
-- Dalle foglie alla radice, così nessuna chiave esterna resta appesa.

DROP TABLE IF EXISTS public.ai_document_acceptances;
DROP TABLE IF EXISTS public.ai_documents;
DROP TABLE IF EXISTS public.ai_training_sessions;
DROP TABLE IF EXISTS public.ai_training_modules;
DROP TABLE IF EXISTS public.client_ai_systems;
DROP TABLE IF EXISTS public.ai_generations;
DROP TABLE IF EXISTS public.ai_systems;

-- I tipi enum restano orfani una volta cadute le tabelle che li usavano.
DROP TYPE IF EXISTS ai_training_status;
DROP TYPE IF EXISTS ai_document_type;
DROP TYPE IF EXISTS ai_label_outcome;
DROP TYPE IF EXISTS ai_output_type;
DROP TYPE IF EXISTS ai_risk;
DROP TYPE IF EXISTS ai_role;

-- ── Bucket dei documenti di conformità ──────────────────────
-- Era vuoto. Prima le policy, poi il bucket: il bucket non cade finché ci
-- sono righe in storage.objects che lo citano.

DROP POLICY IF EXISTS "ai-act-docs read staff" ON storage.objects;
DROP POLICY IF EXISTS "ai-act-docs write admin" ON storage.objects;
DROP POLICY IF EXISTS "ai-act-docs delete admin" ON storage.objects;

DELETE FROM storage.objects WHERE bucket_id = 'ai-act-docs';
DELETE FROM storage.buckets WHERE id = 'ai-act-docs';

NOTIFY pgrst, 'reload schema';
