CREATE TABLE public.project_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  concept text NOT NULL,
  label text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'topic',
  count integer NOT NULL DEFAULT 0,
  content_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX project_concepts_unique ON public.project_concepts (project_id, kind, concept);
CREATE INDEX project_concepts_project_idx ON public.project_concepts (project_id, count DESC);
CREATE INDEX project_concepts_user_idx ON public.project_concepts (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_concepts TO authenticated;
GRANT ALL ON public.project_concepts TO service_role;

ALTER TABLE public.project_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their project concepts"
  ON public.project_concepts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER project_concepts_set_updated_at
  BEFORE UPDATE ON public.project_concepts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS project_content_project_created_idx
  ON public.project_content (project_id, created_at DESC);