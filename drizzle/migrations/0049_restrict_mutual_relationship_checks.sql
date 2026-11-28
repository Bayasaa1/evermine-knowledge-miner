CREATE OR REPLACE FUNCTION public.is_mutual(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR _a IS NULL OR _b IS NULL THEN
    RETURN false;
  END IF;
  IF _caller <> _a AND _caller <> _b THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.user_subscriptions WHERE subscriber_id = _a AND target_user_id = _b)
     AND EXISTS (SELECT 1 FROM public.user_subscriptions WHERE subscriber_id = _b AND target_user_id = _a)
     AND NOT private.is_blocked_between(_a, _b);
END
$function$;
REVOKE EXECUTE ON FUNCTION public.is_mutual(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mutual(uuid, uuid) TO authenticated, service_role;