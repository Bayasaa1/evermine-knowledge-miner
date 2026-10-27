CREATE TABLE public.creator_payout_accounts (
  user_id uuid PRIMARY KEY,
  bank_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  qr_url text NOT NULL DEFAULT '',
  stripe_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_payout_accounts TO authenticated;
GRANT ALL ON public.creator_payout_accounts TO service_role;
ALTER TABLE public.creator_payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages payout account" ON public.creator_payout_accounts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER creator_payout_accounts_updated BEFORE UPDATE ON public.creator_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mind_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  creator_user_id uuid,
  mind_id text NOT NULL,
  category text NOT NULL DEFAULT 'knowledge',
  plan text NOT NULL DEFAULT 'lifetime',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL DEFAULT 'bank',
  reference text NOT NULL UNIQUE,
  transaction_ref text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'awaiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mind_payment_orders_creator_idx ON public.mind_payment_orders (creator_user_id, created_at DESC);
CREATE INDEX mind_payment_orders_buyer_idx ON public.mind_payment_orders (buyer_id);
GRANT SELECT ON public.mind_payment_orders TO authenticated;
GRANT ALL ON public.mind_payment_orders TO service_role;
ALTER TABLE public.mind_payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer or creator reads order" ON public.mind_payment_orders
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = creator_user_id);
CREATE TRIGGER mind_payment_orders_updated BEFORE UPDATE ON public.mind_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();