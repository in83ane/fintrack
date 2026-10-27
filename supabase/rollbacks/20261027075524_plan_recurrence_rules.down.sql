-- Run only on the disposable copy first, after taking a fresh backup.
-- Deliberately refuse to erase new rule/pause history or coerce endless plans.
begin;
do $$ begin
 if exists(select 1 from public.daily_plans p where ends_on is null or frequency<>'daily'
   or cardinality(days_of_week)>0 or weekly_target<>3 or monthly_day<>1 or status='paused'
   or (has_money_history and not exists(select 1 from public.plan_checks c where c.plan_id=p.id and c.cash_id is not null)))
   or exists(select 1 from public.plan_rule_versions group by plan_id having count(*)>1)
   or exists(select 1 from public.plan_checks where confirm_extra) then
  raise exception 'Unsafe downgrade: keep the additive schema and restore the app/backup on a separate database; new PLAN history must not be discarded';
 end if;
end $$;
drop trigger aa_guard_plan_schedule on public.plan_checks;
drop trigger remember_plan_money on public.plan_checks;
drop trigger capture_plan_rule on public.daily_plans;
drop trigger validate_daily_plan_rule on public.daily_plans;
drop function public.remove_daily_plan(uuid);
drop function public.guard_plan_schedule();
drop function public.validate_daily_plan_rule();
drop function public.plan_rule_due(jsonb,date);
drop function plan_private.capture_rule_version();
drop function plan_private.remember_plan_money();
drop schema plan_private;
drop table public.plan_rule_versions;
drop policy plan_delete on public.daily_plans;
revoke insert,update,delete on public.daily_plans from authenticated;
revoke insert(name,amount,amount_period,bucket_id,starts_on,ends_on,frequency,days_of_week,weekly_target,monthly_day,status),
 update(name,amount,amount_period,bucket_id,starts_on,ends_on,frequency,days_of_week,weekly_target,monthly_day,status,archived) on public.daily_plans from authenticated;
alter table public.daily_plans drop column frequency,drop column days_of_week,drop column weekly_target,
 drop column monthly_day,drop column status,drop column currency,drop column has_money_history;
alter table public.daily_plans alter column ends_on set not null;
alter table public.plan_checks drop column confirm_extra;
grant insert(name,amount,amount_period,bucket_id,starts_on,ends_on),update(archived) on public.daily_plans to authenticated;
commit;
