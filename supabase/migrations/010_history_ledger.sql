-- Immutable, normalized audit ledger for financial activity.
-- Source tables remain the operational projections; this table preserves an
-- append-only account of creates, corrections, and removals.

CREATE TABLE IF NOT EXISTS public.history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Deliberately not a foreign key: an audit row must retain its historical
  -- portfolio identifier even when an operational portfolio is removed.
  portfolio_id uuid NULL,
  source_table text NOT NULL CHECK (source_table = 'trades'),
  source_record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'DELETED')),
  transaction_type text NOT NULL,
  asset_symbol text NULL,
  quantity numeric(24, 8) NULL,
  price numeric(24, 8) NULL,
  gross_amount numeric(24, 8) NOT NULL DEFAULT 0,
  fees numeric(24, 8) NOT NULL DEFAULT 0,
  taxes numeric(24, 8) NOT NULL DEFAULT 0,
  net_amount numeric(24, 8) NOT NULL DEFAULT 0,
  currency text NULL,
  exchange_rate numeric(24, 8) NULL,
  realized_pnl numeric(24, 8) NULL,
  unrealized_pnl numeric(24, 8) NULL,
  category text NULL,
  related_bucket_id uuid NULL,
  note text NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_history_events_user_portfolio_occurred
  ON public.history_events (user_id, portfolio_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_history_events_user_occurred
  ON public.history_events (user_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_history_events_source
  ON public.history_events (source_table, source_record_id, recorded_at);

ALTER TABLE public.history_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own immutable history" ON public.history_events;
CREATE POLICY "Users can read own immutable history"
  ON public.history_events FOR SELECT USING (auth.uid() = user_id);

-- No client INSERT, UPDATE, or DELETE policy is intentionally created.
-- A database trigger is the only writer. The trigger makes accidental SQL
-- mutations fail too, including calls made by privileged application roles.
CREATE OR REPLACE FUNCTION public.prevent_history_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'history_events is append-only; record a correction in the source ledger instead';
END;
$$;

DROP TRIGGER IF EXISTS prevent_history_event_update ON public.history_events;
CREATE TRIGGER prevent_history_event_update
  BEFORE UPDATE OR DELETE ON public.history_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_history_event_mutation();

CREATE OR REPLACE FUNCTION public.append_trade_history_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  record_data public.trades%ROWTYPE;
  action_name text;
  signed_net numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    record_data := OLD;
  ELSE
    record_data := NEW;
  END IF;
  action_name := CASE TG_OP WHEN 'INSERT' THEN 'CREATED' WHEN 'UPDATE' THEN 'UPDATED' ELSE 'DELETED' END;
  signed_net := CASE
    WHEN record_data.type IN ('BUY', 'COVER', 'IMPORT') THEN -(COALESCE(record_data.amount_usd, 0) + COALESCE(record_data.fees, 0) + COALESCE(record_data.taxes, 0))
    ELSE COALESCE(record_data.amount_usd, 0) - COALESCE(record_data.fees, 0) - COALESCE(record_data.taxes, 0)
  END;

  INSERT INTO public.history_events (
    user_id, portfolio_id, source_table, source_record_id, action, transaction_type,
    asset_symbol, quantity, price, gross_amount, fees, taxes, net_amount,
    currency, exchange_rate, realized_pnl, category, note, occurred_at, metadata
  ) VALUES (
    record_data.user_id, record_data.portfolio_id, 'trades', record_data.id, action_name, record_data.type,
    record_data.symbol, record_data.quantity, record_data.price_at_execution, COALESCE(record_data.amount_usd, 0),
    COALESCE(record_data.fees, 0), COALESCE(record_data.taxes, 0), signed_net,
    record_data.currency, record_data.exchange_rate_at_time, record_data.profit_loss,
    'TRADE', record_data.notes, COALESCE(record_data.execution_date, now()),
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('previous', to_jsonb(OLD)) ELSE '{}'::jsonb END
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS append_trade_history ON public.trades;
CREATE TRIGGER append_trade_history
  AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.append_trade_history_event();
-- Establish an audit baseline for records created before this migration.
INSERT INTO public.history_events (
  user_id, portfolio_id, source_table, source_record_id, action, transaction_type,
  asset_symbol, quantity, price, gross_amount, fees, taxes, net_amount,
  currency, exchange_rate, realized_pnl, category, note, occurred_at, recorded_at
)
SELECT
  t.user_id, t.portfolio_id, 'trades', t.id, 'CREATED', t.type,
  t.symbol, t.quantity, t.price_at_execution, COALESCE(t.amount_usd, 0), COALESCE(t.fees, 0), COALESCE(t.taxes, 0),
  CASE WHEN t.type IN ('BUY', 'COVER', 'IMPORT') THEN -(COALESCE(t.amount_usd, 0) + COALESCE(t.fees, 0) + COALESCE(t.taxes, 0)) ELSE COALESCE(t.amount_usd, 0) - COALESCE(t.fees, 0) - COALESCE(t.taxes, 0) END,
  t.currency, t.exchange_rate_at_time, t.profit_loss, 'TRADE', t.notes, COALESCE(t.execution_date, now()), COALESCE(t.created_at, now())
FROM public.trades t
WHERE NOT EXISTS (SELECT 1 FROM public.history_events h WHERE h.source_table = 'trades' AND h.source_record_id = t.id);

