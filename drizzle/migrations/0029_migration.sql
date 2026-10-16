DROP POLICY IF EXISTS "user media read" ON storage.objects;
CREATE POLICY "user media read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'user-media' AND (
    owner_id = (SELECT auth.uid())::text
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.user_posts p
      WHERE p.media_path = objects.name
        AND p.user_id::text = (storage.foldername(objects.name))[1]
        AND NOT public.author_is_banned(p.user_id))
    OR EXISTS (SELECT 1 FROM public.user_stories s
      WHERE s.media_path = objects.name
        AND s.user_id::text = (storage.foldername(objects.name))[1]
        AND s.expires_at > now())
  )
);