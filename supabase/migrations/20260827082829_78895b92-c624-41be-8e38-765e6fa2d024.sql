CREATE TABLE public.mind_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mind_id TEXT NOT NULL,
  rating SMALLINT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  video_proof_url TEXT,
  author_name TEXT NOT NULL DEFAULT 'Evermine user',
  verified_deployment BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, mind_id)
);

CREATE INDEX mind_reviews_mind_id_idx ON public.mind_reviews (mind_id, created_at DESC);

GRANT SELECT ON public.mind_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_reviews TO authenticated;
GRANT ALL ON public.mind_reviews TO service_role;

ALTER TABLE public.mind_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are readable by everyone"
  ON public.mind_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can write their own review"
  ON public.mind_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own review"
  ON public.mind_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own review"
  ON public.mind_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_mind_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;
  NEW.updated_at = now();
  NEW.verified_deployment = EXISTS (
    SELECT 1 FROM public.robot_packages rp
    WHERE rp.user_id = NEW.user_id AND rp.mind_id = NEW.mind_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_mind_review_trigger
  BEFORE INSERT OR UPDATE ON public.mind_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_mind_review();