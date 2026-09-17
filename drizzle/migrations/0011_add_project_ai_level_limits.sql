ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ai_level_default integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS ai_level_max integer NOT NULL DEFAULT 100;