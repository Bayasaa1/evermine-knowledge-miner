DROP POLICY IF EXISTS "Owners manage their persona clones" ON public.persona_clones;
CREATE POLICY "Owners manage their persona clones"
ON public.persona_clones FOR ALL TO authenticated
USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.creator_personas p WHERE p.id = persona_id AND p.user_id = auth.uid()))
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.creator_personas p WHERE p.id = persona_id AND p.user_id = auth.uid()));
DELETE FROM public.persona_clones c WHERE NOT EXISTS (SELECT 1 FROM public.creator_personas p WHERE p.id = c.persona_id AND p.user_id = c.user_id);