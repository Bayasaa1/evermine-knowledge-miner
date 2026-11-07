CREATE OR REPLACE FUNCTION public.add_room_friend(_room uuid,_friend uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n text;
BEGIN
 IF auth.uid() IS NULL OR public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_rooms WHERE id=_room AND kind<>'dm' AND public.is_room_admin(_room,auth.uid())) THEN RAISE EXCEPTION 'Only room hosts can add people'; END IF;
 IF _friend=auth.uid() OR public.is_banned(_friend) OR public.is_blocked_between(auth.uid(),_friend) THEN RAISE EXCEPTION 'This person cannot be added'; END IF;
 SELECT coalesce(display_name,'User') INTO n FROM public.profiles WHERE id=_friend;
 IF n IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 INSERT INTO public.chat_room_members(room_id,user_id,display_name,role) VALUES(_room,_friend,left(n,60),'member') ON CONFLICT(room_id,user_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.add_room_friend(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_room_friend(uuid,uuid) TO authenticated;
