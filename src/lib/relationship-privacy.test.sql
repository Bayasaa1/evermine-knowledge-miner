-- Run against the database through the approved SQL tool. All fixtures roll back.
BEGIN;
DO $test$
DECLARE
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
BEGIN
  IF has_function_privilege('anon', 'public.is_mutual(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers must not execute friendship checks';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_mutual(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Signed-in participants must retain friendship checks';
  END IF;

  INSERT INTO public.user_subscriptions(subscriber_id, target_user_id)
  VALUES (a,b), (b,a);

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF public.is_mutual(a,b) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A signed-out caller must not learn a real mutual relationship';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
  IF public.is_mutual(a,b) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'An unrelated signed-in caller must not learn a mutual relationship';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  IF public.is_mutual(a,b) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The first participant must see the mutual relationship';
  END IF;
  IF public.is_mutual(a,NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Missing participants must not pass the privacy guard';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', b::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  IF public.is_mutual(a,b) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The second participant must see the mutual relationship';
  END IF;

  INSERT INTO public.user_blocks(user_id, blocked_user_id) VALUES (b,a);
  IF public.is_mutual(a,b) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Blocked participants must not be mutual friends';
  END IF;
  DELETE FROM public.user_blocks WHERE user_id=b AND blocked_user_id=a;
  DELETE FROM public.user_subscriptions WHERE subscriber_id=b AND target_user_id=a;
  IF public.is_mutual(a,b) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'One-way subscriptions must not count as mutual friends';
  END IF;
END
$test$;
ROLLBACK;