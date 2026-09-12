ALTER TABLE public.mind_purchases
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'lifetime',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;