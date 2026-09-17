CREATE TABLE public.user_ai_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  provider text NOT NULL,
  key_tail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_roles TO authenticated;
GRANT ALL ON public.user_ai_roles TO service_role;

ALTER TABLE public.user_ai_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their AI role choices"
ON public.user_ai_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners set their AI role choices"
ON public.user_ai_roles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners update their AI role choices"
ON public.user_ai_roles FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners delete their AI role choices"
ON public.user_ai_roles FOR DELETE TO authenticated
USING (auth.uid() = user_id);