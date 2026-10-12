-- Money Buckets are personal/bank cash containers, never trading-account
-- funding sources.  Enforce the portfolio boundary server-side as well as in
-- the UI, so a client cannot attach a new bucket record to a trading portfolio.

CREATE OR REPLACE FUNCTION public.require_cash_management_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_kind text;
BEGIN
  IF NEW.portfolio_id IS NULL THEN
    RAISE EXCEPTION 'A cash-management record requires a cash-management portfolio';
  END IF;

  SELECT kind INTO target_kind
  FROM public.portfolios
  WHERE id = NEW.portfolio_id AND user_id = NEW.user_id;

  IF target_kind IS DISTINCT FROM 'cash_management' THEN
    RAISE EXCEPTION 'Money Buckets and cash-management records are allowed only in a cash-management portfolio';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_cash_management_money_bucket ON public.money_buckets;
CREATE TRIGGER require_cash_management_money_bucket
  BEFORE INSERT OR UPDATE OF portfolio_id ON public.money_buckets
  FOR EACH ROW EXECUTE FUNCTION public.require_cash_management_portfolio();

DROP TRIGGER IF EXISTS require_cash_management_bucket_activity ON public.bucket_activities;
CREATE TRIGGER require_cash_management_bucket_activity
  BEFORE INSERT OR UPDATE OF portfolio_id ON public.bucket_activities
  FOR EACH ROW EXECUTE FUNCTION public.require_cash_management_portfolio();

DROP TRIGGER IF EXISTS require_cash_management_cash_activity ON public.cash_activities;
CREATE TRIGGER require_cash_management_cash_activity
  BEFORE INSERT OR UPDATE OF portfolio_id ON public.cash_activities
  FOR EACH ROW EXECUTE FUNCTION public.require_cash_management_portfolio();
