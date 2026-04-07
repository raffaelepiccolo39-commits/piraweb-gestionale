-- ============================================
-- Migration 00028: ensure_my_profile RPC
-- Self-healing: creates a missing profile for the current user.
-- Runs as SECURITY DEFINER to bypass RLS insert restrictions.
-- Called from the client-side auth hook as a fallback.
-- ============================================

CREATE OR REPLACE FUNCTION ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_email   TEXT;
  v_name    TEXT;
BEGIN
  -- Fetch email and name from auth.users
  SELECT
    email,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  INTO v_email, v_name
  FROM auth.users
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user not found in auth.users';
  END IF;

  -- Return existing profile if present
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  -- Auto-create missing profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (auth.uid(), v_email, v_name, 'content_creator')
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_my_profile() TO authenticated;
