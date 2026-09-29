CREATE OR REPLACE FUNCTION public.set_project_content_sequence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sequence_index = 0 AND EXISTS (
    SELECT 1 FROM public.project_content existing
    WHERE existing.project_id = NEW.project_id
  ) THEN
    SELECT COALESCE(MAX(existing.sequence_index), -1) + 1
    INTO NEW.sequence_index
    FROM public.project_content existing
    WHERE existing.project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_content_set_sequence ON public.project_content;
CREATE TRIGGER project_content_set_sequence
BEFORE INSERT ON public.project_content
FOR EACH ROW EXECUTE FUNCTION public.set_project_content_sequence();