-- ============================================
-- Migration 20260711c: piano editoriale nell'assistente cliente
-- ============================================
-- L'assistente AI del cliente, oltre ad analisi/rischi/task, propone un piano
-- editoriale (calendario di post da programmare). Ogni voce si conferma dalla
-- scheda cliente creando un post in social_posts.
-- [{ id, title, caption, platform, scheduled_date, status:'pending'|'done'|'dismissed' }]
ALTER TABLE client_insights
  ADD COLUMN IF NOT EXISTS editorial_plan JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
