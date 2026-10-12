-- A trading portfolio can contain cash accounts and investment groups such as
-- "Growth stocks".  Assets belong to at most one group within their portfolio;
-- users can move them between groups without changing the trade ledger.

ALTER TABLE public.brokerage_accounts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cash';

ALTER TABLE public.brokerage_accounts
  DROP CONSTRAINT IF EXISTS brokerage_accounts_kind_check;
ALTER TABLE public.brokerage_accounts
  ADD CONSTRAINT brokerage_accounts_kind_check
  CHECK (kind IN ('cash', 'asset_group'));

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS brokerage_account_id uuid
  REFERENCES public.brokerage_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_brokerage_account
  ON public.assets (brokerage_account_id, sort_order);

CREATE OR REPLACE FUNCTION public.validate_asset_group_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_portfolio_id uuid;
  account_user_id uuid;
  account_kind text;
BEGIN
  IF NEW.brokerage_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT portfolio_id, user_id, kind
    INTO account_portfolio_id, account_user_id, account_kind
    FROM public.brokerage_accounts
    WHERE id = NEW.brokerage_account_id;
  IF account_portfolio_id IS NULL
    OR account_portfolio_id IS DISTINCT FROM NEW.portfolio_id
    OR account_user_id IS DISTINCT FROM NEW.user_id
    OR account_kind IS DISTINCT FROM 'asset_group' THEN
    RAISE EXCEPTION 'An asset can be assigned only to an asset group in the same portfolio';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_asset_group_assignment ON public.assets;
CREATE TRIGGER validate_asset_group_assignment
  BEFORE INSERT OR UPDATE OF brokerage_account_id, portfolio_id ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_asset_group_assignment();
