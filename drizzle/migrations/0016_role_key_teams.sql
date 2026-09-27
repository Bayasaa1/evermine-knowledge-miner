ALTER TABLE public.user_ai_roles ADD COLUMN IF NOT EXISTS team_key_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.user_ai_roles ADD COLUMN IF NOT EXISTS exclusive boolean NOT NULL DEFAULT false;