ALTER TABLE public.chat_rooms ADD COLUMN moderator_mode boolean NOT NULL DEFAULT false, ADD COLUMN avatar_path text, ADD COLUMN active_mind_id text, ADD COLUMN turn_token uuid, ADD COLUMN turn_started_at timestamptz;
ALTER TABLE public.chat_room_messages ADD COLUMN moderator_pending boolean NOT NULL DEFAULT false, ADD COLUMN reply_to_id uuid REFERENCES public.chat_room_messages(id) ON DELETE SET NULL, ADD COLUMN attachment jsonb;
CREATE INDEX chat_room_pending_idx ON public.chat_room_messages(room_id,created_at) WHERE moderator_pending;
CREATE OR REPLACE FUNCTION public.validate_room_settings() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Room owner cannot change'; END IF;
 IF NEW.moderator_mode IS DISTINCT FROM OLD.moderator_mode AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Only the owner controls moderator mode'; END IF;
 IF NEW.moderator_mode IS DISTINCT FROM OLD.moderator_mode AND OLD.turn_token IS NOT NULL AND OLD.turn_started_at > now()-interval '10 minutes' THEN RAISE EXCEPTION 'Wait for the current turn to finish'; END IF;
 IF NEW.avatar_path IS NOT NULL AND NEW.avatar_path NOT LIKE NEW.id::text || '/%' THEN RAISE EXCEPTION 'Invalid room avatar'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_room_settings BEFORE UPDATE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.validate_room_settings();
CREATE OR REPLACE FUNCTION public.validate_room_message() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.chat_rooms; p text;
BEGIN
 SELECT * INTO r FROM public.chat_rooms WHERE id=NEW.room_id;
 IF TG_OP='INSERT' THEN
  NEW.moderator_pending := NEW.sender_kind='user' AND r.moderator_mode;
  IF r.moderator_mode AND NEW.sender_kind='mind' AND (auth.uid() IS DISTINCT FROM r.owner_id OR r.turn_token IS NULL OR NEW.mind_id IS DISTINCT FROM r.active_mind_id) THEN RAISE EXCEPTION 'The owner must select a Mind turn'; END IF;
 END IF;
 IF NEW.attachment IS NOT NULL THEN
  IF NEW.sender_kind <> 'user' OR NEW.attachment->>'kind' NOT IN ('image','video','mind') THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
  IF NEW.attachment->>'kind' IN ('image','video') THEN
   p:=NEW.attachment->>'path';
   IF p IS NULL OR p NOT LIKE NEW.room_id::text || '/' || NEW.sender_user_id::text || '/%' THEN RAISE EXCEPTION 'Invalid media path'; END IF;
  ELSIF coalesce(NEW.attachment->>'mindId','')='' THEN RAISE EXCEPTION 'Missing Mind'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_room_message BEFORE INSERT ON public.chat_room_messages FOR EACH ROW EXECUTE FUNCTION public.validate_room_message();
CREATE OR REPLACE FUNCTION public.claim_room_turn(_room uuid,_message uuid,_mind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE token uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL OR public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 PERFORM 1 FROM public.chat_rooms WHERE id=_room AND owner_id=auth.uid() AND moderator_mode FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the moderator may choose turns'; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_rooms WHERE id=_room AND turn_token IS NOT NULL AND turn_started_at>now()-interval '10 minutes') THEN RAISE EXCEPTION 'A Mind is already speaking'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_room_minds WHERE room_id=_room AND mind_id=_mind) OR NOT EXISTS(SELECT 1 FROM public.chat_room_messages WHERE id=_message AND room_id=_room AND moderator_pending) THEN RAISE EXCEPTION 'Turn is no longer available'; END IF;
 UPDATE public.chat_rooms SET turn_token=token,active_mind_id=_mind,turn_started_at=now() WHERE id=_room;
 RETURN token;
END $$;
CREATE OR REPLACE FUNCTION public.finish_room_turn(_room uuid,_token uuid,_message uuid,_body text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.chat_rooms; n text;
BEGIN
 SELECT * INTO r FROM public.chat_rooms WHERE id=_room AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.turn_token IS DISTINCT FROM _token OR _token IS NULL THEN RAISE EXCEPTION 'Turn is no longer available'; END IF;
 IF _body IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.chat_room_messages WHERE id=_message AND room_id=_room AND moderator_pending) THEN RAISE EXCEPTION 'Message is no longer queued'; END IF;
  SELECT mind_name INTO n FROM public.chat_room_minds WHERE room_id=_room AND mind_id=r.active_mind_id;
  IF n IS NULL THEN RAISE EXCEPTION 'Mind was removed'; END IF;
  IF length(trim(_body))=0 THEN RAISE EXCEPTION 'Empty Mind reply'; END IF;
  INSERT INTO public.chat_room_messages(room_id,sender_user_id,sender_kind,mind_id,author_name,body,reply_to_id) VALUES(_room,auth.uid(),'mind',r.active_mind_id,n,left(trim(_body),8000),_message);
 END IF;
 UPDATE public.chat_rooms SET turn_token=NULL,active_mind_id=NULL,turn_started_at=NULL WHERE id=_room;
END $$;
CREATE OR REPLACE FUNCTION public.complete_room_question(_room uuid,_message uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.chat_rooms WHERE id=_room AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner controls the queue'; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_rooms WHERE id=_room AND turn_token IS NOT NULL AND turn_started_at>now()-interval '10 minutes') THEN RAISE EXCEPTION 'Wait for the current turn'; END IF;
 UPDATE public.chat_room_messages SET moderator_pending=false WHERE id=_message AND room_id=_room;
END $$;
CREATE OR REPLACE FUNCTION public.add_room_friend(_room uuid,_friend uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n text;
BEGIN
 IF auth.uid() IS NULL OR public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_rooms WHERE id=_room AND owner_id=auth.uid() AND kind<>'dm') THEN RAISE EXCEPTION 'Only the room owner can add friends'; END IF;
 IF NOT public.is_mutual(auth.uid(),_friend) OR public.is_banned(_friend) THEN RAISE EXCEPTION 'Only mutual friends may be invited'; END IF;
 SELECT coalesce(display_name,'User') INTO n FROM public.profiles WHERE id=_friend;
 INSERT INTO public.chat_room_members(room_id,user_id,display_name,role) VALUES(_room,_friend,left(coalesce(n,'User'),60),'member') ON CONFLICT(room_id,user_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.claim_room_turn(uuid,uuid,text),public.finish_room_turn(uuid,uuid,uuid,text),public.complete_room_question(uuid,uuid),public.add_room_friend(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_room_turn(uuid,uuid,text),public.finish_room_turn(uuid,uuid,uuid,text),public.complete_room_question(uuid,uuid),public.add_room_friend(uuid,uuid) TO authenticated;
CREATE POLICY "Room members read private media" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='room-media' AND EXISTS(SELECT 1 FROM public.chat_rooms r WHERE r.id::text=(storage.foldername(name))[1] AND public.is_room_member(r.id,auth.uid())));
CREATE POLICY "Room members upload own media" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='room-media' AND (storage.foldername(name))[2]=auth.uid()::text AND EXISTS(SELECT 1 FROM public.chat_rooms r WHERE r.id::text=(storage.foldername(name))[1] AND public.is_room_member(r.id,auth.uid())));
CREATE POLICY "Room uploaders delete own media" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='room-media' AND (storage.foldername(name))[2]=auth.uid()::text);
