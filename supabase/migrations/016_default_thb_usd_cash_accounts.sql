-- Every investment broker needs the same two cash wallets.  This backfills
-- portfolios created before the UI started adding both accounts by default.

INSERT INTO public.brokerage_accounts (
  user_id,
  portfolio_id,
  name,
  broker,
  currency,
  color,
  kind
)
SELECT
  portfolio.user_id,
  portfolio.id,
  defaults.name,
  NULL,
  defaults.currency,
  defaults.color,
  'cash'
FROM public.portfolios AS portfolio
CROSS JOIN (
  VALUES
    ('เงินสด THB', 'THB', '#4EDEA3'),
    ('เงินสด USD', 'USD', '#8B6CFF')
) AS defaults(name, currency, color)
WHERE portfolio.kind = 'trading'
  AND NOT EXISTS (
    SELECT 1
    FROM public.brokerage_accounts AS account
    WHERE account.portfolio_id = portfolio.id
      AND account.kind = 'cash'
      AND account.currency = defaults.currency
  );
