CREATE TABLE public.mind_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  vault_id uuid NOT NULL REFERENCES public.mind_vaults(id) ON DELETE CASCADE,
  mind_id text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT 'Untitled Mind',
  version text NOT NULL DEFAULT 'v1.0',
  version_num integer NOT NULL DEFAULT 1,
  release_notes text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mind_versions TO authenticated;
GRANT ALL ON public.mind_versions TO service_role;

ALTER TABLE public.mind_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own mind versions"
ON public.mind_versions FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX mind_versions_vault_idx ON public.mind_versions (vault_id, version_num DESC);

CREATE TRIGGER mind_versions_set_updated_at
BEFORE UPDATE ON public.mind_versions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.save_mind_version(
  _vault_id uuid,
  _title text,
  _payload jsonb,
  _release_notes text DEFAULT '',
  _mind_id text DEFAULT ''
)
RETURNS TABLE(vault_id uuid, version_id uuid, version text, version_num integer)
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _vid uuid;
  _next integer;
  _label text;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' OR _payload = '{}'::jsonb THEN
    RAISE EXCEPTION 'Mind payload is empty or invalid';
  END IF;
  IF NOT (_payload ? 'result') THEN
    RAISE EXCEPTION 'Mind payload is missing its mined result';
  END IF;

  IF _vault_id IS NULL THEN
    INSERT INTO public.mind_vaults (user_id, title, kind, payload)
    VALUES (_uid, COALESCE(NULLIF(_title, ''), 'Untitled Mind'), 'mine', _payload)
    RETURNING id INTO _vid;
  ELSE
    UPDATE public.mind_vaults
      SET title = COALESCE(NULLIF(_title, ''), title),
          payload = _payload,
          updated_at = now()
      WHERE id = _vault_id AND user_id = _uid
      RETURNING id INTO _vid;
    IF _vid IS NULL THEN
      RAISE EXCEPTION 'Mind vault not found';
    END IF;
  END IF;

  SELECT COALESCE(MAX(mv.version_num), 0) + 1 INTO _next
    FROM public.mind_versions mv WHERE mv.vault_id = _vid;
  _label := 'v1.' || (_next - 1)::text;

  UPDATE public.mind_versions SET is_active = false WHERE mind_versions.vault_id = _vid;

  INSERT INTO public.mind_versions (user_id, vault_id, mind_id, title, version, version_num, release_notes, payload, is_active)
  VALUES (_uid, _vid, COALESCE(_mind_id, ''), COALESCE(NULLIF(_title, ''), 'Untitled Mind'), _label, _next, COALESCE(_release_notes, ''), _payload, true)
  RETURNING id INTO _new_id;

  RETURN QUERY SELECT _vid, _new_id, _label, _next;
END;
$$;

REVOKE ALL ON FUNCTION public.save_mind_version(uuid, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_mind_version(uuid, text, jsonb, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rollback_mind_version(_version_id uuid)
RETURNS TABLE(vault_id uuid, version text)
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.mind_versions%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  SELECT * INTO _row FROM public.mind_versions WHERE id = _version_id AND user_id = _uid;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  UPDATE public.mind_versions SET is_active = (id = _row.id) WHERE mind_versions.vault_id = _row.vault_id;
  UPDATE public.mind_vaults
    SET payload = _row.payload, title = _row.title, updated_at = now()
    WHERE id = _row.vault_id AND user_id = _uid;

  RETURN QUERY SELECT _row.vault_id, _row.version;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_mind_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_mind_version(uuid) TO authenticated;