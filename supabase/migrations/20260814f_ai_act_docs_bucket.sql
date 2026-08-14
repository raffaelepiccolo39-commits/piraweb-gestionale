-- ============================================================
-- Bucket per i documenti AI Act (policy, addendum, informative, dossier)
-- ============================================================
-- Privato: sono documenti interni/contrattuali. Il team li legge via link
-- firmato, solo gli admin caricano. Coerente con gli altri bucket sensibili.
-- allowed_mime_types: pdf + documenti office (no eseguibili).

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('ai-act-docs', 'ai-act-docs', false, 26214400,
    ARRAY['application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[])
  ON CONFLICT (id) DO UPDATE SET allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Bucket ai-act-docs non creato da SQL (%). Crealo da Storage: privato, 25 MB.', SQLERRM;
END $$;

DROP POLICY IF EXISTS "ai-act-docs read staff" ON storage.objects;
CREATE POLICY "ai-act-docs read staff" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'ai-act-docs' AND public.is_staff());

DROP POLICY IF EXISTS "ai-act-docs write admin" ON storage.objects;
CREATE POLICY "ai-act-docs write admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ai-act-docs' AND public.is_admin());

DROP POLICY IF EXISTS "ai-act-docs delete admin" ON storage.objects;
CREATE POLICY "ai-act-docs delete admin" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'ai-act-docs' AND public.is_admin());
