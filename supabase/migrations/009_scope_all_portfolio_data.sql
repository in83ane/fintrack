-- Scope the remaining account data to a portfolio.  Existing records are
-- retained in the account's default/Main portfolio.

ALTER TABLE IF EXISTS public.allocations ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.money_buckets ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.bucket_activities ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.cash_activities ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.user_categories ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE;

-- Migration 008 only had investment tables as a source. Accounts that used
-- Cash Flow or Buckets first therefore also need a Main portfolio before the
-- records below can be assigned safely.
INSERT INTO public.portfolios (user_id, name, is_default)
SELECT DISTINCT source.user_id, 'Main Portfolio', true
FROM (
  SELECT user_id FROM public.allocations
  UNION
  SELECT user_id FROM public.money_buckets
  UNION
  SELECT user_id FROM public.bucket_activities
  UNION
  SELECT user_id FROM public.cash_activities
  UNION
  SELECT user_id FROM public.user_categories
) AS source
ON CONFLICT (user_id) WHERE is_default DO NOTHING;

UPDATE public.allocations AS record SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE record.user_id = portfolio.user_id AND portfolio.is_default AND record.portfolio_id IS NULL;

UPDATE public.money_buckets AS record SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE record.user_id = portfolio.user_id AND portfolio.is_default AND record.portfolio_id IS NULL;

UPDATE public.bucket_activities AS record SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE record.user_id = portfolio.user_id AND portfolio.is_default AND record.portfolio_id IS NULL;

UPDATE public.cash_activities AS record SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE record.user_id = portfolio.user_id AND portfolio.is_default AND record.portfolio_id IS NULL;

UPDATE public.user_categories AS record SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE record.user_id = portfolio.user_id AND portfolio.is_default AND record.portfolio_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_user_portfolio ON public.allocations (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_money_buckets_user_portfolio ON public.money_buckets (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_bucket_activities_user_portfolio ON public.bucket_activities (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_cash_activities_user_portfolio ON public.cash_activities (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_user_categories_user_portfolio ON public.user_categories (user_id, portfolio_id);

ALTER TABLE public.allocations DROP CONSTRAINT IF EXISTS allocations_user_id_label_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_allocations_user_portfolio_label
  ON public.allocations (user_id, portfolio_id, label);
