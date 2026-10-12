-- Corrections to a posted broker trade must update its matching cash effect
-- in the same transaction.  Direct table updates cannot do that safely.

CREATE OR REPLACE FUNCTION public.replace_brokerage_trade(
  p_trade_id uuid,
  p_symbol text,
  p_execution_date timestamptz,
  p_quantity numeric,
  p_price_at_execution numeric,
  p_amount_usd numeric,
  p_original_amount numeric
)
RETURNS public.trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_trade public.trades%ROWTYPE;
  target_account public.brokerage_accounts%ROWTYPE;
  old_cash_amount numeric := 0;
  available_balance numeric := 0;
  new_cash_amount numeric := 0;
  updated_trade public.trades%ROWTYPE;
BEGIN
  SELECT * INTO target_trade FROM public.trades WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF target_trade.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can edit only your own trades';
  END IF;
  IF p_symbol IS NULL OR btrim(p_symbol) = '' OR p_execution_date IS NULL
    OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_price_at_execution IS NULL OR p_price_at_execution <= 0 OR p_price_at_execution::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_amount_usd IS NULL OR p_amount_usd <= 0 OR p_amount_usd::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_original_amount IS NULL OR p_original_amount <= 0 OR p_original_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Symbol, quantity, price, and amount must be greater than zero';
  END IF;

  IF target_trade.brokerage_account_id IS NOT NULL AND target_trade.type IN ('BUY', 'SELL') THEN
    SELECT * INTO target_account FROM public.brokerage_accounts WHERE id = target_trade.brokerage_account_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Brokerage cash account not found'; END IF;
    new_cash_amount := GREATEST(0, COALESCE(p_original_amount, p_amount_usd));
    IF new_cash_amount <= 0 THEN RAISE EXCEPTION 'Settlement amount must be greater than zero'; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(target_trade.brokerage_account_id::text, 0));
    SELECT COALESCE(SUM(amount), 0) INTO old_cash_amount
    FROM public.brokerage_cash_entries WHERE trade_id = p_trade_id;

    IF target_trade.type = 'BUY' THEN
      SELECT COALESCE(SUM(CASE type
        WHEN 'DEPOSIT' THEN amount WHEN 'TRADE_SELL' THEN amount WHEN 'ADJUSTMENT' THEN amount
        WHEN 'WITHDRAW' THEN -amount WHEN 'TRADE_BUY' THEN -amount ELSE 0 END), 0)
      INTO available_balance
      FROM public.brokerage_cash_entries
      WHERE brokerage_account_id = target_trade.brokerage_account_id;
      IF new_cash_amount > available_balance + old_cash_amount + 0.000001 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Insufficient brokerage cash balance';
      END IF;
    END IF;

    PERFORM set_config('app.allow_brokerage_ledger_mutation', 'on', true);
    DELETE FROM public.brokerage_cash_entries WHERE trade_id = p_trade_id;
  END IF;

  UPDATE public.trades
  SET symbol = upper(btrim(p_symbol)),
      asset_name = upper(btrim(p_symbol)),
      execution_date = p_execution_date,
      quantity = p_quantity,
      price_at_execution = p_price_at_execution,
      amount_usd = p_amount_usd,
      original_amount = p_original_amount,
      total_cost = p_amount_usd,
      updated_at = now()
  WHERE id = p_trade_id
  RETURNING * INTO updated_trade;

  IF target_trade.brokerage_account_id IS NOT NULL AND target_trade.type IN ('BUY', 'SELL') THEN
    INSERT INTO public.brokerage_cash_entries (
      user_id, portfolio_id, brokerage_account_id, type, amount, currency, trade_id, occurred_at, note
    ) VALUES (
      updated_trade.user_id, updated_trade.portfolio_id, updated_trade.brokerage_account_id,
      CASE WHEN updated_trade.type = 'BUY' THEN 'TRADE_BUY' ELSE 'TRADE_SELL' END,
      new_cash_amount, updated_trade.currency, updated_trade.id, updated_trade.execution_date,
      CONCAT('Trade ', updated_trade.type, ' ', updated_trade.symbol)
    );
  END IF;

  IF target_trade.brokerage_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.brokerage_account_balances
    WHERE brokerage_account_id = target_trade.brokerage_account_id AND cash_balance < -0.000001
  ) THEN
    RAISE EXCEPTION 'Correction would make brokerage cash negative';
  END IF;

  RETURN updated_trade;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_brokerage_trade(uuid, text, timestamptz, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_brokerage_trade(uuid, text, timestamptz, numeric, numeric, numeric, numeric) TO authenticated;
