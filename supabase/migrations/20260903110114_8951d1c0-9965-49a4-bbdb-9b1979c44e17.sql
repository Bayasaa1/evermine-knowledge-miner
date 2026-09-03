GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_reviews TO authenticated;
GRANT ALL ON public.mind_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_comments TO authenticated;
GRANT ALL ON public.mind_comments TO service_role;