UPDATE public.mind_vaults mv
SET persona_id = p.persona_id,
    project_id = pc.project_id
FROM public.project_content pc
JOIN public.projects p ON p.id = pc.project_id
WHERE mv.persona_id IS NULL
  AND mv.user_id = pc.user_id
  AND btrim(mv.title) = btrim(pc.title);