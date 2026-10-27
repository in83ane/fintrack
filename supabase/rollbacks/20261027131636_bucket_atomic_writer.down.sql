-- COPY/STAGING ONLY until the coordinated recovery is approved.
-- Never reopen the old concurrent writers after financial use. Freeze the app,
-- workers and sessions first. A failed migration transaction rolls back itself.
begin;
lock table public.money_buckets,public.cash_activities,public.bucket_activities,
 public.brokerage_cash_entries,public.plan_checks,public.plan_month_locks in access exclusive mode;
do $$begin
 if exists(select 1 from bucket_private.requests)
  or bucket_private.financial_fingerprint() is distinct from
   (select definition from bucket_private.rollback_snapshot where kind='fingerprint')
 then raise exception 'Unsafe bucket writer rollback: financial use detected. Keep writers closed; restore the complete pre-release backup or forward-fix.';end if;
end $$;
drop trigger atomic_cash_gate on public.cash_activities;
drop trigger atomic_bucket_activity_gate on public.bucket_activities;
drop trigger atomic_bucket_balance_gate on public.money_buckets;
drop trigger bucket_owner_plan_checks on public.plan_checks;
drop trigger bucket_owner_plans on public.daily_plans;
do $$declare r record;begin
 for r in select * from bucket_private.rollback_snapshot where kind='function' loop
  if r.definition is null then execute 'drop function '||r.name;else execute r.definition;execute 'revoke all on function '||r.name||' from public,anon,authenticated';end if;
 end loop;
 for r in select * from bucket_private.rollback_snapshot where kind in ('grant','function_grant') loop execute r.definition;end loop;
end $$;
drop function public.write_bucket_cash(uuid,jsonb);
drop function public.save_cash_bucket(uuid,uuid,jsonb,numeric);
drop function public.remove_empty_cash_bucket(uuid);
-- Private schema contains only this migration's implementation/recovery state.
drop schema bucket_private cascade;
-- Retain the harmless cash lookup index; do not remove a pre-existing index.
commit;
