ALTER TABLE public.creator_personas
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS greeting text NOT NULL DEFAULT '';

CREATE TABLE public.mind_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  suggest boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_qa TO authenticated;
GRANT ALL ON public.mind_qa TO service_role;
ALTER TABLE public.mind_qa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their Q&A" ON public.mind_qa FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE INDEX mind_qa_project_idx ON public.mind_qa(project_id, sort);
CREATE TRIGGER mind_qa_set_updated_at BEFORE UPDATE ON public.mind_qa FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();