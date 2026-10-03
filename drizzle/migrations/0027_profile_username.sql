ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,24}$');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username);