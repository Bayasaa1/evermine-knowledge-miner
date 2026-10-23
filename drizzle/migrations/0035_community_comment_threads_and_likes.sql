CREATE TABLE public.post_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 author_name text NOT NULL DEFAULT 'Creator',
 author_avatar text,
 content text NOT NULL,
 parent_id uuid REFERENCES public.post_comments(id),
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.post_comments TO anon;
GRANT SELECT, INSERT, UPDATE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY comments_read ON public.post_comments FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.user_posts p WHERE p.id = post_id) AND (user_id = auth.uid() OR NOT public.author_is_banned(user_id)));
CREATE POLICY comments_insert ON public.post_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND NOT public.author_is_banned(auth.uid()) AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.user_posts p WHERE p.id = post_id));
CREATE POLICY comments_update ON public.post_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX post_comments_post_time ON public.post_comments(post_id, created_at);
CREATE INDEX post_comments_parent ON public.post_comments(parent_id);
CREATE FUNCTION public.guard_post_comment() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.post_id IS DISTINCT FROM OLD.post_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.author_name IS DISTINCT FROM OLD.author_name OR NEW.author_avatar IS DISTINCT FROM OLD.author_avatar OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Comment identity cannot change';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Comment already deleted'; END IF;
  IF NEW.deleted_at IS NULL THEN RAISE EXCEPTION 'Only comment deletion is supported'; END IF;
  NEW.deleted_at := now(); NEW.content := '';
 ELSE
  IF length(trim(NEW.content)) = 0 THEN RAISE EXCEPTION 'Comment must not be empty'; END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.post_comments c WHERE c.id = NEW.parent_id AND c.post_id = NEW.post_id AND c.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Reply must belong to an active comment on the same post';
  END IF;
  NEW.content := trim(NEW.content);
  SELECT coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Creator'), p.avatar_url INTO NEW.author_name, NEW.author_avatar FROM public.profiles p WHERE p.id = NEW.user_id;
  NEW.author_name := coalesce(NEW.author_name, 'Creator');
  NEW.created_at := now(); NEW.deleted_at := NULL;
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_post_comment BEFORE INSERT OR UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.guard_post_comment();
CREATE TABLE public.comment_likes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
 post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comment_id, user_id)
);
GRANT SELECT ON public.comment_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT ALL ON public.comment_likes TO service_role;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_likes_read ON public.comment_likes FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.post_comments c WHERE c.id = comment_id));
CREATE POLICY comment_likes_insert ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND NOT public.author_is_banned(auth.uid()) AND EXISTS (SELECT 1 FROM public.post_comments c WHERE c.id = comment_id AND c.post_id = post_id AND c.deleted_at IS NULL));
CREATE POLICY comment_likes_delete ON public.comment_likes FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX comment_likes_post ON public.comment_likes(post_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments, public.comment_likes;