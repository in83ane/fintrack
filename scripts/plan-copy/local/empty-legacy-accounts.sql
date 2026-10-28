-- LOCAL SYNTHETIC BOOTSTRAP ONLY, explicitly approved for a fresh empty database.
-- Migration 017_name_legacy_default_cash_accounts.sql is corrupt: a single "3".
-- Original raw SHA256: 4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce
-- Its original SQL is unavailable. This does not reconstruct the migration or
-- certify its behavior. There must be no legacy accounts to rename here.
DO $empty_legacy_accounts$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users)
    OR EXISTS (SELECT 1 FROM public.portfolios)
    OR EXISTS (SELECT 1 FROM public.brokerage_accounts)
    OR EXISTS (SELECT 1 FROM public.brokerage_cash_entries)
  THEN
    RAISE EXCEPTION 'LOCAL_017_REQUIRES_EMPTY_LEGACY_TABLES';
  END IF;
END;
$empty_legacy_accounts$;
