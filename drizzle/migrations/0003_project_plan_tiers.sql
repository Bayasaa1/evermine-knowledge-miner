ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS plan_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;