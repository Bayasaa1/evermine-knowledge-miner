CREATE TABLE public.graph_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES public.creator_personas(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, persona_id, source_key, target_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.graph_links TO authenticated;
GRANT ALL ON public.graph_links TO service_role;

ALTER TABLE public.graph_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own graph links"
ON public.graph_links FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER graph_links_set_updated_at
BEFORE UPDATE ON public.graph_links
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();