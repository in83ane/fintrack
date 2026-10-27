-- Remove only when rolling back this guard on a copy, or deploying the verified
-- phase-2 allocator. Rolling it back alone re-enables unsupported combinations.
begin;
alter table public.daily_plans drop constraint plan_monthly_money_daily_only;
commit;
