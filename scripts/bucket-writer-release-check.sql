-- READ ONLY. Run against the intended release target before app promotion.
-- Catalog/history only: no financial rows, credentials, RPC invocation or DDL.
-- A passing result is necessary, not a substitute for the copy/release gates.
with required_migrations(version) as (values
 ('20261027075524'),('20261027081807'),('20261027084140'),('20261027131636')
), required_functions(signature) as (values
 ('public.write_bucket_cash(uuid,jsonb)'),
 ('public.save_cash_bucket(uuid,uuid,jsonb,numeric)'),
 ('public.remove_empty_cash_bucket(uuid)')
), checks as (
 select 'migration:'||r.version as check_name,
  exists(select 1 from supabase_migrations.schema_migrations m where m.version=r.version) as passed
 from required_migrations r
 union all
 select 'function:'||signature,to_regprocedure(signature) is not null from required_functions
 union all
 select 'authenticated_execute:'||signature,
  coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),false)
 from required_functions
 union all
 select 'anon_execute_revoked:'||signature,
  coalesce(not has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),false)
 from required_functions
 union all
 select 'private_schema:'||name,to_regnamespace(name) is not null
 from (values('bucket_private'),('plan_private')) s(name)
 union all
 select 'trigger:'||name,exists(
  select 1 from pg_trigger t where t.tgrelid=to_regclass(table_name)
   and t.tgname=name and not t.tgisinternal and t.tgenabled in ('O','A')
 ) from (values
  ('public.cash_activities','atomic_cash_gate'),
  ('public.bucket_activities','atomic_bucket_activity_gate'),
  ('public.money_buckets','atomic_bucket_balance_gate')
 ) g(table_name,name)
)
select bool_and(passed) as catalog_ready,
 jsonb_agg(jsonb_build_object('check',check_name,'passed',passed) order by check_name) as checks
from checks;
