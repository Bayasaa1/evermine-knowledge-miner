ALTER TABLE public.project_content
  ADD COLUMN IF NOT EXISTS sequence_index integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id,
         (row_number() OVER (PARTITION BY project_id ORDER BY created_at ASC, id ASC) - 1)::integer AS next_index
  FROM public.project_content
)
UPDATE public.project_content AS content
SET sequence_index = ordered.next_index
FROM ordered
WHERE content.id = ordered.id;

CREATE INDEX IF NOT EXISTS project_content_project_sequence_idx
  ON public.project_content (project_id, sequence_index, created_at);

COMMENT ON COLUMN public.project_content.sequence_index IS
  'Creator-controlled order inside a project; lower values are older/earlier, higher values are newer/later.';