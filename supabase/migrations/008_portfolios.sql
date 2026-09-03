-- A signed-in account can keep independent investment portfolios.  Cash Flow
-- and Money Buckets remain account-wide; holdings, trades and DCA drafts are
-- scoped to the selected portfolio.

CREATE TABLE IF NOT EXISTS public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  color text NOT NULL DEFAULT '#ADC6FF',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON public.portfolios (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_one_default_per_user
  ON public.portfolios (user_id) WHERE is_default;

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own portfolios" ON public.portfolios;
CREATE POLICY "Users can manage own portfolios"
  ON public.portfolios FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE IF EXISTS public.assets ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.trades ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.dca_drafts ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.trade_journal ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_user_portfolio ON public.assets (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trades_user_portfolio ON public.trades (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_dca_drafts_user_portfolio ON public.dca_drafts (user_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trade_journal_user_portfolio ON public.trade_journal (user_id, portfolio_id);

-- Existing investment data is moved to one Main portfolio per account.
INSERT INTO public.portfolios (user_id, name, is_default)
SELECT DISTINCT source.user_id, 'Main Portfolio', true
FROM (
  SELECT user_id FROM public.assets
  UNION
  SELECT user_id FROM public.trades
  UNION
  SELECT user_id FROM public.dca_drafts
  UNION
  SELECT user_id FROM public.trade_journal
) AS source
ON CONFLICT (user_id) WHERE is_default DO NOTHING;

UPDATE public.assets AS asset
SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE asset.user_id = portfolio.user_id
  AND portfolio.is_default
  AND asset.portfolio_id IS NULL;

UPDATE public.trades AS trade
SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE trade.user_id = portfolio.user_id
  AND portfolio.is_default
  AND trade.portfolio_id IS NULL;

UPDATE public.dca_drafts AS draft
SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE draft.user_id = portfolio.user_id
  AND portfolio.is_default
  AND draft.portfolio_id IS NULL;

UPDATE public.trade_journal AS journal
SET portfolio_id = portfolio.id
FROM public.portfolios AS portfolio
WHERE journal.user_id = portfolio.user_id
  AND portfolio.is_default
  AND journal.portfolio_id IS NULL;

ALTER TABLE public.dca_drafts DROP CONSTRAINT IF EXISTS dca_drafts_user_symbol_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dca_drafts_user_portfolio_symbol
  ON public.dca_drafts (user_id, portfolio_id, symbol);
