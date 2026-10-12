-- Separate personal cash/bank buckets from investable trading portfolios.
-- `money_buckets` remain for cash management.  A trading portfolio owns one
-- or more brokerage accounts, whose cash movements are an append-only ledger.

ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'trading';

ALTER TABLE public.portfolios
  DROP CONSTRAINT IF EXISTS portfolios_kind_check;

ALTER TABLE public.portfolios
  ADD CONSTRAINT portfolios_kind_check
  CHECK (kind IN ('trading', 'cash_management'));

-- Preserve existing investment portfolios.  The legacy portfolio explicitly
-- named Bucket is the cash/bank workspace and must not accept trades or DCA.
UPDATE public.portfolios
SET kind = 'cash_management'
WHERE lower(trim(name)) = 'bucket';

CREATE TABLE IF NOT EXISTS public.brokerage_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  broker text,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'THB', 'JPY', 'EUR')),
  color text NOT NULL DEFAULT '#ADC6FF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brokerage_accounts_user_portfolio
  ON public.brokerage_accounts (user_id, portfolio_id, created_at);

ALTER TABLE public.brokerage_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own brokerage accounts" ON public.brokerage_accounts;
CREATE POLICY "Users can manage own brokerage accounts"
  ON public.brokerage_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.brokerage_cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  brokerage_account_id uuid NOT NULL REFERENCES public.brokerage_accounts(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAW', 'TRADE_BUY', 'TRADE_SELL', 'ADJUSTMENT')),
  amount numeric(20, 6) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency IN ('USD', 'THB', 'JPY', 'EUR')),
  trade_id uuid REFERENCES public.trades(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brokerage_cash_entries_account_time
  ON public.brokerage_cash_entries (brokerage_account_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_cash_entries_one_trade_effect
  ON public.brokerage_cash_entries (trade_id) WHERE trade_id IS NOT NULL;

ALTER TABLE public.brokerage_cash_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own brokerage cash ledger" ON public.brokerage_cash_entries;
CREATE POLICY "Users can read own brokerage cash ledger"
  ON public.brokerage_cash_entries FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own brokerage cash ledger" ON public.brokerage_cash_entries;
CREATE POLICY "Users can insert own brokerage cash ledger"
  ON public.brokerage_cash_entries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND trade_id IS NULL
    AND type IN ('DEPOSIT', 'WITHDRAW', 'ADJUSTMENT')
  );

CREATE OR REPLACE FUNCTION public.validate_brokerage_cash_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_portfolio_id uuid;
  account_user_id uuid;
BEGIN
  SELECT portfolio_id, user_id
    INTO account_portfolio_id, account_user_id
    FROM public.brokerage_accounts
    WHERE id = NEW.brokerage_account_id;
  IF account_portfolio_id IS NULL
    OR account_portfolio_id IS DISTINCT FROM NEW.portfolio_id
    OR account_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Brokerage cash entry must belong to the same user and portfolio as its account';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_brokerage_cash_entry ON public.brokerage_cash_entries;
CREATE TRIGGER validate_brokerage_cash_entry
  BEFORE INSERT ON public.brokerage_cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_brokerage_cash_entry();

CREATE OR REPLACE FUNCTION public.prevent_brokerage_cash_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'brokerage_cash_entries is append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_brokerage_cash_entry_update ON public.brokerage_cash_entries;
CREATE TRIGGER prevent_brokerage_cash_entry_update
  BEFORE UPDATE OR DELETE ON public.brokerage_cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_brokerage_cash_entry_mutation();

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS brokerage_account_id uuid REFERENCES public.brokerage_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_trades_brokerage_account
  ON public.trades (brokerage_account_id, execution_date DESC);

-- Migration 012 represented every trade as a cash-flow event.  Brokerage cash
-- is a distinct ledger now, so do not mirror trades into the personal cash
-- flow or bank-bucket domain.
DROP TRIGGER IF EXISTS trigger_auto_cashflow ON public.trades;

CREATE OR REPLACE FUNCTION public.validate_trade_portfolio_and_record_cash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_kind text;
  account_portfolio_id uuid;
  account_user_id uuid;
  account_currency text;
  cash_amount numeric(20, 6);
  available_balance numeric(20, 6);
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.brokerage_account_id IS DISTINCT FROM NEW.brokerage_account_id THEN
    RAISE EXCEPTION 'A posted trade cannot be moved between brokerage accounts; post a correcting trade instead';
  END IF;

  -- Legacy rows without a portfolio remain readable.  Every new scoped trade
  -- must belong to a trading portfolio.
  IF NEW.portfolio_id IS NOT NULL THEN
    SELECT kind INTO target_kind FROM public.portfolios WHERE id = NEW.portfolio_id;
    IF target_kind IS DISTINCT FROM 'trading' THEN
      RAISE EXCEPTION 'Trades are allowed only in trading portfolios';
    END IF;
  END IF;

  IF NEW.brokerage_account_id IS NOT NULL THEN
    SELECT portfolio_id, user_id, currency
      INTO account_portfolio_id, account_user_id, account_currency
      FROM public.brokerage_accounts
      WHERE id = NEW.brokerage_account_id;
    IF account_portfolio_id IS NULL
      OR account_portfolio_id IS DISTINCT FROM NEW.portfolio_id
      OR account_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Brokerage account must belong to the same user and portfolio as the trade';
    END IF;
    IF NEW.type IN ('BUY', 'SELL') AND COALESCE(NEW.currency, 'USD') IS DISTINCT FROM account_currency THEN
      RAISE EXCEPTION 'Trade currency must match the selected brokerage cash account';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.brokerage_account_id IS NOT NULL
     AND NEW.type IN ('BUY', 'SELL') THEN
    cash_amount := GREATEST(0, COALESCE(NEW.original_amount, NEW.amount_usd));
    IF cash_amount <= 0 THEN
      RAISE EXCEPTION 'Trade settlement amount must be greater than zero';
    END IF;

    -- Lock by account before calculating available cash.  This prevents two
    -- concurrent BUY requests from spending the same balance.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.brokerage_account_id::text, 0));
    IF NEW.type = 'BUY' THEN
      SELECT COALESCE(SUM(
        CASE type
          WHEN 'DEPOSIT' THEN amount
          WHEN 'TRADE_SELL' THEN amount
          WHEN 'ADJUSTMENT' THEN amount
          WHEN 'WITHDRAW' THEN -amount
          WHEN 'TRADE_BUY' THEN -amount
          ELSE 0
        END
      ), 0)
      INTO available_balance
      FROM public.brokerage_cash_entries
      WHERE brokerage_account_id = NEW.brokerage_account_id;

      IF cash_amount > available_balance + 0.000001 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Insufficient brokerage cash balance',
          DETAIL = format('Requested %s %s, available %s %s', cash_amount, account_currency, available_balance, account_currency);
      END IF;
    END IF;
    INSERT INTO public.brokerage_cash_entries (
      user_id, portfolio_id, brokerage_account_id, type, amount, currency, trade_id, occurred_at, note
    ) VALUES (
      NEW.user_id,
      NEW.portfolio_id,
      NEW.brokerage_account_id,
      CASE WHEN NEW.type = 'BUY' THEN 'TRADE_BUY' ELSE 'TRADE_SELL' END,
      cash_amount,
      COALESCE(NEW.currency, 'USD'),
      NEW.id,
      COALESCE(NEW.execution_date, now()),
      CONCAT('Trade ', NEW.type, ' ', NEW.symbol)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_trade_portfolio_and_record_cash() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_trade_portfolio_and_record_cash() FROM anon, authenticated;

DROP TRIGGER IF EXISTS validate_trade_portfolio_and_record_cash ON public.trades;
CREATE TRIGGER validate_trade_portfolio_and_record_cash
  BEFORE INSERT OR UPDATE OF portfolio_id, brokerage_account_id ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.validate_trade_portfolio_and_record_cash();

-- A derived balance is safer than a mutable cash column.
CREATE OR REPLACE VIEW public.brokerage_account_balances
WITH (security_invoker = true)
AS
SELECT
  account.id AS brokerage_account_id,
  account.user_id,
  account.portfolio_id,
  account.currency,
  COALESCE(SUM(
    CASE entry.type
      WHEN 'DEPOSIT' THEN entry.amount
      WHEN 'TRADE_SELL' THEN entry.amount
      WHEN 'ADJUSTMENT' THEN entry.amount
      WHEN 'WITHDRAW' THEN -entry.amount
      WHEN 'TRADE_BUY' THEN -entry.amount
      ELSE 0
    END
  ), 0) AS cash_balance
FROM public.brokerage_accounts account
LEFT JOIN public.brokerage_cash_entries entry ON entry.brokerage_account_id = account.id
GROUP BY account.id, account.user_id, account.portfolio_id, account.currency;
