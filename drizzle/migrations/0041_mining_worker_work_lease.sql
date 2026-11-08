CREATE TABLE public.mining_worker_state (
 name text PRIMARY KEY,
 token uuid,
 lease_until timestamptz NOT NULL DEFAULT '-infinity',
 phase integer NOT NULL DEFAULT 0 CHECK (phase BETWEEN 0 AND 4),
 cursors jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.mining_worker_state TO service_role;
ALTER TABLE public.mining_worker_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_worker_state ON public.mining_worker_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE FUNCTION public.claim_mining_worker(p_token uuid) RETURNS SETOF public.mining_worker_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.mining_worker_state(name) VALUES ('resume-mining') ON CONFLICT DO NOTHING;
 RETURN QUERY UPDATE public.mining_worker_state SET token = p_token, lease_until = now() + interval '6 minutes' WHERE name = 'resume-mining' AND lease_until <= now() RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.claim_mining_worker(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mining_worker(uuid) TO service_role;