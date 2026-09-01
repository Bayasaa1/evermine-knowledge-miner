-- 1. Founder super admin seeding
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth.users u WHERE lower(u.email) = 'bayasaa61@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  IF lower(COALESCE(NEW.email, '')) = 'bayasaa61@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Creator personas
CREATE TABLE public.creator_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New persona',
  handle text NOT NULL DEFAULT '',
  avatar_url text,
  bio text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_personas TO authenticated;
GRANT ALL ON public.creator_personas TO service_role;
ALTER TABLE public.creator_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their personas" ON public.creator_personas
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_creator_personas_updated_at
  BEFORE UPDATE ON public.creator_personas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX creator_personas_one_active
  ON public.creator_personas (user_id) WHERE is_active;

-- 3. Moderation flags
CREATE TABLE public.user_flags (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banned boolean NOT NULL DEFAULT false,
  ban_reason text NOT NULL DEFAULT '',
  unlimited_quota boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_flags TO authenticated;
GRANT ALL ON public.user_flags TO service_role;
ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own flags" ON public.user_flags
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_user_flags_updated_at
  BEFORE UPDATE ON public.user_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Featured minds
CREATE TABLE public.featured_minds (
  mind_id text PRIMARY KEY,
  featured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.featured_minds TO authenticated;
GRANT SELECT ON public.featured_minds TO anon;
GRANT ALL ON public.featured_minds TO service_role;
ALTER TABLE public.featured_minds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Featured minds are readable" ON public.featured_minds
  FOR SELECT TO anon, authenticated USING (true);

CREATE TRIGGER set_featured_minds_updated_at
  BEFORE UPDATE ON public.featured_minds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Persona branding on projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS creator_avatar_url text;