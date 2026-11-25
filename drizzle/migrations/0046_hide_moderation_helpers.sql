CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
ALTER FUNCTION public.author_is_banned(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_blocked_between(uuid, uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.author_is_banned(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_blocked_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.author_is_banned(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_blocked_between(uuid, uuid) TO authenticated, service_role;
DO $$
DECLARE d text;
BEGIN
  d := replace(pg_get_functiondef('public.is_mutual(uuid,uuid)'::regprocedure), 'public.is_blocked_between', 'private.is_blocked_between');
  EXECUTE d;
  d := replace(pg_get_functiondef('public.add_room_friend(uuid,uuid)'::regprocedure), 'public.is_blocked_between', 'private.is_blocked_between');
  EXECUTE d;
END $$;