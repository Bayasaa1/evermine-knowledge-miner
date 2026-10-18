CREATE OR REPLACE FUNCTION public.validate_room_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Room owner cannot change'; END IF;
 IF (NEW.moderator_mode IS DISTINCT FROM OLD.moderator_mode OR NEW.turn_token IS DISTINCT FROM OLD.turn_token OR NEW.active_mind_id IS DISTINCT FROM OLD.active_mind_id OR NEW.turn_started_at IS DISTINCT FROM OLD.turn_started_at) AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Only the owner controls moderator turns'; END IF;
 IF NEW.moderator_mode IS DISTINCT FROM OLD.moderator_mode AND OLD.turn_token IS NOT NULL AND OLD.turn_started_at>now()-interval '10 minutes' THEN RAISE EXCEPTION 'Wait for the current turn to finish'; END IF;
 IF NEW.avatar_path IS NOT NULL AND NEW.avatar_path NOT LIKE NEW.id::text || '/%' THEN RAISE EXCEPTION 'Invalid room avatar'; END IF;
 RETURN NEW;
END $$;