-- Migration 005: Ensure cash activity writes match the app payload.
-- Safe to run more than once.

ALTER TABLE public.cash_activities
ADD COLUMN IF NOT EXISTS time text null,
ADD COLUMN IF NOT EXISTS bucket_id uuid null,
ADD COLUMN IF NOT EXISTS is_transfer boolean not null default false,
ADD COLUMN IF NOT EXISTS currency varchar(10) null,
ADD COLUMN IF NOT EXISTS rate_at_time numeric null,
ADD COLUMN IF NOT EXISTS original_amount numeric(18, 4) null;

ALTER TABLE public.cash_activities
ALTER COLUMN amount TYPE numeric(18, 4) USING amount::numeric;

ALTER TABLE public.cash_activities
DROP CONSTRAINT IF EXISTS cash_activities_type_check;

ALTER TABLE public.cash_activities
ADD CONSTRAINT cash_activities_type_check
CHECK (
  type = ANY (
    ARRAY[
      'INCOME'::text,
      'EXPENSE'::text,
      'DEPOSIT'::text,
      'WITHDRAW'::text
    ]
  )
);

CREATE INDEX IF NOT EXISTS idx_cash_activities_user_id
ON public.cash_activities USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_cash_activities_type
ON public.cash_activities USING btree (type);

CREATE INDEX IF NOT EXISTS idx_cash_activities_date
ON public.cash_activities USING btree (date);

CREATE INDEX IF NOT EXISTS idx_cash_activities_bucket_id
ON public.cash_activities USING btree (bucket_id);

CREATE INDEX IF NOT EXISTS idx_cash_activities_currency
ON public.cash_activities USING btree (currency);

