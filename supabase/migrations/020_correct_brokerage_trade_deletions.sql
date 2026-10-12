-- A brokerage trade and its cash effect are one financial event.  Delete them
-- together through a controlled function so a Portfolio position cannot
-- reappear after refresh because a protected cash-ledger FK blocked the trade
-- deletion.

CREATE OR REPLACE FUNCTION public.prevent_brokerage_cash_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.allow_brokerage_ledger_mutation', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'brokerage_cash_entries is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_trade_with_brokerage_cash(p_trade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_trade public.trades%ROWTYPE;
BEGIN
  SELECT * INTO target_trade FROM public.trades WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF target_trade.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can delete only your own trades';
  END IF;

  IF target_trade.brokerage_account_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(target_trade.brokerage_account_id::text, 0));
  END IF;

  PERFORM set_config('app.allow_brokerage_ledger_mutation', 'on', true);
  DELETE FROM public.brokerage_cash_entries WHERE trade_id = p_trade_id;
  DELETE FROM public.trades WHERE id = p_trade_id;
  IF EXISTS (
    SELECT 1 FROM public.brokerage_account_balances
    WHERE brokerage_account_id = target_trade.brokerage_account_id AND cash_balance < -0.000001
  ) THEN
    RAISE EXCEPTION 'Deletion would make brokerage cash negative';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_position_with_brokerage_cash(
  p_symbol text,
  p_portfolio_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count integer := 0;
  account_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios
    WHERE id = p_portfolio_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can delete positions only from your own portfolio';
  END IF;

  FOR account_id IN SELECT id FROM public.brokerage_accounts
    WHERE portfolio_id = p_portfolio_id AND user_id = auth.uid() ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(account_id::text, 0));
  END LOOP;
  PERFORM set_config('app.allow_brokerage_ledger_mutation', 'on', true);
  DELETE FROM public.brokerage_cash_entries
  WHERE trade_id IN (
    SELECT id FROM public.trades
    WHERE user_id = auth.uid()
      AND portfolio_id = p_portfolio_id
      AND upper(symbol) = upper(p_symbol)
  );

  DELETE FROM public.trades
  WHERE user_id = auth.uid()
    AND portfolio_id = p_portfolio_id
    AND upper(symbol) = upper(p_symbol);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF EXISTS (
    SELECT 1 FROM public.brokerage_account_balances
    WHERE portfolio_id = p_portfolio_id AND user_id = auth.uid() AND cash_balance < -0.000001
  ) THEN
    RAISE EXCEPTION 'Deletion would make brokerage cash negative';
  END IF;

  UPDATE public.assets
  SET is_active = false,
      quantity = 0,
      value_usd = 0,
      updated_at = now()
  WHERE user_id = auth.uid()
    AND portfolio_id = p_portfolio_id
    AND upper(symbol) = upper(p_symbol);

  RETURN deleted_count;
END;
$$;

-- These RPCs are intentionally callable only by a signed-in user.  Each
-- function also verifies ownership with auth.uid(), so this does not permit a
-- user to mutate another user's ledger.
REVOKE ALL ON FUNCTION public.delete_trade_with_brokerage_cash(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_position_with_brokerage_cash(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_trade_with_brokerage_cash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_position_with_brokerage_cash(text, uuid) TO authenticated;
