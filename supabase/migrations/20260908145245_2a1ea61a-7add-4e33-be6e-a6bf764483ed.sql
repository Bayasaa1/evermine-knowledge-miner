CREATE TABLE public.persona_clones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES public.creator_personas(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('voice','face')),
  engine TEXT NOT NULL DEFAULT 'builtin',
  remote_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','building','ready','error')),
  error TEXT,
  consent BOOLEAN NOT NULL DEFAULT false,
  consent_at TIMESTAMP WITH TIME ZONE,
  samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (persona_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_clones TO authenticated;
GRANT ALL ON public.persona_clones TO service_role;

ALTER TABLE public.persona_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their persona clones"
ON public.persona_clones FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_persona_clones()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_persona_clones_updated_at
BEFORE UPDATE ON public.persona_clones
FOR EACH ROW EXECUTE FUNCTION public.touch_persona_clones();