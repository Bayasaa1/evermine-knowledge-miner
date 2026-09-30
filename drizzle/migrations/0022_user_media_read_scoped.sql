DROP POLICY IF EXISTS "user media read" ON storage.objects;
CREATE POLICY "user media read" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'user-media' AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.user_posts p WHERE p.media_path = storage.objects.name)
    OR EXISTS (SELECT 1 FROM public.user_stories s WHERE s.media_path = storage.objects.name AND s.expires_at > now())
  )
);