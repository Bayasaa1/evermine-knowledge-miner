CREATE TABLE public.mind_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mind_id text NOT NULL UNIQUE,
  training_hours numeric NOT NULL DEFAULT 0,
  version text NOT NULL DEFAULT 'v1.0',
  accuracy_score numeric NOT NULL DEFAULT 0,
  compatibility text[] NOT NULL DEFAULT ARRAY['ROS 2','Web Voice']::text[],
  changelog_notes text NOT NULL DEFAULT '',
  resolved_review_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_specs TO authenticated;
GRANT ALL ON public.mind_specs TO service_role;

ALTER TABLE public.mind_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Specs are readable by signed-in users"
  ON public.mind_specs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Creators insert their own specs"
  ON public.mind_specs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creators update their own specs"
  ON public.mind_specs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creators delete their own specs"
  ON public.mind_specs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER mind_specs_set_updated_at
  BEFORE UPDATE ON public.mind_specs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();