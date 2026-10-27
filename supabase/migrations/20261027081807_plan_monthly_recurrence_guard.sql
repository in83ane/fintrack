-- Temporary gate until phase 2 replaces the monthly allocator.
-- Validated immediately: if a development database has unsupported goals, fail
-- without rewriting those goals or their financial records.
alter table public.daily_plans add constraint plan_monthly_money_daily_only
 check (amount = 0 or amount_period <> 'month' or frequency = 'daily');
