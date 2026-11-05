-- Existing trackers remain expenses; kind is immutable to authenticated clients.
ALTER TABLE public.expense_trackers
  ADD COLUMN kind text NOT NULL DEFAULT 'EXPENSE'
  CONSTRAINT expense_trackers_kind_check CHECK (kind IN ('EXPENSE','INCOME'));

-- Keep owner isolation and require the linked Ledger row to have the same direction.
ALTER POLICY owner_tracker_choices ON public.expense_tracker_choices
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_trackers t
    JOIN public.cash_activities c ON c.id = activity_id
    WHERE t.id = tracker_id
      AND t.user_id = (SELECT auth.uid())
      AND c.user_id = (SELECT auth.uid())
      AND NOT coalesce(c.is_transfer,false)
      AND ((t.kind = 'EXPENSE' AND c.type IN ('EXPENSE','WITHDRAW'))
        OR (t.kind = 'INCOME' AND c.type IN ('INCOME','DEPOSIT')))
  )
);
COMMENT ON COLUMN public.expense_trackers.kind IS 'Ledger direction. Historical rows default to EXPENSE; cannot change kind after creation.';
NOTIFY pgrst, 'reload schema';
