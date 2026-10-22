CREATE OR REPLACE FUNCTION public.claim_room_turn(_room uuid,_message uuid,_mind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE token uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL OR public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 PERFORM 1 FROM public.chat_rooms WHERE id=_room AND owner_id=auth.uid() AND moderator_mode FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the moderator may choose turns'; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_rooms WHERE id=_room AND turn_token IS NOT NULL AND turn_started_at>now()-interval '45 seconds') THEN RAISE EXCEPTION 'A Mind is already speaking'; END IF;
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
  IF r.turn_started_at IS NULL OR r.turn_started_at<=now()-interval '45 seconds' THEN RAISE EXCEPTION 'Turn expired'; END IF;
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
 IF EXISTS(SELECT 1 FROM public.chat_rooms WHERE id=_room AND turn_token IS NOT NULL AND turn_started_at>now()-interval '45 seconds') THEN RAISE EXCEPTION 'Wait for the current turn'; END IF;
 UPDATE public.chat_rooms SET turn_token=NULL,active_mind_id=NULL,turn_started_at=NULL WHERE id=_room;
 UPDATE public.chat_room_messages SET moderator_pending=false WHERE id=_message AND room_id=_room;
END $$;
CREATE OR REPLACE FUNCTION public.validate_room_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Room owner cannot change'; END IF;
 IF (NEW.moderator_mode IS DISTINCT FROM OLD.moderator_mode OR NEW.turn_token IS DISTINCT FROM OLD.turn_token OR NEW.active_mind_id IS DISTINCT FROM OLD.active_mind_id OR NEW.turn_started_at IS DISTINCT FROM OLD.turn_started_at) AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Only the owner controls moderator turns'; END IF;
 IF NEW.moderator_mode IS DISTINCT FROM OLD.moderator_mode AND OLD.turn_token IS NOT NULL AND OLD.turn_started_at>now()-interval '45 seconds' THEN RAISE EXCEPTION 'Wait for the current turn to finish'; END IF;
 IF NEW.avatar_path IS NOT NULL AND NEW.avatar_path NOT LIKE NEW.id::text || '/%' THEN RAISE EXCEPTION 'Invalid room avatar'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.claim_room_turn(uuid,uuid,text),public.finish_room_turn(uuid,uuid,uuid,text),public.complete_room_question(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_room_turn(uuid,uuid,text),public.finish_room_turn(uuid,uuid,uuid,text),public.complete_room_question(uuid,uuid) TO authenticated;