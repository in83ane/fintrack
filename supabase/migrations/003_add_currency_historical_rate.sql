-- Migration 003: Add historical currency tracking to cash_activities and bucket_activities
-- Run this in your Supabase SQL Editor

-- Add to cash_activities (records each transaction's original currency and exchange rate)
ALTER TABLE public.cash_activities ADD COLUMN IF NOT EXISTS currency varchar(10);
ALTER TABLE public.cash_activities ADD COLUMN IF NOT EXISTS rate_at_time numeric;

-- Add to bucket_activities (records each bucket transaction's original currency and exchange rate)
ALTER TABLE public.bucket_activities ADD COLUMN IF NOT EXISTS currency varchar(10);
ALTER TABLE public.bucket_activities ADD COLUMN IF NOT EXISTS rate_at_time numeric;

-- Optional: Add an index for faster analytics queries by currency/date
CREATE INDEX IF NOT EXISTS idx_cash_activities_currency ON public.cash_activities(currency);
CREATE INDEX IF NOT EXISTS idx_bucket_activities_currency ON public.bucket_activities(currency);
