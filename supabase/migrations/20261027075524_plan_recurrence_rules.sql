-- Additive phase 1. Keep the existing IDs, checks and financial triggers intact.
alter table public.daily_plans alter column ends_on drop not null;
alter table public.daily_plans
 add column frequency text not null default 'daily' check(frequency in ('daily','weekdays','weekly_target','monthly')),
 add column days_of_week integer[] not null default '{}',
 add column weekly_target integer not null default 3 check(weekly_target between 1 and 7),
 add column monthly_day integer not null default 1 check(monthly_day between 1 and 31),
 add column status text not null default 'active' check(status in ('active','paused','archived')),
 add column currency text check(currency in ('THB','USD')),
 add column has_money_history boolean not null default false;
update public.daily_plans p set status=case when archived then 'archived' else 'active' end,
 currency=(select b.currency from public.money_buckets b where b.id=p.bucket_id),
 has_money_history=exists(select 1 from public.plan_checks c where c.plan_id=p.id and c.cash_id is not null);

-- Existing amount/amount_period are the compatibility names for amount_per_check /
-- monthly_target_amount and goal_mode. amount=0 means habit; positive means money.
create table public.plan_rule_versions (
 plan_id uuid not null references public.daily_plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 effective_on date not null, rule jsonb not null, created_at timestamptz not null default now(),
 primary key(plan_id,effective_on)
);
alter table public.plan_rule_versions enable row level security;
revoke all on public.plan_rule_versions from public,anon,authenticated;
grant select on public.plan_rule_versions to authenticated;
grant all on public.plan_rule_versions to service_role;
create policy plan_versions_owner on public.plan_rule_versions for select to authenticated using((select auth.uid())=user_id);
create index plan_versions_owner_idx on public.plan_rule_versions(user_id,plan_id);
-- Archive dates before this migration are unknown. Do not invent a historical pause.
insert into public.plan_rule_versions(plan_id,user_id,effective_on,rule)
 select id,user_id,starts_on,to_jsonb(p)||jsonb_build_object('status','active','archived',false) from public.daily_plans p;
insert into public.plan_rule_versions(plan_id,user_id,effective_on,rule)
 select id,user_id,(now() at time zone 'Asia/Bangkok')::date,to_jsonb(p) from public.daily_plans p where archived
 on conflict(plan_id,effective_on) do update set rule=excluded.rule;

create function public.plan_rule_due(rule jsonb, day date) returns boolean
 language sql immutable security invoker set search_path='' as $$
 select coalesce(
  rule->>'status'='active' and day>=(rule->>'starts_on')::date
  and (rule->>'ends_on' is null or day<=(rule->>'ends_on')::date)
  and case rule->>'frequency'
   when 'weekdays' then exists(select 1 from jsonb_array_elements_text(rule->'days_of_week') d where d::integer=extract(isodow from day)::integer)
   when 'monthly' then extract(day from day)::integer=least((rule->>'monthly_day')::integer,extract(day from (date_trunc('month',day)+interval '1 month - 1 day'))::integer)
   when 'daily' then true when 'weekly_target' then true else false end,false);
$$;
revoke all on function public.plan_rule_due(jsonb,date) from public,anon;
grant execute on function public.plan_rule_due(jsonb,date) to authenticated,service_role;

create function public.validate_daily_plan_rule() returns trigger language plpgsql security invoker set search_path='' as $$
declare bucket_currency text; begin
 if tg_op='DELETE' then
  if old.has_money_history or exists(select 1 from public.plan_checks where plan_id=old.id and cash_id is not null) then
   raise exception 'Archive this plan to preserve financial history';
  end if;
  return old;
 end if;
 if new.user_id is distinct from auth.uid() then raise exception 'Unauthorized'; end if;
 if new.days_of_week is null or exists(select 1 from unnest(new.days_of_week) d where d is null or d<1 or d>7)
  or cardinality(new.days_of_week)<>(select count(distinct d) from unnest(new.days_of_week) d)
  or (new.frequency='weekdays' and cardinality(new.days_of_week)=0) then raise exception 'Invalid weekdays'; end if;
 if tg_op='UPDATE' then
  -- Compatibility for old clients that only toggle archived.
  if new.status is distinct from old.status then new.archived:=new.status='archived';
  elsif new.archived is distinct from old.archived then new.status:=case when new.archived then 'archived' else 'active' end; end if;
  if new.starts_on is distinct from old.starts_on and exists(select 1 from public.plan_checks where plan_id=old.id) then raise exception 'Start date cannot change after check-ins'; end if;
 else
  if new.archived then new.status:='archived'; else new.archived:=new.status='archived'; end if;
 end if;
 if new.amount>0 then
  select currency into bucket_currency from public.money_buckets where id=new.bucket_id and user_id=auth.uid();
  if bucket_currency is null or bucket_currency not in ('THB','USD') then raise exception 'Choose a USD or THB bucket'; end if;
  new.currency:=bucket_currency;
 else new.currency:=null;new.bucket_id:=null; end if;
 return new;
end $$;
revoke all on function public.validate_daily_plan_rule() from public,anon,authenticated;
create trigger validate_daily_plan_rule before insert or update or delete on public.daily_plans for each row execute function public.validate_daily_plan_rule();

-- Only these internal audit triggers can write history. Clients cannot rewrite pause
-- dates or clear the ever-had-money flag. Definer functions live outside the API schema,
-- have an empty search_path, enforce ownership and have no client EXECUTE grants.
create schema if not exists plan_private;
revoke all on schema plan_private from public,anon,authenticated;
create function plan_private.capture_rule_version() returns trigger language plpgsql security definer set search_path='' as $$
declare effective date; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'has_money_history')=(to_jsonb(old)-'has_money_history') then return new; end if;
 effective:=case when tg_op='INSERT' then new.starts_on else (now() at time zone 'Asia/Bangkok')::date end;
 insert into public.plan_rule_versions(plan_id,user_id,effective_on,rule) values(new.id,new.user_id,effective,to_jsonb(new))
 on conflict(plan_id,effective_on) do update set rule=excluded.rule;
 return new;
end $$;
revoke all on function plan_private.capture_rule_version() from public,anon,authenticated;
create trigger capture_plan_rule after insert or update on public.daily_plans for each row execute function plan_private.capture_rule_version();

alter table public.plan_checks add column confirm_extra boolean not null default false;
grant insert(confirm_extra) on public.plan_checks to authenticated;
create function public.guard_plan_schedule() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.daily_plans; r jsonb; week_start date; checked integer; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 select * into p from public.daily_plans where id=new.plan_id and user_id=auth.uid() for update;
 if not found or p.status='archived' then raise exception 'Plan unavailable'; end if;
 select rule into r from public.plan_rule_versions where plan_id=p.id and effective_on<=new.day order by effective_on desc limit 1;
 r:=coalesce(r,to_jsonb(p));
 if not public.plan_rule_due(r,new.day) then raise exception 'Day is not scheduled or is paused'; end if;
 if p.amount>0 and r->>'frequency'='weekly_target' then
  week_start:=new.day-(extract(isodow from new.day)::integer-1);
  select count(*) into checked from public.plan_checks where plan_id=p.id and day between week_start and week_start+6;
  if checked>=(r->>'weekly_target')::integer and not new.confirm_extra then raise exception 'Confirm extra money check'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_plan_schedule() from public,anon,authenticated;
-- Alphabetic trigger order: validate eligibility before the existing financial trigger.
create trigger aa_guard_plan_schedule before insert on public.plan_checks for each row execute function public.guard_plan_schedule();

create function plan_private.remember_plan_money() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 if new.cash_id is not null then update public.daily_plans set has_money_history=true where id=new.plan_id and user_id=auth.uid() and not has_money_history; end if;
 return new;
end $$;
revoke all on function plan_private.remember_plan_money() from public,anon,authenticated;
create trigger remember_plan_money after insert on public.plan_checks for each row execute function plan_private.remember_plan_money();

grant insert(frequency,days_of_week,weekly_target,monthly_day,status),
 update(name,amount,amount_period,bucket_id,starts_on,ends_on,frequency,days_of_week,weekly_target,monthly_day,status),delete on public.daily_plans to authenticated;
create policy plan_delete on public.daily_plans for delete to authenticated using((select auth.uid())=user_id and not has_money_history);

create function public.remove_daily_plan(target_id uuid) returns text language plpgsql security invoker set search_path='' as $$
declare p public.daily_plans; begin
 select * into p from public.daily_plans where id=target_id and user_id=auth.uid() for update;
 if not found then raise exception 'Plan unavailable'; end if;
 if p.has_money_history or exists(select 1 from public.plan_checks where plan_id=p.id and cash_id is not null) then
  update public.daily_plans set status='archived' where id=p.id; return 'archived';
 end if;
 delete from public.plan_checks where plan_id=p.id;
 delete from public.daily_plans where id=p.id;
 return 'deleted';
end $$;
revoke all on function public.remove_daily_plan(uuid) from public,anon;
grant execute on function public.remove_daily_plan(uuid) to authenticated;
