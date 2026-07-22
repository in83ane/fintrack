-- Migration 006: Track the nominal currency for each money bucket/account.
-- Existing buckets were stored as USD-equivalent balances, so default them to USD.

ALTER TABLE public.money_buckets
ADD COLUMN IF NOT EXISTS currency varchar(10) not null default 'USD';

UPDATE public.money_buckets
SET currency = 'USD'
WHERE currency IS NULL;

CREATE INDEX IF NOT EXISTS idx_money_buckets_currency
ON public.money_buckets USING btree (currency);

