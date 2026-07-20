-- ============================================================
-- AUDIT (sola lettura, non modifica nulla)
-- ============================================================
-- Elenca le policy che concedono accesso a QUALUNQUE utente autenticato
-- senza altre condizioni. Sono quelle che un futuro login cliente
-- erediterebbe: vanno ristrette a public.is_staff() prima di creare
-- il primo accesso cliente del portale.
--
-- Da lanciare nel SQL Editor di Supabase e incollarmi il risultato.
-- ============================================================

SELECT
  tablename                                   AS tabella,
  policyname                                  AS policy,
  cmd                                         AS comando,
  roles::text                                 AS ruoli,
  COALESCE(qual, '-')                         AS using_expr,
  COALESCE(with_check, '-')                   AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    -- permissive: nessuna condizione reale, né in USING né in WITH CHECK
    btrim(COALESCE(qual, '')) IN ('true', '(true)')
    OR btrim(COALESCE(with_check, '')) IN ('true', '(true)')
  )
ORDER BY
  -- prima le più pericolose: quelle che permettono anche di scrivere
  CASE WHEN cmd = 'ALL' THEN 0 WHEN cmd IN ('INSERT','UPDATE','DELETE') THEN 1 ELSE 2 END,
  tablename,
  policyname;
