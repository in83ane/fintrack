-- Phase 2. Additive financial snapshots; no old cash rows are rewritten.
alter table public.daily_plans drop constraint plan_monthly_money_daily_only;
alter table public.daily_plans
 add column money_mode text not null default 'expense' check(money_mode in ('expense','saving')),
 add column monthly_method text not null default 'split' check(monthly_method in ('split','flexible')),
 add column amount_minor bigint generated always as ((amount*100)::bigint) stored;
-- Do not silently round legacy values. NOT VALID preserves legacy rows but enforces new writes.
alter table public.daily_plans add constraint plan_money_exact_cents check(amount=trunc(amount,2)) not valid;
grant insert(money_mode,monthly_method),update(money_mode,monthly_method) on public.daily_plans to authenticated;

alter table public.plan_checks
 add column amount_minor bigint,
 add column requested_minor bigint,
 add column money_mode text check(money_mode in ('expense','saving')),
 add column credited boolean not null default true,
 add column month_key date,
 add column group_key text,
 add column destination_cash_id uuid unique references public.cash_activities(id) on delete restrict,
 add column destination_activity_id uuid unique references public.bucket_activities(id) on delete restrict,
 add column source_bucket_id uuid references public.money_buckets(id) on delete restrict,
 add column destination_bucket_id uuid references public.money_buckets(id) on delete restrict;
grant insert(requested_minor) on public.plan_checks to authenticated;

create table public.plan_month_locks (
 plan_id uuid not null references public.daily_plans(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 month_key date not null check(extract(day from month_key)=1),
 target_minor bigint not null check(target_minor>0), currency text not null check(currency in ('THB','USD')),
 source_bucket_id uuid not null references public.money_buckets(id) on delete restrict,
 money_mode text not null check(money_mode in ('expense','saving')),
 monthly_method text not null check(monthly_method in ('split','flexible')),
 schedule jsonb not null, required_count integer not null check(required_count>0),
 rule_snapshot jsonb not null, stopped boolean not null default false,
 created_at timestamptz not null default now(), primary key(plan_id,month_key)
);
create table public.plan_status_events (
 plan_id uuid not null references public.daily_plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 effective_on date not null,status text not null check(status in ('active','paused','archived')),
 primary key(plan_id,effective_on)
);
insert into public.plan_status_events select plan_id,user_id,effective_on,rule->>'status' from public.plan_rule_versions;
create table public.plan_system_buckets (
 user_id uuid not null references auth.users(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete restrict,
 currency text not null check(currency in ('THB','USD')),
 bucket_id uuid not null unique references public.money_buckets(id) on delete restrict,
 primary key(user_id,portfolio_id,currency)
);
alter table public.plan_month_locks enable row level security;
alter table public.plan_status_events enable row level security;
alter table public.plan_system_buckets enable row level security;
revoke all on public.plan_month_locks,public.plan_status_events,public.plan_system_buckets from public,anon,authenticated;
grant select on public.plan_month_locks,public.plan_status_events,public.plan_system_buckets to authenticated;
grant all on public.plan_month_locks,public.plan_status_events,public.plan_system_buckets to service_role;
create policy own_month_lock on public.plan_month_locks for select to authenticated using(user_id=(select auth.uid()));
create policy own_plan_status on public.plan_status_events for select to authenticated using(user_id=(select auth.uid()));
create policy own_plan_bucket on public.plan_system_buckets for select to authenticated using(user_id=(select auth.uid()));
create index plan_month_owner on public.plan_month_locks(user_id,month_key);
create index plan_status_owner on public.plan_status_events(user_id,plan_id);
create index plan_checks_month on public.plan_checks(plan_id,month_key);

create function plan_private.today() returns date language sql stable set search_path='' as $$select (now() at time zone 'Asia/Bangkok')::date$$;
create or replace function plan_private.capture_rule_version() returns trigger language plpgsql security definer set search_path='' as $$
declare effective date; today date:=plan_private.today(); financial_change boolean; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'has_money_history')=(to_jsonb(old)-'has_money_history') then return new; end if;
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.plan_status_events(plan_id,user_id,effective_on,status)
  values(new.id,new.user_id,case when tg_op='INSERT' then new.starts_on else today end,new.status)
  on conflict(plan_id,effective_on) do update set status=excluded.status;
  if new.status<>'active' then update public.plan_month_locks set stopped=true where plan_id=new.id and month_key=date_trunc('month',today)::date; end if;
 end if;
 effective:=case when tg_op='INSERT' then new.starts_on else today end;
 if tg_op='UPDATE' then
  financial_change:=(to_jsonb(new)-array['name','status','archived','has_money_history']) is distinct from (to_jsonb(old)-array['name','status','archived','has_money_history']);
  if exists(select 1 from public.plan_month_locks where plan_id=new.id and month_key=date_trunc('month',today)::date) then
   if not financial_change then return new; end if;
   effective:=(date_trunc('month',today)+interval '1 month')::date;
  end if;
 end if;
 insert into public.plan_rule_versions(plan_id,user_id,effective_on,rule) values(new.id,new.user_id,effective,to_jsonb(new))
 on conflict(plan_id,effective_on) do update set rule=excluded.rule;
 return new;
end $$;

-- Same bounded day enumeration as planMonthSchedule; weekly groups are month-clipped.
create function plan_private.month_schedule(target uuid, month date) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date; r jsonb; state text; result jsonb:='{}'; k text; item jsonb; quota integer; begin
 if not exists(select 1 from public.daily_plans where id=target and user_id=auth.uid()) then raise exception 'Unauthorized'; end if;
 for d in select generate_series(month,(month+interval '1 month - 1 day')::date,interval '1 day')::date loop
  select rule into r from public.plan_rule_versions where plan_id=target and effective_on<=d order by effective_on desc limit 1;
  select status into state from public.plan_status_events where plan_id=target and effective_on<=d order by effective_on desc limit 1;
  if r is null or coalesce(state,'active')<>'active' then continue; end if;
  r:=r||jsonb_build_object('status','active');
  if not public.plan_rule_due(r,d) then continue; end if;
  k:=case when r->>'frequency'='weekly_target' then 'week:'||(d-(extract(isodow from d)::integer-1))::text else d::text end;
  item:=coalesce(result->k,jsonb_build_object('days','[]'::jsonb,'quota',0));
  item:=jsonb_set(item,'{days}',(item->'days')||to_jsonb(d::text));
  quota:=case when r->>'frequency'='weekly_target' then least((r->>'weekly_target')::integer,jsonb_array_length(item->'days')) else 1 end;
  result:=jsonb_set(result,array[k],item||jsonb_build_object('quota',quota));
 end loop;
 return result;
end $$;

create function plan_private.bucket_minor(target uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare c text; result numeric; begin
 select currency into c from public.money_buckets where id=target and user_id=auth.uid();
 if c is null or c not in ('USD','THB') then raise exception 'Invalid owned bucket'; end if;
 if exists(select 1 from public.cash_activities where bucket_id=target and (user_id<>auth.uid() or original_amount is null or currency is distinct from c or original_amount<>trunc(original_amount,2) or original_amount::text in ('NaN','Infinity','-Infinity'))) then raise exception 'Bucket has unresolved native amounts'; end if;
 select coalesce(sum(case when type in ('INCOME','DEPOSIT') then original_amount*100 when type in ('EXPENSE','WITHDRAW') then -original_amount*100 else 0 end),0) into result from public.cash_activities where bucket_id=target and user_id=auth.uid();
 return result::bigint;
end $$;

-- Executed only as a table trigger. Auth identity and ownership are checked before
-- private lock/system-bucket writes. No client may execute this definer function.
create function plan_private.apply_money_check() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.daily_plans; r jsonb; monthly_rule jsonb; ml public.plan_month_locks; b public.money_buckets; dest uuid;
 m date:=date_trunc('month',new.day)::date; today date:=plan_private.today(); state text;
 schedule jsonb; required integer; k text; quota integer; count_group integer; count_total integer; spent bigint;
 minor bigint:=0; balance bigint; target bigint; amount numeric; rate numeric; note text; mode text; method text;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 select * into p from public.daily_plans where id=new.plan_id and user_id=auth.uid() for update;
 if not found then raise exception 'Plan unavailable'; end if;
 -- Insert retry is a no-op, not a second debit. Undo/recheck remains explicit.
 if exists(select 1 from public.plan_checks where plan_id=p.id and day=new.day) then return null; end if;
 if p.status<>'active' then raise exception 'Plan is paused or archived'; end if;
 if new.day>today then raise exception 'Future check is not allowed'; end if;
 select status into state from public.plan_status_events where plan_id=p.id and effective_on<=new.day order by effective_on desc limit 1;
 if coalesce(state,'active')<>'active' then raise exception 'Day is paused or archived'; end if;
 select * into ml from public.plan_month_locks where plan_id=p.id and month_key=m;
 select rule into r from public.plan_rule_versions where plan_id=p.id and effective_on<=new.day order by effective_on desc limit 1;
 r:=coalesce(r,to_jsonb(p));
 -- An unlocked monthly target uses the most recent rule effective within that
 -- month. Its eligible dates still follow day-by-day rule/status history.
 if ml.plan_id is null then
  select rule into monthly_rule from public.plan_rule_versions where plan_id=p.id and effective_on<m+interval '1 month' order by effective_on desc limit 1;
  if monthly_rule->>'amount_period'='month' and (monthly_rule->>'amount')::numeric>0 then r:=monthly_rule; end if;
 end if;
 if ml.plan_id is not null then r:=ml.rule_snapshot; end if;
 new.credited:=true; new.amount_minor:=0; new.amount:=0;
 if ml.plan_id is null and r->>'amount_period'<>'month' and not public.plan_rule_due(r||jsonb_build_object('status','active'),new.day) then raise exception 'Day is not scheduled'; end if;
 if coalesce((r->>'amount')::numeric,0)=0 and ml.plan_id is null then
  if not public.plan_rule_due(r||jsonb_build_object('status','active'),new.day) then raise exception 'Day is not scheduled'; end if;
  return new;
 end if;
 if ml.plan_id is null then
  select * into b from public.money_buckets where id=(r->>'bucket_id')::uuid and user_id=auth.uid();
  if not found or b.currency not in ('THB','USD') or (r->>'currency' is not null and r->>'currency'<>b.currency) then raise exception 'Goal and bucket currency must match'; end if;
  if (r->>'amount')::numeric<>trunc((r->>'amount')::numeric,2) then raise exception 'Money must use exact cents'; end if;
  if r->>'amount_period'='month' then
   schedule:=plan_private.month_schedule(p.id,m);
   select sum((value->>'quota')::integer) into required from jsonb_each(schedule);
   if coalesce(required,0)=0 then raise exception 'No required dates in this month'; end if;
   -- Existing legacy checks must not be re-priced or silently folded into a new allocator.
   if exists(select 1 from public.plan_checks where plan_id=p.id and day>=m and day<m+interval '1 month' and amount_minor is null) then raise exception 'Legacy month must be completed or undone before using the new allocator'; end if;
   insert into public.plan_month_locks(plan_id,user_id,month_key,target_minor,currency,source_bucket_id,money_mode,monthly_method,schedule,required_count,rule_snapshot)
   values(p.id,auth.uid(),m,((r->>'amount')::numeric*100)::bigint,b.currency,b.id,coalesce(r->>'money_mode','expense'),coalesce(r->>'monthly_method','split'),schedule,required,r)
   returning * into ml;
  end if;
 end if;
 if ml.plan_id is not null then
  new.month_key:=m;new.currency:=ml.currency;new.source_bucket_id:=ml.source_bucket_id;mode:=ml.money_mode;method:=ml.monthly_method;
  select key,(value->>'quota')::integer into k,quota from jsonb_each(ml.schedule) where (value->'days') ? new.day::text;
  if k is null then raise exception 'Day is not in the locked schedule'; end if;
  new.group_key:=k;
  select count(*) into count_group from public.plan_checks where plan_id=p.id and month_key=m and group_key=k and credited;
  select count(*) filter(where credited),coalesce(sum(amount_minor),0) into count_total,spent from public.plan_checks where plan_id=p.id and month_key=m;
  target:=ml.target_minor;
  if count_group>=quota or count_total>=ml.required_count then new.credited:=false;minor:=0;
  elsif method='flexible' then
   if new.requested_minor is null or new.requested_minor<=0 then raise exception 'Enter a positive amount in minor units'; end if;
   minor:=new.requested_minor;
   if minor>target-spent then raise exception 'Amount exceeds remaining monthly target'; end if;
  else
   minor:=least(target/ml.required_count,target-spent);
   if count_total=ml.required_count-1 then minor:=target-spent; end if;
  end if;
 else
  new.currency:=b.currency;new.source_bucket_id:=b.id;mode:=coalesce(r->>'money_mode','expense');minor:=((r->>'amount')::numeric*100)::bigint;
  if r->>'frequency'='weekly_target' then
   select count(*) into count_group from public.plan_checks where plan_id=p.id and day between new.day-(extract(isodow from new.day)::integer-1) and new.day+(7-extract(isodow from new.day)::integer);
   if count_group>=(r->>'weekly_target')::integer and not new.confirm_extra then raise exception 'Confirm extra money check'; end if;
   new.credited:=count_group<(r->>'weekly_target')::integer;
  end if;
 end if;
 new.amount_minor:=minor;new.amount:=minor::numeric/100;new.money_mode:=mode;
 if minor=0 then return new; end if;
 -- One lock per owner prevents cross-goal lock inversion and duplicate system buckets.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,761));
 select * into b from public.money_buckets where id=new.source_bucket_id and user_id=auth.uid() for update;
 if not found or b.currency<>new.currency then raise exception 'Goal and bucket currency must match'; end if;
 balance:=plan_private.bucket_minor(b.id);
 if balance<minor then raise exception 'Insufficient bucket balance'; end if;
 if mode='saving' then
  select bucket_id into dest from public.plan_system_buckets where user_id=auth.uid() and portfolio_id=b.portfolio_id and currency=b.currency;
  if dest is null then
   insert into public.money_buckets(user_id,portfolio_id,name,currency,current_amount) values(auth.uid(),b.portfolio_id,'PLAN · '||b.currency,b.currency,0) returning id into dest;
   insert into public.plan_system_buckets(user_id,portfolio_id,currency,bucket_id) values(auth.uid(),b.portfolio_id,b.currency,dest);
  end if;
  if dest=b.id then raise exception 'Source cannot be the PLAN destination'; end if;
  perform 1 from public.money_buckets where id=dest and user_id=auth.uid() for update;
  new.destination_bucket_id:=dest;
 end if;
 select rate_at_time into rate from public.cash_activities where bucket_id=b.id and user_id=auth.uid() and rate_at_time>0 order by date desc,created_at desc limit 1;
 if b.currency='USD' then rate:=1; end if;
 if rate is null or rate<=0 then raise exception 'Bucket exchange rate is unavailable'; end if;
 amount:=minor::numeric/100;note:=p.name||' · '||new.day||' [plan:'||p.id||']';
 insert into public.cash_activities(user_id,portfolio_id,type,amount,category,note,date,bucket_id,is_transfer,currency,rate_at_time,original_amount)
 values(auth.uid(),b.portfolio_id,case when mode='saving' then 'WITHDRAW' else 'EXPENSE' end,amount/rate,'PLAN',note,new.day::timestamp at time zone 'Asia/Bangkok',b.id,mode='saving',b.currency,rate,amount) returning id into new.cash_id;
 insert into public.bucket_activities(user_id,portfolio_id,bucket_id,type,amount,note,date,currency,rate_at_time,original_amount)
 values(auth.uid(),b.portfolio_id,b.id,'withdraw',amount,note,new.day::timestamp at time zone 'Asia/Bangkok',b.currency,rate,amount) returning id into new.bucket_activity_id;
 if dest is not null then
  insert into public.cash_activities(user_id,portfolio_id,type,amount,category,note,date,bucket_id,is_transfer,currency,rate_at_time,original_amount)
  values(auth.uid(),b.portfolio_id,'DEPOSIT',amount/rate,'PLAN',note,new.day::timestamp at time zone 'Asia/Bangkok',dest,true,b.currency,rate,amount) returning id into new.destination_cash_id;
  insert into public.bucket_activities(user_id,portfolio_id,bucket_id,type,amount,note,date,currency,rate_at_time,original_amount)
  values(auth.uid(),b.portfolio_id,dest,'deposit',amount,note,new.day::timestamp at time zone 'Asia/Bangkok',b.currency,rate,amount) returning id into new.destination_activity_id;
  update public.money_buckets set current_amount=plan_private.bucket_minor(dest)::numeric/100 where id=dest;
 end if;
 update public.money_buckets set current_amount=(balance-minor)::numeric/100 where id=b.id;
 return new;
end $$;
drop trigger aa_guard_plan_schedule on public.plan_checks;
drop trigger check_daily_plan on public.plan_checks;
create trigger check_daily_plan before insert on public.plan_checks for each row execute function plan_private.apply_money_check();

create function plan_private.undo_money_check() returns trigger language plpgsql security definer set search_path='' as $$
declare source uuid; p public.daily_plans; begin
 if auth.uid() is null or old.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 select * into p from public.daily_plans where id=old.plan_id and user_id=auth.uid() for update;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,761));
 source:=old.source_bucket_id;
 if source is null and old.cash_id is not null then select bucket_id into source from public.cash_activities where id=old.cash_id and user_id=auth.uid(); end if;
 perform 1 from public.money_buckets where id in (source,old.destination_bucket_id) and user_id=auth.uid() order by id for update;
 if old.destination_bucket_id is not null and plan_private.bucket_minor(old.destination_bucket_id)<old.amount_minor then raise exception 'Insufficient PLAN balance to reverse transfer'; end if;
 delete from public.cash_activities where id in (old.cash_id,old.destination_cash_id) and user_id=auth.uid();
 delete from public.bucket_activities where id in (old.bucket_activity_id,old.destination_activity_id) and user_id=auth.uid();
 if source is not null then
  if old.amount_minor is null then
   -- Legacy snapshots can contain sub-cent amounts. Undo them exactly without
   -- rounding or rewriting any other pre-migration transaction.
   update public.money_buckets set current_amount=(select coalesce(sum(case when type in ('INCOME','DEPOSIT') then original_amount when type in ('EXPENSE','WITHDRAW') then -original_amount else 0 end),0) from public.cash_activities where bucket_id=source and user_id=auth.uid()) where id=source;
  else update public.money_buckets set current_amount=plan_private.bucket_minor(source)::numeric/100 where id=source;
  end if;
 end if;
 if old.destination_bucket_id is not null then update public.money_buckets set current_amount=plan_private.bucket_minor(old.destination_bucket_id)::numeric/100 where id=old.destination_bucket_id; end if;
 if old.month_key is not null and not exists(select 1 from public.plan_checks where plan_id=p.id and month_key=old.month_key) then
  delete from public.plan_month_locks where plan_id=p.id and month_key=old.month_key;
  -- Once all checks are undone, current edits may apply immediately again.
  if old.month_key=date_trunc('month',plan_private.today())::date then
   -- The queued edit is now effective immediately. Do not leave an obsolete
   -- next-month version that could override a later unlocked edit.
   delete from public.plan_rule_versions where plan_id=p.id
    and effective_on=(date_trunc('month',plan_private.today())+interval '1 month')::date;
   insert into public.plan_rule_versions(plan_id,user_id,effective_on,rule) values(p.id,p.user_id,plan_private.today(),to_jsonb(p))
   on conflict(plan_id,effective_on) do update set rule=excluded.rule;
  end if;
 end if;
 return old;
end $$;
drop trigger uncheck_daily_plan on public.plan_checks;
create trigger uncheck_daily_plan after delete on public.plan_checks for each row execute function plan_private.undo_money_check();
create or replace function public.protect_plan_expense() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.plan_checks where cash_id=old.id or destination_cash_id=old.id) then raise exception 'Manage this linked expense from PLAN'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create function public.protect_plan_bucket_activity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.plan_checks where bucket_activity_id=old.id or destination_activity_id=old.id) then raise exception 'Manage this linked activity from PLAN'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger protect_plan_bucket_activity before update or delete on public.bucket_activities for each row execute function public.protect_plan_bucket_activity();
revoke all on function public.protect_plan_bucket_activity() from public,anon,authenticated;
create function public.protect_plan_bucket_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.plan_system_buckets where bucket_id=old.id) and
  (new.user_id is distinct from old.user_id or new.portfolio_id is distinct from old.portfolio_id or new.currency is distinct from old.currency or new.name is distinct from old.name) then
  raise exception 'PLAN system bucket identity cannot be changed';
 end if;
 return new;
end $$;
create trigger protect_plan_bucket_identity before update on public.money_buckets for each row execute function public.protect_plan_bucket_identity();
revoke all on function public.protect_plan_bucket_identity() from public,anon,authenticated;
revoke all on all functions in schema plan_private from public,anon,authenticated;
