CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT banned FROM public.user_flags WHERE user_id = _user_id), false)
$$;

REVOKE EXECUTE ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_mind_spec_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_mind_spec_owner() TO service_role;