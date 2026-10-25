DROP POLICY IF EXISTS "Verified testers can write their own review" ON public.mind_reviews;
DROP POLICY IF EXISTS "Users can update their own review" ON public.mind_reviews;
CREATE POLICY "Buyers can write their own review" ON public.mind_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.mind_purchases mp WHERE mp.user_id = auth.uid() AND mp.mind_id = mind_reviews.mind_id));
CREATE POLICY "Buyers can update their own review" ON public.mind_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.mind_purchases mp WHERE mp.user_id = auth.uid() AND mp.mind_id = mind_reviews.mind_id));

CREATE OR REPLACE FUNCTION public.validate_mind_review()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _owns boolean;
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;
  IF NEW.video_proof_url IS NOT NULL THEN
    NEW.video_proof_url = btrim(NEW.video_proof_url);
    IF NEW.video_proof_url = '' THEN
      NEW.video_proof_url = NULL;
    ELSIF NEW.video_proof_url !~* '^https?://[^\s<>"''`]+$' THEN
      RAISE EXCEPTION 'proof link must be a valid http(s) URL';
    END IF;
  END IF;
  NEW.updated_at = now();
  NEW.paid_owner = EXISTS (
    SELECT 1 FROM public.mind_purchases mp WHERE mp.user_id = NEW.user_id AND mp.mind_id = NEW.mind_id
  );
  _owns = NEW.mind_id LIKE 'project:%' AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.user_id = NEW.user_id AND p.id::text = substr(NEW.mind_id, 9)
  );
  -- A deployment only counts when the reviewer owns or bought the Mind.
  NEW.verified_deployment = (NEW.paid_owner OR _owns) AND EXISTS (
    SELECT 1 FROM public.robot_packages rp WHERE rp.user_id = NEW.user_id AND rp.mind_id = NEW.mind_id
  );
  RETURN NEW;
END;
$function$;

UPDATE public.mind_reviews SET updated_at = now();