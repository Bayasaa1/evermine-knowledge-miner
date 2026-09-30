-- Minds grow like roots: every re-mining, every different AI engine and every
-- manual correction becomes its own branch instead of overwriting what came
-- before. The creator alone decides which branch is the living Mind.
ALTER TABLE public.mind_versions
  ADD COLUMN IF NOT EXISTS parent_version_id uuid REFERENCES public.mind_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_name text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS created_by_engine text NOT NULL DEFAULT '';

-- Existing history is a single straight line, so each version's parent is the
-- one numbered before it inside the same vault.
UPDATE public.mind_versions mv
SET parent_version_id = prev.id
FROM (
  SELECT id, vault_id, version_num,
         LAG(id) OVER (PARTITION BY vault_id ORDER BY version_num) AS prev_id
  FROM public.mind_versions
) ranked
JOIN public.mind_versions prev ON prev.id = ranked.prev_id
WHERE mv.id = ranked.id AND mv.parent_version_id IS NULL;

CREATE INDEX IF NOT EXISTS mind_versions_parent_idx ON public.mind_versions(parent_version_id);
CREATE INDEX IF NOT EXISTS mind_versions_vault_branch_idx ON public.mind_versions(vault_id, branch_name);

-- Saves a new branch off an existing version WITHOUT touching the active Mind.
-- Nothing the creator is currently using changes until they choose to switch.
CREATE OR REPLACE FUNCTION public.save_mind_branch(
  _vault_id uuid,
  _title text,
  _payload jsonb,
  _parent_version_id uuid DEFAULT NULL,
  _branch_name text DEFAULT 'branch',
  _engine text DEFAULT '',
  _release_notes text DEFAULT '',
  _mind_id text DEFAULT ''
)
RETURNS TABLE(version_id uuid, version text, version_num integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _next integer;
  _label text;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' OR NOT (_payload ? 'result') THEN
    RAISE EXCEPTION 'Mind payload is empty or invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mind_vaults v WHERE v.id = _vault_id AND v.user_id = _uid) THEN
    RAISE EXCEPTION 'Mind vault not found';
  END IF;
  IF _parent_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.mind_versions p WHERE p.id = _parent_version_id AND p.user_id = _uid
  ) THEN
    RAISE EXCEPTION 'Parent version not found';
  END IF;

  SELECT COALESCE(MAX(mv.version_num), 0) + 1 INTO _next
    FROM public.mind_versions mv WHERE mv.vault_id = _vault_id;
  _label := 'v1.' || (_next - 1)::text;

  INSERT INTO public.mind_versions (
    user_id, vault_id, mind_id, title, version, version_num, release_notes,
    payload, is_active, parent_version_id, branch_name, created_by_engine
  )
  VALUES (
    _uid, _vault_id, COALESCE(_mind_id, ''), COALESCE(NULLIF(_title, ''), 'Untitled Mind'),
    _label, _next, COALESCE(_release_notes, ''), _payload, false,
    _parent_version_id, COALESCE(NULLIF(btrim(_branch_name), ''), 'branch'), COALESCE(_engine, '')
  )
  RETURNING id INTO _new_id;

  RETURN QUERY SELECT _new_id, _label, _next;
END;
$$;

-- Renaming a branch is the creator's call, never automatic.
CREATE OR REPLACE FUNCTION public.rename_mind_branch(_version_id uuid, _branch_name text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF btrim(COALESCE(_branch_name, '')) = '' THEN
    RAISE EXCEPTION 'A branch name is required';
  END IF;
  UPDATE public.mind_versions
    SET branch_name = btrim(_branch_name), updated_at = now()
    WHERE id = _version_id AND user_id = _uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  RETURN true;
END;
$$;