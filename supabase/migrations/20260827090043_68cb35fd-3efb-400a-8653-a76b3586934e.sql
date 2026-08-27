CREATE TABLE public.mind_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mind_id text NOT NULL,
  category text NOT NULL DEFAULT 'knowledge',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mind_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_purchases TO authenticated;
GRANT ALL ON public.mind_purchases TO service_role;
ALTER TABLE public.mind_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own purchases" ON public.mind_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can record their own purchases" ON public.mind_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own purchases" ON public.mind_purchases FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own purchases" ON public.mind_purchases FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_mind_purchases_updated_at BEFORE UPDATE ON public.mind_purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mind_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mind_id text NOT NULL,
  body text NOT NULL,
  author_name text NOT NULL DEFAULT 'Evermine user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mind_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_comments TO authenticated;
GRANT ALL ON public.mind_comments TO service_role;
ALTER TABLE public.mind_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are readable by everyone" ON public.mind_comments FOR SELECT USING (true);
CREATE POLICY "Users can write their own comments" ON public.mind_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comment" ON public.mind_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comment" ON public.mind_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_mind_comments_updated_at BEFORE UPDATE ON public.mind_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX mind_comments_mind_idx ON public.mind_comments (mind_id, created_at DESC);

DROP POLICY IF EXISTS "Users can write their own review" ON public.mind_reviews;
CREATE POLICY "Verified buyers can write their own review" ON public.mind_reviews FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.mind_purchases p WHERE p.user_id = auth.uid() AND p.mind_id = mind_reviews.mind_id)
);