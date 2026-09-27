-- Renaming a persona must reach every project that belongs to it, because the
-- project keeps a snapshot of the creator name and the chat self-introduction
-- reads that snapshot.
CREATE OR REPLACE FUNCTION public.sync_persona_name_to_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    UPDATE public.projects
      SET creator_name = NEW.name,
          creator_avatar_url = COALESCE(NEW.avatar_url, creator_avatar_url)
      WHERE persona_id = NEW.id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_persona_name_to_projects ON public.creator_personas;
CREATE TRIGGER sync_persona_name_to_projects
AFTER UPDATE ON public.creator_personas
FOR EACH ROW EXECUTE FUNCTION public.sync_persona_name_to_projects();

-- One-time repair of names that drifted before the trigger existed.
UPDATE public.projects p
SET creator_name = cp.name
FROM public.creator_personas cp
WHERE p.persona_id = cp.id
  AND p.user_id = cp.user_id
  AND p.creator_name IS DISTINCT FROM cp.name;
