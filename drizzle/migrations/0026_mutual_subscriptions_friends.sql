CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, target_user_id),
  CHECK (subscriber_id <> target_user_id)
);
CREATE INDEX user_subscriptions_target_idx ON public.user_subscriptions (target_user_id);
GRANT SELECT, INSERT, DELETE ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  blocked_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blocked_user_id),
  CHECK (user_id <> blocked_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_blocks
    WHERE (user_id = _a AND blocked_user_id = _b) OR (user_id = _b AND blocked_user_id = _a))
$$;

CREATE OR REPLACE FUNCTION public.is_mutual(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE subscriber_id = _a AND target_user_id = _b)
     AND EXISTS (SELECT 1 FROM public.user_subscriptions WHERE subscriber_id = _b AND target_user_id = _a)
     AND NOT public.is_blocked_between(_a, _b)
$$;

CREATE POLICY "See subscriptions involving me" ON public.user_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = subscriber_id OR auth.uid() = target_user_id);
CREATE POLICY "Subscribe as myself" ON public.user_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = subscriber_id AND NOT public.is_blocked_between(subscriber_id, target_user_id));
CREATE POLICY "Remove my subscriptions or subscribers" ON public.user_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = subscriber_id OR auth.uid() = target_user_id);

CREATE POLICY "Manage my blocks" ON public.user_blocks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.block_user(_other uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  INSERT INTO public.user_blocks(user_id, blocked_user_id) VALUES (auth.uid(), _other) ON CONFLICT DO NOTHING;
  DELETE FROM public.user_subscriptions
   WHERE (subscriber_id = auth.uid() AND target_user_id = _other)
      OR (subscriber_id = _other AND target_user_id = auth.uid());
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.open_dm(_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _room uuid; _myname text; _othername text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF public.is_banned(_me) THEN RAISE EXCEPTION 'Account suspended'; END IF;
  IF NOT public.is_mutual(_me, _other) THEN RAISE EXCEPTION 'not_mutual'; END IF;
  SELECT r.id INTO _room FROM public.chat_rooms r
   WHERE r.kind = 'dm'
     AND EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id AND m.user_id = _me)
     AND EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id AND m.user_id = _other)
   LIMIT 1;
  IF _room IS NOT NULL THEN RETURN _room; END IF;
  SELECT coalesce(display_name,'') INTO _myname FROM public.profiles WHERE id = _me;
  SELECT coalesce(display_name,'') INTO _othername FROM public.profiles WHERE id = _other;
  INSERT INTO public.chat_rooms(owner_id, title, kind, invite_enabled)
   VALUES (_me, left(coalesce(_myname,'') || ' · ' || coalesce(_othername,''), 80), 'dm', false)
   RETURNING id INTO _room;
  INSERT INTO public.chat_room_members(room_id, user_id, display_name, role) VALUES
   (_room, _me, left(coalesce(_myname,''),60), 'owner'),
   (_room, _other, left(coalesce(_othername,''),60), 'member');
  RETURN _room;
END $$;