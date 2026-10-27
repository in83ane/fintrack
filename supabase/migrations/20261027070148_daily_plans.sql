create table public.daily_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 amount numeric not null default 0 check(amount>=0 and amount<1000000000000),
 bucket_id uuid references public.money_buckets(id) on delete restrict,
 starts_on date not null, ends_on date not null check(ends_on>=starts_on and ends_on<=starts_on+3660),
 archived boolean not null default false, created_at timestamptz not null default now(),
 check(amount=0 or bucket_id is not null)
);
alter table public.daily_plans enable row level security;
revoke all on public.daily_plans from anon,authenticated;
grant select on public.daily_plans to authenticated;
grant insert(name,amount,bucket_id,starts_on,ends_on),update(archived) on public.daily_plans to authenticated;
grant all on public.daily_plans to service_role;
create policy plan_read on public.daily_plans for select to authenticated using((select auth.uid())=user_id);
create policy plan_create on public.daily_plans for insert to authenticated with check((select auth.uid())=user_id and (bucket_id is null or exists(select 1 from public.money_buckets b where b.id=bucket_id and b.user_id=(select auth.uid()))));
create policy plan_archive on public.daily_plans for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy plan_worker on public.daily_plans for all to service_role using(true) with check(true);
create index daily_plans_owner on public.daily_plans(user_id,starts_on);
create index daily_plans_bucket on public.daily_plans(bucket_id);

create table public.plan_checks (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 plan_id uuid not null references public.daily_plans(id) on delete restrict,
 day date not null, amount numeric not null default 0, currency text,
 cash_id uuid unique references public.cash_activities(id) on delete restrict,
 bucket_activity_id uuid unique references public.bucket_activities(id) on delete restrict,
 created_at timestamptz not null default now(), primary key(plan_id,day)
);
alter table public.plan_checks enable row level security;
revoke all on public.plan_checks from anon,authenticated;
grant select,delete on public.plan_checks to authenticated;
grant insert(plan_id,day) on public.plan_checks to authenticated;
grant all on public.plan_checks to service_role;
create policy check_read on public.plan_checks for select to authenticated using((select auth.uid())=user_id);
create policy check_create on public.plan_checks for insert to authenticated with check((select auth.uid())=user_id and exists(select 1 from public.daily_plans p where p.id=plan_id and p.user_id=(select auth.uid())));
create policy check_remove on public.plan_checks for delete to authenticated using((select auth.uid())=user_id);
create policy check_worker on public.plan_checks for all to service_role using(true) with check(true);
create index plan_checks_owner on public.plan_checks(user_id,day);

-- One insert is the entire check + expense transaction. Repeated clicks roll back on the unique key.
create function public.check_daily_plan() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.daily_plans; b public.money_buckets; balance numeric; rate numeric; legacy numeric; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 select * into p from public.daily_plans where id=new.plan_id and user_id=auth.uid() for update;
 if not found or p.archived then raise exception 'Plan unavailable'; end if;
 if new.day<p.starts_on or new.day>p.ends_on or new.day>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Date outside plan or in the future'; end if;
 new.amount:=p.amount;
 if p.amount=0 then return new; end if;
 select * into b from public.money_buckets where id=p.bucket_id and user_id=auth.uid() for update;
 if not found or b.currency not in ('USD','THB') then raise exception 'Bucket currency must be USD or THB'; end if;
 if exists(select 1 from public.cash_activities where bucket_id=b.id and (original_amount is null or currency is distinct from b.currency)) then raise exception 'Bucket has unresolved native amounts'; end if;
 select coalesce(sum(case when type in ('INCOME','DEPOSIT') then original_amount when type in ('EXPENSE','WITHDRAW') then -original_amount else 0 end),0)
 into balance from public.cash_activities where bucket_id=b.id and user_id=auth.uid();
 if balance<p.amount then raise exception 'Insufficient bucket balance'; end if;
 -- Keep the recorded FX convention for the legacy USD column; native money is authoritative.
 select rate_at_time into rate from public.cash_activities where bucket_id=b.id and rate_at_time>0 order by date desc,created_at desc limit 1;
 if b.currency='USD' then rate:=1; end if;
 if rate is null or rate<=0 then raise exception 'Bucket exchange rate is unavailable'; end if;
 legacy:=p.amount/rate;
 new.currency:=b.currency;
 insert into public.cash_activities(user_id,portfolio_id,type,amount,category,note,date,bucket_id,is_transfer,currency,rate_at_time,original_amount)
 values(auth.uid(),b.portfolio_id,'EXPENSE',legacy,'PLAN',p.name||' · '||new.day||' [plan:'||p.id||']',new.day::timestamp at time zone 'Asia/Bangkok',b.id,false,b.currency,rate,p.amount) returning id into new.cash_id;
 insert into public.bucket_activities(user_id,portfolio_id,bucket_id,type,amount,note,date,currency,rate_at_time,original_amount)
 values(auth.uid(),b.portfolio_id,b.id,'withdraw',p.amount,'PLAN · '||p.name,new.day::timestamp at time zone 'Asia/Bangkok',b.currency,rate,p.amount) returning id into new.bucket_activity_id;
 update public.money_buckets set current_amount=balance-p.amount where id=b.id;
 return new;
end $$;
revoke all on function public.check_daily_plan() from public,anon,authenticated;
create trigger check_daily_plan before insert on public.plan_checks for each row execute function public.check_daily_plan();

create function public.uncheck_daily_plan() returns trigger language plpgsql security invoker set search_path='' as $$
declare b_id uuid; balance numeric; begin
 if old.cash_id is null then return old; end if;
 select bucket_id into b_id from public.cash_activities where id=old.cash_id and user_id=auth.uid();
 perform 1 from public.money_buckets where id=b_id for update;
 delete from public.cash_activities where id=old.cash_id and user_id=auth.uid();
 delete from public.bucket_activities where id=old.bucket_activity_id and user_id=auth.uid();
 select coalesce(sum(case when type in ('INCOME','DEPOSIT') then original_amount when type in ('EXPENSE','WITHDRAW') then -original_amount else 0 end),0)
 into balance from public.cash_activities where bucket_id=b_id and user_id=auth.uid();
 update public.money_buckets set current_amount=balance where id=b_id and user_id=auth.uid();
 return old;
end $$;
revoke all on function public.uncheck_daily_plan() from public,anon,authenticated;
create trigger uncheck_daily_plan after delete on public.plan_checks for each row execute function public.uncheck_daily_plan();

create function public.protect_plan_expense() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.plan_checks where cash_id=old.id) then raise exception 'Manage this linked expense from PLAN'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.protect_plan_expense() from public,anon,authenticated;
create trigger protect_plan_expense before update or delete on public.cash_activities for each row execute function public.protect_plan_expense();
