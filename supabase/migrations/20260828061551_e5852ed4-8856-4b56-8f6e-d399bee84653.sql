-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2. Mining jobs with 5-minute checkpoints
CREATE TABLE public.mining_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind text NOT NULL DEFAULT 'youtube',
  source_url text NOT NULL,
  source_label text NOT NULL DEFAULT '',
  playlist_id text,
  queue_position integer NOT NULL DEFAULT 0,
  video_context text NOT NULL DEFAULT 'Podcast',
  primary_focus text NOT NULL DEFAULT 'Knowledge/QA',
  custom_instructions text NOT NULL DEFAULT '',
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_index integer NOT NULL DEFAULT 0,
  total_chunks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  last_error text,
  retry_after timestamptz,
  vault_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mining_jobs_user_idx ON public.mining_jobs (user_id, created_at DESC);
CREATE INDEX mining_jobs_resume_idx ON public.mining_jobs (status, retry_after);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mining_jobs TO authenticated;
GRANT ALL ON public.mining_jobs TO service_role;
ALTER TABLE public.mining_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own mining jobs"
ON public.mining_jobs FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER mining_jobs_set_updated_at
BEFORE UPDATE ON public.mining_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Activity / security audit log
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  detail text NOT NULL DEFAULT '',
  ip text,
  user_agent text,
  tokens integer NOT NULL DEFAULT 0,
  suspicious boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_logs_created_idx ON public.activity_logs (created_at DESC);

GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read the activity log"
ON public.activity_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Seed the owner account as admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'bayasaa61@gmail.com'
ON CONFLICT DO NOTHING;