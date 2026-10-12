-- Correct portfolio isolation and lifecycle handling for operational records.

-- Weighted-average cost must never aggregate the same symbol across portfolios.
CREATE OR REPLACE FUNCTION public.refresh_asset_position(
  target_user uuid,
  target_symbol text,
  target_portfolio uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_quantity numeric := 0;
  avg_price numeric := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('BUY', 'COVER', 'IMPORT') THEN quantity
      WHEN type IN ('SELL', 'SHORT') THEN -quantity
      ELSE 0
    END
  ), 0)
  INTO current_quantity
  FROM public.trades
  WHERE user_id = target_user
    AND symbol = target_symbol
    AND portfolio_id IS NOT DISTINCT FROM target_portfolio;

  SELECT COALESCE(
    SUM(amount_usd + COALESCE(fees, 0) + COALESCE(taxes, 0))
      / NULLIF(SUM(quantity), 0),
    0
  )
  INTO avg_price
  FROM public.trades
  WHERE user_id = target_user
    AND symbol = target_symbol
    AND portfolio_id IS NOT DISTINCT FROM target_portfolio
    AND type IN ('BUY', 'COVER', 'IMPORT');

  -- A filled trade is the source of truth.  Create its asset projection when
  -- one does not yet exist, so a browser refresh cannot make a real holding
  -- disappear merely because the client had not created a cache row first.
  IF current_quantity > 0 AND NOT EXISTS (
    SELECT 1 FROM public.assets
    WHERE user_id = target_user
      AND symbol = target_symbol
      AND portfolio_id IS NOT DISTINCT FROM target_portfolio
  ) THEN
    INSERT INTO public.assets (
      user_id, portfolio_id, name, symbol, asset_type, allocation,
      value_usd, quantity, avg_purchase_price, current_price, is_active
    ) VALUES (
      target_user, target_portfolio, target_symbol, target_symbol, 'stock', 'Equities',
      avg_price * current_quantity, current_quantity, avg_price, avg_price, true
    );
  END IF;

  UPDATE public.assets
  SET quantity = current_quantity,
      avg_purchase_price = avg_price,
      value_usd = COALESCE(current_price, avg_price) * current_quantity,
      is_active = current_quantity > 0,
      updated_at = now()
  WHERE user_id = target_user
    AND symbol = target_symbol
    AND portfolio_id IS NOT DISTINCT FROM target_portfolio;

END;
$$;

REVOKE ALL ON FUNCTION public.refresh_asset_position(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_asset_position(uuid, text, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_weighted_average_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.symbol IS DISTINCT FROM NEW.symbol
    OR OLD.portfolio_id IS DISTINCT FROM NEW.portfolio_id
  ) THEN
    PERFORM public.refresh_asset_position(OLD.user_id, OLD.symbol, OLD.portfolio_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_asset_position(OLD.user_id, OLD.symbol, OLD.portfolio_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_asset_position(NEW.user_id, NEW.symbol, NEW.portfolio_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_wac ON public.trades;
CREATE TRIGGER trigger_update_wac
  AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.update_weighted_average_cost();

-- Automatically-created cash records must remain in the same portfolio and
-- reflect the net cash movement, including execution costs.
CREATE OR REPLACE FUNCTION public.sync_trade_to_cashflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cash_amount numeric := GREATEST(
    COALESCE(NEW.amount_usd, 0) + CASE
      WHEN NEW.type IN ('BUY', 'COVER') THEN COALESCE(NEW.fees, 0) + COALESCE(NEW.taxes, 0)
      ELSE -COALESCE(NEW.fees, 0) - COALESCE(NEW.taxes, 0)
    END,
    0
  );
BEGIN
  IF NEW.type IN ('BUY', 'COVER') THEN
    INSERT INTO public.cash_activities (user_id, portfolio_id, category, amount, type, date, currency, rate_at_time, note)
    VALUES (NEW.user_id, NEW.portfolio_id, 'Trade Execution: ' || NEW.symbol, cash_amount, 'EXPENSE', NEW.execution_date, NEW.currency, NEW.exchange_rate_at_time, 'Generated from trade ' || NEW.id);
  ELSIF NEW.type IN ('SELL', 'SHORT') THEN
    INSERT INTO public.cash_activities (user_id, portfolio_id, category, amount, type, date, currency, rate_at_time, note)
    VALUES (NEW.user_id, NEW.portfolio_id, 'Trade Exit: ' || NEW.symbol, cash_amount, 'INCOME', NEW.execution_date, NEW.currency, NEW.exchange_rate_at_time, 'Generated from trade ' || NEW.id);
  ELSIF NEW.type = 'DIVIDEND' THEN
    INSERT INTO public.cash_activities (user_id, portfolio_id, category, amount, type, date, currency, rate_at_time, note)
    VALUES (NEW.user_id, NEW.portfolio_id, 'Dividend: ' || NEW.symbol, cash_amount, 'INCOME', NEW.execution_date, NEW.currency, NEW.exchange_rate_at_time, 'Generated from trade ' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Permit only the controlled per-user purge procedure to bypass the immutable
-- ledger guard. Normal client UPDATE/DELETE operations remain blocked.
CREATE OR REPLACE FUNCTION public.prevent_history_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('fintrack.allow_history_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'history_events is append-only; record a correction in the source ledger instead';
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_my_financial_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
BEGIN
  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  DELETE FROM public.bucket_activities WHERE user_id = target_user;
  DELETE FROM public.cash_activities WHERE user_id = target_user;
  DELETE FROM public.trades WHERE user_id = target_user;
  DELETE FROM public.assets WHERE user_id = target_user;
  DELETE FROM public.allocations WHERE user_id = target_user;
  DELETE FROM public.money_buckets WHERE user_id = target_user;
  DELETE FROM public.trade_journal WHERE user_id = target_user;
  DELETE FROM public.dca_drafts WHERE user_id = target_user;
  DELETE FROM public.user_categories WHERE user_id = target_user;
  DELETE FROM public.portfolio_snapshots WHERE user_id = target_user;

  PERFORM set_config('fintrack.allow_history_purge', 'on', true);
  DELETE FROM public.history_events WHERE user_id = target_user;
  DELETE FROM public.portfolios WHERE user_id = target_user;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_my_financial_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_my_financial_data() TO authenticated;
