CREATE OR REPLACE FUNCTION public.persona_handle_taken(_handle text, _exclude_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creator_personas
    WHERE lower(handle) = lower(_handle)
      AND user_id <> auth.uid()
      AND (_exclude_id IS NULL OR id <> _exclude_id)
  )
$$;
GRANT EXECUTE ON FUNCTION public.persona_handle_taken(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_duplicate_persona_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT mine.id FROM public.creator_personas mine
  WHERE mine.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.creator_personas o
      WHERE lower(o.handle) = lower(mine.handle)
        AND o.user_id <> mine.user_id
        AND o.created_at < mine.created_at
    )
$$;
GRANT EXECUTE ON FUNCTION public.my_duplicate_persona_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_persona_handle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND lower(NEW.handle) = lower(OLD.handle) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.creator_personas
             WHERE lower(handle) = lower(NEW.handle) AND user_id <> NEW.user_id AND id <> NEW.id) THEN
    RAISE EXCEPTION 'handle_not_available';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_persona_handle ON public.creator_personas;
CREATE TRIGGER guard_persona_handle BEFORE INSERT OR UPDATE OF handle ON public.creator_personas
FOR EACH ROW EXECUTE FUNCTION public.guard_persona_handle();