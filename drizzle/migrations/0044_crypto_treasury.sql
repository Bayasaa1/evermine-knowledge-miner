ALTER TABLE public.mind_payment_orders
  ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT '';
ALTER TABLE public.creator_payout_accounts
  ADD COLUMN IF NOT EXISTS usdt_trc20_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS usdt_polygon_address text NOT NULL DEFAULT '';
CREATE TABLE public.crypto_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('creator','platform')),
  recipient_user_id uuid,
  network text NOT NULL CHECK (network IN ('usdt_trc20','usdt_polygon')),
  to_address text NOT NULL DEFAULT '',
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','waiting_address','sending','sent','failed')),
  tx_hash text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);
GRANT SELECT ON public.crypto_payouts TO authenticated;
GRANT ALL ON public.crypto_payouts TO service_role;
ALTER TABLE public.crypto_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators read own payouts" ON public.crypto_payouts FOR SELECT TO authenticated
  USING (kind = 'creator' AND recipient_user_id = auth.uid());
CREATE INDEX crypto_payouts_status_idx ON public.crypto_payouts (status, created_at);