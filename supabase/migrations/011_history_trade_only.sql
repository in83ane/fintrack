-- Run this only if the earlier version of 010_history_ledger.sql was already
-- applied and it captured cash/bucket events. It converts the ledger to
-- trade-only while preserving the append-only protection for future writes.

DROP TRIGGER IF EXISTS append_cash_history ON public.cash_activities;
DROP TRIGGER IF EXISTS append_bucket_history ON public.bucket_activities;
DROP FUNCTION IF EXISTS public.append_cash_history_event();
DROP FUNCTION IF EXISTS public.append_bucket_history_event();

-- Migration maintenance is the sole exception to immutability: remove rows
-- that are outside the corrected product scope before restoring the guard.
DROP TRIGGER IF EXISTS prevent_history_event_update ON public.history_events;
DELETE FROM public.history_events
WHERE source_table IN ('cash_activities', 'bucket_activities');

ALTER TABLE public.history_events
  DROP CONSTRAINT IF EXISTS history_events_source_table_check;
ALTER TABLE public.history_events
  ADD CONSTRAINT history_events_source_table_check CHECK (source_table = 'trades');

CREATE TRIGGER prevent_history_event_update
  BEFORE UPDATE OR DELETE ON public.history_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_history_event_mutation();
