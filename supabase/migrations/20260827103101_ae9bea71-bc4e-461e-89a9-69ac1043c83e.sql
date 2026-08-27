-- Strict per-account isolation of profile data (display name, avatar, email).
DROP POLICY IF EXISTS "Profiles are readable by signed-in users" ON public.profiles;

CREATE POLICY "Users can view only their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = id);

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Vaults, purchases, chat history and robot packages stay owner-only.
REVOKE ALL ON public.mind_vaults FROM anon;
REVOKE ALL ON public.mind_purchases FROM anon;
REVOKE ALL ON public.chat_messages FROM anon;
REVOKE ALL ON public.robot_packages FROM anon;
REVOKE ALL ON public.mind_comments FROM anon;
REVOKE ALL ON public.mind_reviews FROM anon;

-- Buyers may only record purchases for themselves (writes still go through the
-- verified server-side claim path, which uses the service role).
DROP POLICY IF EXISTS "Users can insert their own purchase" ON public.mind_purchases;