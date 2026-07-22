-- Migration 004: Fix Currency Conversion Drift & Floating Point Imprecision

ALTER TABLE public.cash_activities ADD COLUMN IF NOT EXISTS original_amount numeric(18, 4);
UPDATE public.cash_activities SET original_amount = ROUND((amount * COALESCE(rate_at_time, 1))::numeric, 2) WHERE original_amount IS NULL;
ALTER TABLE public.cash_activities ALTER COLUMN amount TYPE numeric(18, 4) USING amount::numeric;
ALTER TABLE public.cash_activities ALTER COLUMN original_amount TYPE numeric(18, 4) USING original_amount::numeric;

ALTER TABLE public.bucket_activities ADD COLUMN IF NOT EXISTS original_amount numeric(18, 4);
UPDATE public.bucket_activities SET original_amount = ROUND((amount * COALESCE(rate_at_time, 1))::numeric, 2) WHERE original_amount IS NULL;
ALTER TABLE public.bucket_activities ALTER COLUMN amount TYPE numeric(18, 4) USING amount::numeric;
ALTER TABLE public.bucket_activities ALTER COLUMN original_amount TYPE numeric(18, 4) USING original_amount::numeric;

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS original_amount numeric(18, 4);
UPDATE public.trades SET original_amount = ROUND((amount_usd * COALESCE(exchange_rate_at_time, 1))::numeric, 2) WHERE original_amount IS NULL;
ALTER TABLE public.trades ALTER COLUMN amount_usd TYPE numeric(18, 4) USING amount_usd::numeric;
ALTER TABLE public.trades ALTER COLUMN original_amount TYPE numeric(18, 4) USING original_amount::numeric;
ALTER TABLE public.trades ALTER COLUMN quantity TYPE numeric(18, 6) USING quantity::numeric;
ALTER TABLE public.trades ALTER COLUMN price_at_execution TYPE numeric(18, 4) USING price_at_execution::numeric;

ALTER TABLE public.assets ALTER COLUMN value_usd TYPE numeric(18, 4) USING value_usd::numeric;
ALTER TABLE public.assets ALTER COLUMN quantity TYPE numeric(18, 6) USING quantity::numeric;
ALTER TABLE public.assets ALTER COLUMN avg_purchase_price TYPE numeric(18, 4) USING avg_purchase_price::numeric;
ALTER TABLE public.assets ALTER COLUMN current_price TYPE numeric(18, 4) USING current_price::numeric;

ALTER TABLE public.money_buckets ALTER COLUMN target_amount TYPE numeric(18, 4) USING target_amount::numeric;
ALTER TABLE public.money_buckets ALTER COLUMN current_amount TYPE numeric(18, 4) USING current_amount::numeric;
