CREATE TABLE public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'group',
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9),'hex'),
  invite_enabled boolean NOT NULL DEFAULT true,
  debate_mode text NOT NULL DEFAULT 'mention',
  turn_limit integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'member',
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE TABLE public.chat_room_minds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  mind_id text NOT NULL,
  mind_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'debater',
  added_by uuid NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, mind_id)
);
CREATE TABLE public.chat_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_kind text NOT NULL DEFAULT 'user',
  mind_id text,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  shared_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_room_messages_room_idx ON public.chat_room_messages(room_id, created_at);
CREATE INDEX chat_room_members_user_idx ON public.chat_room_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_rooms, public.chat_room_members, public.chat_room_minds, public.chat_room_messages TO authenticated;
GRANT ALL ON public.chat_rooms, public.chat_room_members, public.chat_room_minds, public.chat_room_messages TO service_role;

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_minds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_room_member(_room uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = _room AND user_id = _user)
$$;
CREATE OR REPLACE FUNCTION public.is_room_admin(_room uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = _room AND user_id = _user AND role IN ('owner','admin'))
$$;

-- Rooms
CREATE POLICY "Members read rooms" ON public.chat_rooms FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_room_member(id, auth.uid()));
CREATE POLICY "Users create own rooms" ON public.chat_rooms FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND NOT public.is_banned(auth.uid()));
CREATE POLICY "Admins update rooms" ON public.chat_rooms FOR UPDATE TO authenticated
  USING (public.is_room_admin(id, auth.uid())) WITH CHECK (public.is_room_admin(id, auth.uid()));
CREATE POLICY "Owner deletes room" ON public.chat_rooms FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Members
CREATE POLICY "Members see members" ON public.chat_room_members FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));
CREATE POLICY "Owner adds self as owner" ON public.chat_room_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.id = room_id AND r.owner_id = auth.uid()));
CREATE POLICY "Self updates own read marker" ON public.chat_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()
    AND role = (SELECT m.role FROM public.chat_room_members m WHERE m.id = chat_room_members.id));
CREATE POLICY "Leave or admin removes" ON public.chat_room_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (public.is_room_admin(room_id, auth.uid()) AND role <> 'owner'));

-- Minds
CREATE POLICY "Members see minds" ON public.chat_room_minds FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));
CREATE POLICY "Admins add minds" ON public.chat_room_minds FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND public.is_room_admin(room_id, auth.uid()));
CREATE POLICY "Admins edit minds" ON public.chat_room_minds FOR UPDATE TO authenticated
  USING (public.is_room_admin(room_id, auth.uid())) WITH CHECK (public.is_room_admin(room_id, auth.uid()));
CREATE POLICY "Admins remove minds" ON public.chat_room_minds FOR DELETE TO authenticated
  USING (public.is_room_admin(room_id, auth.uid()));

-- Messages
CREATE POLICY "Members read messages" ON public.chat_room_messages FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));
CREATE POLICY "Members post messages" ON public.chat_room_messages FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid() AND public.is_room_member(room_id, auth.uid())
    AND NOT public.is_banned(auth.uid()));
CREATE POLICY "Author or admin deletes" ON public.chat_room_messages FOR DELETE TO authenticated
  USING (sender_user_id = auth.uid() OR public.is_room_admin(room_id, auth.uid()));

-- Join by invite code (only path for others to enter a room)
CREATE OR REPLACE FUNCTION public.join_room_by_code(_code text, _name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _room uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'Account suspended'; END IF;
  SELECT id INTO _room FROM public.chat_rooms WHERE invite_code = _code AND invite_enabled;
  IF _room IS NULL THEN RAISE EXCEPTION 'Invite not valid'; END IF;
  INSERT INTO public.chat_room_members(room_id, user_id, display_name, role)
  VALUES (_room, auth.uid(), left(coalesce(_name,''), 60), 'member')
  ON CONFLICT (room_id, user_id) DO NOTHING;
  RETURN _room;
END $$;
REVOKE ALL ON FUNCTION public.join_room_by_code(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_room_by_code(text, text) TO authenticated;

-- Admin promotes/demotes a member
CREATE OR REPLACE FUNCTION public.set_room_member_role(_member uuid, _role text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _room uuid; _cur text;
BEGIN
  IF _role NOT IN ('admin','member') THEN RAISE EXCEPTION 'Bad role'; END IF;
  SELECT room_id, role INTO _room, _cur FROM public.chat_room_members WHERE id = _member;
  IF _room IS NULL OR _cur = 'owner' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_rooms WHERE id = _room AND owner_id = auth.uid()) THEN RETURN false; END IF;
  UPDATE public.chat_room_members SET role = _role WHERE id = _member;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_room_member_role(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_room_member_role(uuid, text) TO authenticated;

CREATE TRIGGER chat_rooms_updated BEFORE UPDATE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_room_messages;