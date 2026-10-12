-- A trading portfolio has exactly one operational THB wallet and one USD
-- wallet. Remove only legacy duplicate wallets which have never had a ledger
-- entry; accounts with history are intentionally retained for audit safety.

DELETE FROM public.brokerage_accounts AS duplicate
USING public.brokerage_accounts AS standard
WHERE duplicate.portfolio_id = standard.portfolio_id
  AND duplicate.id <> standard.id
  AND duplicate.kind = 'cash'
  AND standard.kind = 'cash'
  AND duplicate.currency = standard.currency
  AND duplicate.currency IN ('THB', 'USD')
  AND standard.name = concat('เงินสด ', standard.currency)
  AND duplicate.name <> concat('เงินสด ', duplicate.currency)
  AND NOT EXISTS (
    SELECT 1
    FROM public.brokerage_cash_entries AS entry
    WHERE entry.brokerage_account_id = duplicate.id
  );
