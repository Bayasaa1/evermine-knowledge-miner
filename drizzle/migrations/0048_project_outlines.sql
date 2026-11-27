CREATE TABLE public.project_outlines (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  video_keywords jsonb NOT NULL DEFAULT '{}'::jsonb,
  outline jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_outlines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_outlines TO authenticated;
GRANT ALL ON public.project_outlines TO service_role;
ALTER TABLE public.project_outlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their outlines" ON public.project_outlines FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Published outlines are readable" ON public.project_outlines FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.published = true));
CREATE INDEX project_outlines_keywords_gin ON public.project_outlines USING gin (keywords);
CREATE INDEX project_outlines_user_idx ON public.project_outlines (user_id);