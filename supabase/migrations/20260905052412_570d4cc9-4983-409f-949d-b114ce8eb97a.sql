CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT banned FROM public.user_flags WHERE user_id = _user_id), false)
$$;

GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_mind_spec_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only manage specs as yourself';
  END IF;
  IF NEW.mind_id IS NULL OR btrim(NEW.mind_id) = '' THEN
    RAISE EXCEPTION 'A mind id is required';
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.robot_packages rp WHERE rp.mind_id = NEW.mind_id AND rp.user_id = NEW.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.mind_versions mv WHERE mv.mind_id = NEW.mind_id AND mv.user_id = NEW.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.project_content pc WHERE pc.mind_id = NEW.mind_id AND pc.user_id = NEW.user_id)
  THEN
    RAISE EXCEPTION 'You can only publish specs for a mind you own';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_mind_spec_owner_trigger ON public.mind_specs;
CREATE TRIGGER validate_mind_spec_owner_trigger
BEFORE INSERT OR UPDATE ON public.mind_specs
FOR EACH ROW EXECUTE FUNCTION public.validate_mind_spec_owner();