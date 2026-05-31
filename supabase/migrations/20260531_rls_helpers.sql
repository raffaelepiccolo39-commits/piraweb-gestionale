-- RLS helper functions per centralizzare i check di ruolo nelle policy.
--
-- Pattern attuale (45+ migration usano questo):
--   USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
--
-- Nuovo pattern raccomandato per future policy:
--   USING (public.is_admin())
--   USING (public.has_role('social_media_manager'))
--   USING (public.has_role_any(ARRAY['admin', 'content_creator']))
--
-- Le funzioni sono SECURITY DEFINER + STABLE:
-- - SECURITY DEFINER: bypassa RLS sull'auto-lookup di profiles (no recursion)
-- - STABLE: il planner può cachare il risultato durante una query

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role::text = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role_any(p_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role::text = ANY(p_roles)
  );
$$;

-- Restituisce il ruolo corrente (utile per logging e UI server-side)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid();
$$;

-- Permessi: solo gli authenticated possono invocarle (non anon)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role_any(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_any(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
