CREATE OR REPLACE FUNCTION public.guard_crypto_payout_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'waiting_address' AND NEW.status = 'queued') OR
    (OLD.status = 'queued' AND NEW.status = 'sending') OR
    (OLD.status = 'sending' AND NEW.status IN ('sent','failed'))
  ) THEN
    RAISE EXCEPTION 'crypto payout status % -> % is not allowed', OLD.status, NEW.status;
  END IF;
  IF OLD.status IN ('sending','sent','failed') AND (NEW.amount <> OLD.amount OR NEW.to_address <> OLD.to_address OR NEW.network <> OLD.network) THEN
    RAISE EXCEPTION 'crypto payout destination is locked once sending starts';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crypto_payouts_status_guard BEFORE UPDATE ON public.crypto_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_crypto_payout_status();
REVOKE INSERT, UPDATE, DELETE ON public.mind_payment_orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crypto_payouts FROM anon, authenticated;