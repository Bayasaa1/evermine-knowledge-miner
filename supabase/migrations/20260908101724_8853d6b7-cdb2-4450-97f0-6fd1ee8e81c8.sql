ALTER TABLE public.mining_jobs
  ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES public.creator_personas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_kind text NOT NULL DEFAULT 'VISUAL_CONTENT',
  ADD COLUMN IF NOT EXISTS publish_to_feed boolean NOT NULL DEFAULT true;