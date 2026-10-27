-- Phase-2 safe downgrade. This never reverses customer transactions implicitly.
-- Apply only to a disposable copy first. Reverse the phase-2 app at the same time.
begin;
do $$ begin
 if exists(select 1 from public.plan_checks where amount_minor is not null)
 or exists(select 1 from public.plan_month_locks)
 or exists(select 1 from public.plan_system_buckets)
 or exists(select 1 from public.daily_plans where money_mode<>'expense' or monthly_method<>'split' or (amount>0 and amount_period='month' and frequency<>'daily')) then
  raise exception 'Unsafe phase-2 downgrade: preserve financial snapshots/locks and restore a backup to a separate copy instead';
 end if;
end $$;
drop trigger check_daily_plan on public.plan_checks;
drop trigger uncheck_daily_plan on public.plan_checks;
create trigger aa_guard_plan_schedule before insert on public.plan_checks for each row execute function public.guard_plan_schedule();
create trigger check_daily_plan before insert on public.plan_checks for each row execute function public.check_daily_plan();
create trigger uncheck_daily_plan after delete on public.plan_checks for each row execute function public.uncheck_daily_plan();
drop trigger protect_plan_bucket_activity on public.bucket_activities;
drop trigger protect_plan_bucket_identity on public.money_buckets;
drop function public.protect_plan_bucket_activity();
drop function public.protect_plan_bucket_identity();
create or replace function plan_private.capture_rule_version() returns trigger language plpgsql security definer set search_path='' as $$
declare effective date; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'has_money_history')=(to_jsonb(old)-'has_money_history') then return new; end if;
 effective:=case when tg_op='INSERT' then new.starts_on else (now() at time zone 'Asia/Bangkok')::date end;
 insert into public.plan_rule_versions(plan_id,user_id,effective_on,rule) values(new.id,new.user_id,effective,to_jsonb(new))
 on conflict(plan_id,effective_on) do update set rule=excluded.rule;
 return new;
end $$;
create or replace function public.protect_plan_expense() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.plan_checks where cash_id=old.id) then raise exception 'Manage this linked expense from PLAN'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
drop function plan_private.apply_money_check();
drop function plan_private.undo_money_check();
drop function plan_private.bucket_minor(uuid);
drop function plan_private.month_schedule(uuid,date);
drop function plan_private.today();
drop table public.plan_month_locks;
drop table public.plan_status_events;
drop table public.plan_system_buckets;
alter table public.plan_checks drop column amount_minor,drop column requested_minor,drop column money_mode,drop column credited,drop column month_key,drop column group_key,drop column destination_cash_id,drop column destination_activity_id,drop column source_bucket_id,drop column destination_bucket_id;
alter table public.daily_plans drop constraint plan_money_exact_cents,drop column money_mode,drop column monthly_method,drop column amount_minor;
alter table public.daily_plans add constraint plan_monthly_money_daily_only check(amount=0 or amount_period<>'month' or frequency='daily');
commit;
