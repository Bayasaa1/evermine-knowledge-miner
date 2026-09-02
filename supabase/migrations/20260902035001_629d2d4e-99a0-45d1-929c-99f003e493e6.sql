ALTER TABLE public.mind_vaults
  ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES public.creator_personas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mind_vaults_persona_idx ON public.mind_vaults(user_id, persona_id);
CREATE INDEX IF NOT EXISTS mind_vaults_project_idx ON public.mind_vaults(user_id, project_id);