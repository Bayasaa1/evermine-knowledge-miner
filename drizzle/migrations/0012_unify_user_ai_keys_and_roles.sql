ALTER TABLE public.user_ai_keys
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rank integer NOT NULL DEFAULT 9000,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS cost_kind text NOT NULL DEFAULT 'free-tier',
  ADD COLUMN IF NOT EXISTS monthly_limit_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spend_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;

ALTER TABLE public.user_ai_roles
  ADD COLUMN IF NOT EXISTS key_id uuid REFERENCES public.user_ai_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_fallback boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS user_ai_keys_owner_rank_idx
  ON public.user_ai_keys(user_id, rank, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_ai_roles_key_idx
  ON public.user_ai_roles(key_id);

UPDATE public.user_ai_roles r
SET key_id = k.id
FROM public.user_ai_keys k
WHERE r.key_id IS NULL
  AND k.user_id = r.user_id
  AND k.provider = r.provider
  AND (r.key_tail IS NULL OR right(k.api_key, length(r.key_tail)) = r.key_tail)
  AND k.id = (
    SELECT k2.id
    FROM public.user_ai_keys k2
    WHERE k2.user_id = r.user_id
      AND k2.provider = r.provider
      AND (r.key_tail IS NULL OR right(k2.api_key, length(r.key_tail)) = r.key_tail)
    ORDER BY k2.updated_at DESC
    LIMIT 1
  );