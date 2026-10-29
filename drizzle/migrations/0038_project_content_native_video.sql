ALTER TABLE public.project_content
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

CREATE OR REPLACE FUNCTION public.validate_content_source_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source_type NOT IN ('youtube','native_upload','camera_record') THEN
    RAISE EXCEPTION 'Invalid source_type %', NEW.source_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_content_source_type ON public.project_content;
CREATE TRIGGER trg_validate_content_source_type
BEFORE INSERT OR UPDATE OF source_type ON public.project_content
FOR EACH ROW EXECUTE FUNCTION public.validate_content_source_type();