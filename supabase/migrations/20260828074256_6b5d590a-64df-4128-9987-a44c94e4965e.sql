CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Project',
  description text NOT NULL DEFAULT '',
  cover_url text,
  creator_name text NOT NULL DEFAULT 'Evermind creator',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published projects are public" ON public.projects
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "Owners read their own projects" ON public.projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners insert their own projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners update their own projects" ON public.projects
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete their own projects" ON public.projects
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.project_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'VISUAL_CONTENT',
  youtube_id text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  emotion_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  mind_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_content_project_idx ON public.project_content (project_id);
CREATE INDEX project_content_kind_idx ON public.project_content (kind);

GRANT SELECT ON public.project_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_content TO authenticated;
GRANT ALL ON public.project_content TO service_role;

ALTER TABLE public.project_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Visual content of published projects is public" ON public.project_content
  FOR SELECT TO anon, authenticated USING (
    kind = 'VISUAL_CONTENT' AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = project_content.project_id AND p.published = true
    )
  );
CREATE POLICY "Owners read all their content" ON public.project_content
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners insert their own content" ON public.project_content
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners update their own content" ON public.project_content
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete their own content" ON public.project_content
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER project_content_set_updated_at BEFORE UPDATE ON public.project_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mind_reviews ADD COLUMN IF NOT EXISTS paid_owner boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_mind_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;
  NEW.updated_at = now();
  NEW.paid_owner = EXISTS (
    SELECT 1 FROM public.mind_purchases mp
    WHERE mp.user_id = NEW.user_id AND mp.mind_id = NEW.mind_id
  );
  NEW.verified_deployment = EXISTS (
    SELECT 1 FROM public.robot_packages rp
    WHERE rp.user_id = NEW.user_id AND rp.mind_id = NEW.mind_id
  );
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Verified buyers can write their own review" ON public.mind_reviews;
CREATE POLICY "Any signed-in tester can write their own review" ON public.mind_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);