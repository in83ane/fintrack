CREATE TABLE public.expense_trackers (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  category text NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 160),
  keywords text[] NOT NULL DEFAULT '{}' CHECK (cardinality(keywords) <= 20 AND octet_length(keywords::text) <= 4096),
  opening_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0 AND opening_amount <> 'NaN'::numeric),
  currency text NOT NULL CHECK (currency IN ('THB','USD')),
  opening_fx numeric NOT NULL CHECK (opening_fx > 0 AND opening_fx < 'Infinity'::numeric),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expense_trackers_owner_idx ON public.expense_trackers(user_id,created_at,id);
ALTER TABLE public.expense_trackers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_trackers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.expense_trackers TO authenticated;
GRANT UPDATE(name,category,keywords,opening_amount,currency,opening_fx) ON public.expense_trackers TO authenticated;
CREATE POLICY owner_expense_trackers ON public.expense_trackers FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Choices reference existing ledger expenses. Deleting a tracker or a Ledger row cleans up only its links.
CREATE TABLE public.expense_tracker_choices (
  tracker_id uuid NOT NULL REFERENCES public.expense_trackers(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.cash_activities(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('include','skip')),
  PRIMARY KEY (tracker_id,activity_id)
);
CREATE INDEX expense_tracker_choices_activity_idx ON public.expense_tracker_choices(activity_id);
ALTER TABLE public.expense_tracker_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_tracker_choices FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT, DELETE ON public.expense_tracker_choices TO authenticated;
GRANT UPDATE(tracker_id,activity_id,decision) ON public.expense_tracker_choices TO authenticated;
CREATE POLICY owner_tracker_choices ON public.expense_tracker_choices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expense_trackers t WHERE t.id=tracker_id AND t.user_id=(SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expense_trackers t WHERE t.id=tracker_id AND t.user_id=(SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.cash_activities c WHERE c.id=activity_id AND c.user_id=(SELECT auth.uid()) AND c.type IN ('EXPENSE','WITHDRAW') AND NOT coalesce(c.is_transfer,false)));
