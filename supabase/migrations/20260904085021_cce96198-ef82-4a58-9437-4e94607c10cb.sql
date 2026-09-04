ALTER TABLE public.project_content
ADD COLUMN transcript jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.project_content AS pc
SET transcript = matched.transcript,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (content.id)
    content.id AS content_id,
    COALESCE(mv.payload -> 'result' -> 'transcript', '[]'::jsonb) AS transcript
  FROM public.project_content AS content
  JOIN public.mind_vaults AS mv
    ON mv.user_id = content.user_id
   AND (mv.project_id = content.project_id OR mv.title = content.title)
  WHERE jsonb_typeof(mv.payload -> 'result' -> 'transcript') = 'array'
  ORDER BY content.id, mv.updated_at DESC
) AS matched
WHERE pc.transcript = '[]'::jsonb
  AND pc.id = matched.content_id
  AND jsonb_array_length(matched.transcript) > 0;