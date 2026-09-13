-- New projects are private until the creator deliberately publishes them.
ALTER TABLE public.projects ALTER COLUMN published SET DEFAULT false;

-- Mined videos are training material by default, not feed posts.
ALTER TABLE public.mining_jobs ALTER COLUMN publish_to_feed SET DEFAULT false;