ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES public.creator_personas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.project_content
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS projects_persona_id_idx ON public.projects (persona_id);