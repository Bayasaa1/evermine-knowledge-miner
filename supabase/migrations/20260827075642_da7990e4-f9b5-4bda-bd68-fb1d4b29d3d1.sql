CREATE TABLE public.robot_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mind_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  deploy_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  package JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mind_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.robot_packages TO authenticated;
GRANT SELECT ON public.robot_packages TO anon;
GRANT ALL ON public.robot_packages TO service_role;

ALTER TABLE public.robot_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators manage their own robot packages"
ON public.robot_packages FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Published robot packages are readable"
ON public.robot_packages FOR SELECT TO anon
USING (published = true);

CREATE INDEX robot_packages_token_idx ON public.robot_packages (deploy_token);