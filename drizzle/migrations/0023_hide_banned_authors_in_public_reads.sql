CREATE OR REPLACE FUNCTION public.author_is_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT banned FROM public.user_flags WHERE user_id = _user_id), false)
$$;
REVOKE ALL ON FUNCTION public.author_is_banned(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.author_is_banned(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Posts are public to read" ON public.user_posts;
CREATE POLICY "Posts are public to read" ON public.user_posts
FOR SELECT TO anon, authenticated
USING (user_id = (select auth.uid()) OR NOT public.author_is_banned(user_id));

DROP POLICY IF EXISTS "Comments are readable by signed-in users" ON public.mind_comments;
CREATE POLICY "Comments are readable by signed-in users" ON public.mind_comments
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR NOT public.author_is_banned(user_id));

DROP POLICY IF EXISTS "Reviews are readable by signed-in users" ON public.mind_reviews;
CREATE POLICY "Reviews are readable by signed-in users" ON public.mind_reviews
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR NOT public.author_is_banned(user_id));

DROP POLICY IF EXISTS "Specs are readable by signed-in users" ON public.mind_specs;
CREATE POLICY "Specs are readable by signed-in users" ON public.mind_specs
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR NOT public.author_is_banned(user_id));