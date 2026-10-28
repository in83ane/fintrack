-- Dedicated synthetic-test observer/seeder. Never grant table ownership,
-- BYPASSRLS, private writer EXECUTE, or owner membership to the runner.
GRANT INSERT ON auth.users TO fintrack_tester;
GRANT USAGE ON SCHEMA bucket_private,plan_copy_guard TO fintrack_tester;
GRANT SELECT ON bucket_private.links,bucket_private.requests TO fintrack_tester;
CREATE POLICY local_fixture_observer ON bucket_private.links FOR SELECT TO fintrack_tester USING(true);
CREATE POLICY local_fixture_observer ON bucket_private.requests FOR SELECT TO fintrack_tester USING(true);
GRANT SELECT ON public.money_buckets,public.cash_activities,public.bucket_activities,public.plan_checks TO fintrack_tester;
CREATE POLICY local_fixture_observer ON public.money_buckets FOR SELECT TO fintrack_tester USING(true);
CREATE POLICY local_fixture_observer ON public.cash_activities FOR SELECT TO fintrack_tester USING(true);
CREATE POLICY local_fixture_observer ON public.bucket_activities FOR SELECT TO fintrack_tester USING(true);
CREATE POLICY local_fixture_observer ON public.plan_checks FOR SELECT TO fintrack_tester USING(true);
GRANT SELECT ON plan_copy_guard.identity,plan_copy_guard.bootstrap,plan_copy_guard.applied TO fintrack_tester;
REVOKE ALL ON SCHEMA plan_copy_guard FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA plan_copy_guard FROM PUBLIC,anon,authenticated;
-- Allow ACL checks without making marker rows writable/readable by client roles.
GRANT USAGE ON SCHEMA plan_copy_guard TO anon,authenticated;
