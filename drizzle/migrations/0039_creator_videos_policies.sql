CREATE POLICY "creator videos: owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'creator-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "creator videos: owner upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creator-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "creator videos: owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'creator-videos' AND (storage.foldername(name))[1] = auth.uid()::text);