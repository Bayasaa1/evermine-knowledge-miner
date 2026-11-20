ALTER TABLE public.mind_payment_orders
  ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_net numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS mind_payment_orders_crypto_tx_uniq
  ON public.mind_payment_orders (method, lower(transaction_ref))
  WHERE method IN ('usdt_trc20','usdt_polygon') AND transaction_ref <> '';