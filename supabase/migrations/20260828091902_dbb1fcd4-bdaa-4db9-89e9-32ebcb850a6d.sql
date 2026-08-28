-- 1) has_role no longer runs with elevated privileges
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 2) reviews require a real interaction with the mind
DROP POLICY IF EXISTS "Any signed-in tester can write their own review" ON public.mind_reviews;
CREATE POLICY "Verified testers can write their own review"
ON public.mind_reviews FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (SELECT 1 FROM public.mind_purchases mp WHERE mp.user_id = auth.uid() AND mp.mind_id = mind_reviews.mind_id)
    OR EXISTS (SELECT 1 FROM public.robot_packages rp WHERE rp.user_id = auth.uid() AND rp.mind_id = mind_reviews.mind_id)
    OR EXISTS (SELECT 1 FROM public.chat_messages cm WHERE cm.user_id = auth.uid() AND cm.mind_id = mind_reviews.mind_id)
  )
);

DROP POLICY IF EXISTS "Users can update their own review" ON public.mind_reviews;
CREATE POLICY "Users can update their own review"
ON public.mind_reviews FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (SELECT 1 FROM public.mind_purchases mp WHERE mp.user_id = auth.uid() AND mp.mind_id = mind_reviews.mind_id)
    OR EXISTS (SELECT 1 FROM public.robot_packages rp WHERE rp.user_id = auth.uid() AND rp.mind_id = mind_reviews.mind_id)
    OR EXISTS (SELECT 1 FROM public.chat_messages cm WHERE cm.user_id = auth.uid() AND cm.mind_id = mind_reviews.mind_id)
  )
);