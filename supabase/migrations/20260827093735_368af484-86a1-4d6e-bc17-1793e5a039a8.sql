-- 1. Comments: signed-in users only
DROP POLICY IF EXISTS "Comments are readable by everyone" ON public.mind_comments;
CREATE POLICY "Comments are readable by signed-in users"
ON public.mind_comments FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.mind_comments FROM anon;

-- 2. Reviews: signed-in users only
DROP POLICY IF EXISTS "Reviews are readable by everyone" ON public.mind_reviews;
CREATE POLICY "Reviews are readable by signed-in users"
ON public.mind_reviews FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.mind_reviews FROM anon;

-- 3. Robot packages: no anonymous table reads (deploy_token was exposed)
DROP POLICY IF EXISTS "Published robot packages are readable" ON public.robot_packages;
REVOKE SELECT ON public.robot_packages FROM anon;

-- Token-scoped lookup that never returns deploy_token
CREATE OR REPLACE FUNCTION public.get_published_mind_package(_token text)
RETURNS TABLE (mind_id text, title text, package jsonb, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rp.mind_id, rp.title, rp.package, rp.updated_at
  FROM public.robot_packages rp
  WHERE rp.published = true
    AND _token ~ '^[a-fA-F0-9]{8,64}$'
    AND rp.deploy_token = _token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_published_mind_package(text) TO anon, authenticated, service_role;