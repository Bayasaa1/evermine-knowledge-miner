-- Purchases must be granted by trusted server code only (price/payment verified).
DROP POLICY IF EXISTS "Users can record their own purchases" ON public.mind_purchases;
DROP POLICY IF EXISTS "Users can update their own purchases" ON public.mind_purchases;
DROP POLICY IF EXISTS "Users can delete their own purchases" ON public.mind_purchases;

REVOKE INSERT, UPDATE, DELETE ON public.mind_purchases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.mind_purchases FROM anon;
GRANT SELECT ON public.mind_purchases TO authenticated;
GRANT ALL ON public.mind_purchases TO service_role;