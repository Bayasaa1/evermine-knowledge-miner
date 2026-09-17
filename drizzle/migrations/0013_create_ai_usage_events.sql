CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'other',
  provider text NOT NULL DEFAULT 'unknown',
  key_id uuid,
  key_tail text,
  model text NOT NULL DEFAULT '',
  subject_kind text NOT NULL DEFAULT 'other',
  subject_id text NOT NULL DEFAULT '',
  subject_label text NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  char_count integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  free_tier boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ok',
  error_code text,
  job_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own usage read" ON public.ai_usage_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own usage insert" ON public.ai_usage_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own usage delete" ON public.ai_usage_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX ai_usage_events_user_time_idx ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX ai_usage_events_user_role_idx ON public.ai_usage_events (user_id, role);
CREATE INDEX ai_usage_events_user_subject_idx ON public.ai_usage_events (user_id, subject_kind, subject_id);