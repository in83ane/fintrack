-- Atomic bank -> broker funding, with an execution-specific FX rate and fee.
-- Existing records are preserved. Apply after migrations 013-017.
BEGIN;

ALTER TABLE public.cash_activities
  ADD COLUMN IF NOT EXISTS brokerage_entry_id uuid REFERENCES public.brokerage_cash_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS funding_details jsonb;
ALTER TABLE public.bucket_activities
  ADD COLUMN IF NOT EXISTS brokerage_entry_id uuid REFERENCES public.brokerage_cash_entries(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.protect_funding_activity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.brokerage_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'A broker funding transfer cannot be changed on only one side';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_funding_cash_activity ON public.cash_activities;
CREATE TRIGGER protect_funding_cash_activity BEFORE UPDATE OR DELETE ON public.cash_activities
FOR EACH ROW EXECUTE FUNCTION public.protect_funding_activity();
DROP TRIGGER IF EXISTS protect_funding_bucket_activity ON public.bucket_activities;
CREATE TRIGGER protect_funding_bucket_activity BEFORE UPDATE OR DELETE ON public.bucket_activities
FOR EACH ROW EXECUTE FUNCTION public.protect_funding_activity();

CREATE OR REPLACE FUNCTION public.transfer_bucket_to_broker(
  p_transfer_id uuid, p_bucket_id uuid, p_account_id uuid,
  p_source_amount numeric, p_received_amount numeric, p_fee numeric, p_thb_per_usd numeric,
  p_legacy_thb_per_usd numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bucket public.money_buckets%ROWTYPE;
  v_account public.brokerage_accounts%ROWTYPE;
  v_cash public.cash_activities%ROWTYPE;
  v_activity public.bucket_activities%ROWTYPE;
  v_entry public.brokerage_cash_entries%ROWTYPE;
  v_portfolio_name text;
  v_balance numeric;
  v_brokerage_balance numeric;
  v_source_rate numeric;
  v_expected numeric;
  v_details jsonb;
  v_note text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_transfer_id IS NULL OR p_bucket_id IS NULL OR p_account_id IS NULL
    OR p_source_amount IS NULL OR p_received_amount IS NULL OR p_fee IS NULL OR p_thb_per_usd IS NULL OR p_legacy_thb_per_usd IS NULL
    OR p_source_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_received_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_fee::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_thb_per_usd::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_legacy_thb_per_usd::text IN ('NaN', 'Infinity', '-Infinity') OR p_legacy_thb_per_usd <= 0
    OR p_source_amount <= 0 OR p_received_amount <= 0 OR p_fee < 0 OR p_fee >= p_source_amount OR p_thb_per_usd <= 0
    OR p_source_amount <> round(p_source_amount, 2) OR p_received_amount <> round(p_received_amount, 2) OR p_fee <> round(p_fee, 2)
  THEN RAISE EXCEPTION 'Invalid funding amounts or exchange rate'; END IF;

  -- Serialise transfers using the same bank balance, including duplicate retries.
  SELECT * INTO v_bucket FROM public.money_buckets
    WHERE id = p_bucket_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.portfolios WHERE id = v_bucket.portfolio_id AND user_id = v_user AND kind = 'cash_management'
  ) THEN RAISE EXCEPTION 'Invalid source Bucket'; END IF;
  SELECT * INTO v_account FROM public.brokerage_accounts
    WHERE id = p_account_id AND user_id = v_user AND kind = 'cash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid destination cash account'; END IF;
  SELECT name INTO v_portfolio_name FROM public.portfolios
    WHERE id = v_account.portfolio_id AND user_id = v_user AND kind = 'trading';
  IF NOT FOUND OR v_bucket.currency NOT IN ('THB', 'USD') OR v_bucket.currency IS NULL
    OR v_account.currency NOT IN ('THB', 'USD')
  THEN RAISE EXCEPTION 'Unsupported funding accounts'; END IF;

  v_source_rate := CASE WHEN v_bucket.currency = 'USD' THEN 1 ELSE p_thb_per_usd END;
  v_expected := CASE
    WHEN v_bucket.currency = v_account.currency THEN p_source_amount - p_fee
    WHEN v_bucket.currency = 'THB' THEN (p_source_amount - p_fee) / p_thb_per_usd
    ELSE (p_source_amount - p_fee) * p_thb_per_usd END;
  IF abs(round(v_expected, 2) - p_received_amount) > 0.01 THEN
    RAISE EXCEPTION 'Received amount does not match the exchange rate and fee';
  END IF;
  v_details := jsonb_build_object('bucket_id', p_bucket_id, 'account_id', p_account_id,
    'source_currency', v_bucket.currency, 'destination_currency', v_account.currency,
    'source_amount', p_source_amount, 'received_amount', p_received_amount,
    'fee', p_fee, 'thb_per_usd', p_thb_per_usd);

  SELECT * INTO v_cash FROM public.cash_activities WHERE id = p_transfer_id AND user_id = v_user;
  IF FOUND THEN
    IF v_cash.funding_details IS DISTINCT FROM v_details OR v_cash.brokerage_entry_id IS DISTINCT FROM p_transfer_id THEN
      RAISE EXCEPTION 'Transfer ID already used with different amounts';
    END IF;
    SELECT * INTO STRICT v_entry FROM public.brokerage_cash_entries WHERE id = p_transfer_id AND user_id = v_user;
    SELECT * INTO STRICT v_activity FROM public.bucket_activities WHERE id = p_transfer_id AND user_id = v_user;
  ELSE
    -- Match the existing bank ledger, prioritising its original denomination.
    -- Legacy rows in another denomination still use the app's reference rate;
    -- editing this transfer's execution rate must never revalue the source balance.
    SELECT COALESCE(SUM(
      CASE WHEN type IN ('INCOME', 'DEPOSIT') THEN 1 ELSE -1 END *
      CASE WHEN currency = v_bucket.currency AND original_amount IS NOT NULL THEN original_amount
        ELSE amount * CASE WHEN v_bucket.currency = 'USD' THEN 1 ELSE p_legacy_thb_per_usd END END
    ), 0) INTO v_balance FROM public.cash_activities WHERE user_id = v_user AND bucket_id = p_bucket_id;
    IF round(v_balance, 2) < p_source_amount THEN RAISE EXCEPTION 'Insufficient Bucket balance'; END IF;

    v_note := format('Bucket %s → %s · %s | หัก %s %s · รับ %s %s · ค่าธรรมเนียม %s %s',
      v_bucket.name, v_portfolio_name, v_account.name, p_source_amount, v_bucket.currency,
      p_received_amount, v_account.currency, p_fee, v_bucket.currency);
    IF v_bucket.currency <> v_account.currency THEN
      v_note := v_note || format(' · 1 USD = %s THB', p_thb_per_usd);
    END IF;
    v_note := v_note || format(' [funding:%s]', p_transfer_id);
    INSERT INTO public.brokerage_cash_entries (id, user_id, portfolio_id, brokerage_account_id, type, amount, currency, note)
      VALUES (p_transfer_id, v_user, v_account.portfolio_id, p_account_id, 'DEPOSIT', p_received_amount, v_account.currency, v_note)
      RETURNING * INTO v_entry;
    INSERT INTO public.cash_activities (id, user_id, portfolio_id, type, amount, category, date, bucket_id,
      is_transfer, currency, rate_at_time, original_amount, note, brokerage_entry_id, funding_details)
      VALUES (p_transfer_id, v_user, v_bucket.portfolio_id, 'WITHDRAW', p_source_amount / v_source_rate,
        'โอนไป ' || v_portfolio_name, now(), p_bucket_id, true, v_bucket.currency, v_source_rate, p_source_amount,
        v_note, p_transfer_id, v_details) RETURNING * INTO v_cash;
    INSERT INTO public.bucket_activities (id, user_id, portfolio_id, bucket_id, type, amount, date,
      currency, rate_at_time, original_amount, note, brokerage_entry_id)
      VALUES (p_transfer_id, v_user, v_bucket.portfolio_id, p_bucket_id, 'withdraw', p_source_amount, now(),
        v_bucket.currency, v_source_rate, p_source_amount, v_note, p_transfer_id) RETURNING * INTO v_activity;
  END IF;
  SELECT cash_balance INTO v_brokerage_balance FROM public.brokerage_account_balances WHERE brokerage_account_id = p_account_id;
  RETURN jsonb_build_object('cash_activity', to_jsonb(v_cash), 'bucket_activity', to_jsonb(v_activity),
    'brokerage_entry', to_jsonb(v_entry), 'brokerage_balance', v_brokerage_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_bucket_to_broker(uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_bucket_to_broker(uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric) TO authenticated;
COMMIT;
