CREATE OR REPLACE FUNCTION public.validate_mind_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;

  -- Only plain http(s) links may be stored: javascript:, data:, vbscript: and
  -- other schemes would execute in a visitor's browser when clicked.
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
    SELECT 1 FROM public.mind_purchases mp
    WHERE mp.user_id = NEW.user_id AND mp.mind_id = NEW.mind_id
  );
  NEW.verified_deployment = EXISTS (
    SELECT 1 FROM public.robot_packages rp
    WHERE rp.user_id = NEW.user_id AND rp.mind_id = NEW.mind_id
  );
  RETURN NEW;
END;
$function$;

UPDATE public.mind_reviews
SET video_proof_url = NULL
WHERE video_proof_url IS NOT NULL
  AND btrim(video_proof_url) !~* '^https?://[^\s<>"''`]+$';
