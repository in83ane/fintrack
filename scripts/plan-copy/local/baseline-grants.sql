-- Local permission baseline for exercised paths, BEFORE PLAN/writer activation.
-- Not a reconstruction of the live Supabase grants/default privileges.
GRANT SELECT,INSERT ON public.portfolios TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.money_buckets,public.cash_activities,public.bucket_activities TO authenticated;
