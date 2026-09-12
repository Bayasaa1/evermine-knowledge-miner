CREATE TABLE public.viewer_brains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mind_id text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shared_with_creator boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}',
  sessions integer NOT NULL DEFAULT 0,
  talk_seconds integer NOT NULL DEFAULT 0,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, mind_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viewer_brains TO authenticated;
GRANT ALL ON public.viewer_brains TO service_role;

ALTER TABLE public.viewer_brains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers own their brains"
ON public.viewer_brains
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Creators see shared brains"
ON public.viewer_brains
FOR SELECT
TO authenticated
USING (shared_with_creator = true AND creator_user_id = auth.uid());

CREATE TABLE public.viewer_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mind_id text NOT NULL,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('question', 'reaction', 'request')),
  body text NOT NULL,
  topic text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'dismissed')),
  creator_reply text,
  read_by_creator boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viewer_signals TO authenticated;
GRANT ALL ON public.viewer_signals TO service_role;

ALTER TABLE public.viewer_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers manage their signals"
ON public.viewer_signals
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Creators answer signals to them"
ON public.viewer_signals
FOR SELECT
TO authenticated
USING (creator_user_id = auth.uid());

CREATE POLICY "Creators reply to signals"
ON public.viewer_signals
FOR UPDATE
TO authenticated
USING (creator_user_id = auth.uid())
WITH CHECK (creator_user_id = auth.uid());

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS chat_access text NOT NULL DEFAULT 'open' CHECK (chat_access IN ('open', 'subscribers'));

CREATE TABLE public.creator_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mind_id text,
  kind text NOT NULL CHECK (kind IN ('content', 'version', 'note')),
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.creator_updates TO authenticated;
GRANT ALL ON public.creator_updates TO service_role;

ALTER TABLE public.creator_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators manage their updates"
ON public.creator_updates
FOR ALL
TO authenticated
USING (creator_user_id = auth.uid())
WITH CHECK (creator_user_id = auth.uid());

CREATE POLICY "Public reads updates for published projects"
ON public.creator_updates
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects p WHERE p.id = creator_updates.project_id AND p.published = true
));

CREATE TABLE public.update_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES public.creator_updates(id) ON DELETE CASCADE,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, update_id)
);

GRANT SELECT, INSERT, DELETE ON public.update_reads TO authenticated;
GRANT ALL ON public.update_reads TO service_role;

ALTER TABLE public.update_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers mark their own reads"
ON public.update_reads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
