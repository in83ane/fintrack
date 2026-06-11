-- Migration 002: Professional Trading & Investment Logic Fixes

-- 0. Add missing table and update constraints
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id uuid not null default extensions.uuid_generate_v4(),
  user_id uuid not null,
  total_value numeric(15, 2) not null default 0,
  date date not null,
  created_at timestamp with time zone null default now(),
  constraint portfolio_snapshots_pkey primary key (id),
  constraint portfolio_snapshots_user_id_date_key unique (user_id, date),
  constraint portfolio_snapshots_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_type_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_type_check check (
  type = any (array['BUY'::text, 'SELL'::text, 'DIVIDEND'::text, 'SHORT'::text, 'COVER'::text, 'IMPORT'::text])
);

-- 1. Function to recalculate Weighted Average Cost (WAC) automatically
CREATE OR REPLACE FUNCTION update_weighted_average_cost()
RETURNS TRIGGER AS $$
DECLARE
    current_quantity NUMERIC := 0;
    avg_price NUMERIC := 0;
    asset_current_price NUMERIC;
BEGIN
    -- 1. Calculate net quantity
    SELECT COALESCE(SUM(CASE WHEN type IN ('BUY', 'COVER', 'IMPORT') THEN quantity ELSE -quantity END), 0) INTO current_quantity
    FROM trades 
    WHERE symbol = NEW.symbol AND user_id = NEW.user_id;

    -- 2. Basic average price for DB visual fallback
    SELECT COALESCE(SUM(amount_usd) / NULLIF(SUM(quantity), 0), 0) INTO avg_price
    FROM trades
    WHERE symbol = NEW.symbol AND user_id = NEW.user_id AND type IN ('BUY', 'COVER', 'IMPORT');

    -- 3. Fetch current market price if available
    SELECT current_price INTO asset_current_price
    FROM assets
    WHERE symbol = NEW.symbol AND user_id = NEW.user_id;

    -- 4. Update asset with new quantities and fallbacks
    UPDATE assets 
    SET quantity = current_quantity,
        avg_purchase_price = avg_price,
        value_usd = CASE WHEN asset_current_price IS NOT NULL THEN asset_current_price * current_quantity ELSE current_quantity * avg_price END,
        updated_at = NOW()
    WHERE symbol = NEW.symbol AND user_id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wac ON trades;
CREATE TRIGGER trigger_update_wac
AFTER INSERT OR UPDATE ON trades
FOR EACH ROW
EXECUTE FUNCTION update_weighted_average_cost();

-- 2. Function for Auto-Cashflow syncing from Trades
CREATE OR REPLACE FUNCTION sync_trade_to_cashflow()
RETURNS TRIGGER AS $$
BEGIN
    -- Deduct cash on BUY or COVER
    IF NEW.type IN ('BUY', 'COVER') THEN
        INSERT INTO cash_activities (user_id, category, amount, type, date)
        VALUES (NEW.user_id, 'Trade Execution: ' || NEW.symbol, NEW.amount_usd, 'EXPENSE', NEW.execution_date);
    -- Add cash on SELL or SHORT
    ELSIF NEW.type IN ('SELL', 'SHORT') THEN
        INSERT INTO cash_activities (user_id, category, amount, type, date)
        VALUES (NEW.user_id, 'Trade Exit: ' || NEW.symbol, NEW.amount_usd, 'INCOME', NEW.execution_date);
    ELSIF NEW.type = 'DIVIDEND' THEN
        INSERT INTO cash_activities (user_id, category, amount, type, date)
        VALUES (NEW.user_id, 'Dividend: ' || NEW.symbol, NEW.amount_usd, 'INCOME', NEW.execution_date);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_cashflow ON trades;
CREATE TRIGGER trigger_auto_cashflow
AFTER INSERT ON trades
FOR EACH ROW
EXECUTE FUNCTION sync_trade_to_cashflow();

-- 3. Daily Portfolio Snapshots
CREATE OR REPLACE FUNCTION generate_daily_portfolio_snapshot()
RETURNS VOID AS $$
BEGIN
    INSERT INTO portfolio_snapshots (user_id, total_value, date)
    SELECT user_id, COALESCE(SUM(value_usd), 0), CURRENT_DATE
    FROM assets
    GROUP BY user_id
    ON CONFLICT (user_id, date) DO UPDATE 
    SET total_value = EXCLUDED.total_value;
END;
$$ LANGUAGE plpgsql;
