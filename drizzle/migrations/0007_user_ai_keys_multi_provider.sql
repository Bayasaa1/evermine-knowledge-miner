ALTER TABLE public.user_ai_keys DROP CONSTRAINT IF EXISTS user_ai_keys_user_id_provider_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_ai_keys_user_provider_key_uniq
  ON public.user_ai_keys (user_id, provider, api_key);
CREATE INDEX IF NOT EXISTS user_ai_keys_user_idx ON public.user_ai_keys (user_id);