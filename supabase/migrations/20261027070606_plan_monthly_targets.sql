alter table public.daily_plans add column amount_period text not null default 'day' check(amount_period in ('day','month'));
grant insert(amount_period) on public.daily_plans to authenticated;
create or replace function public.check_daily_plan() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.daily_plans; b public.money_buckets; balance numeric; rate numeric; legacy numeric; span_start date; span_end date; days integer; begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 select * into p from public.daily_plans where id=new.plan_id and user_id=auth.uid() for update;
 if not found or p.archived then raise exception 'Plan unavailable'; end if;
 if new.day<p.starts_on or new.day>p.ends_on or new.day>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Date outside plan or in the future'; end if;
 new.amount:=p.amount;
 if p.amount>0 and p.amount_period='month' then
  span_start:=greatest(p.starts_on,date_trunc('month',new.day)::date);
  span_end:=least(p.ends_on,(date_trunc('month',new.day)+interval '1 month - 1 day')::date);
  days:=span_end-span_start+1;
  new.amount:=trunc(p.amount/days,2);
  if new.day=span_end then new.amount:=p.amount-new.amount*(days-1); end if;
 end if;
 if p.amount=0 then return new; end if;
 select * into b from public.money_buckets where id=p.bucket_id and user_id=auth.uid() for update;
 if not found or b.currency not in ('USD','THB') then raise exception 'Bucket currency must be USD or THB'; end if;
 new.currency:=b.currency;
 if new.amount=0 then return new; end if;
 if exists(select 1 from public.cash_activities where bucket_id=b.id and (original_amount is null or currency is distinct from b.currency)) then raise exception 'Bucket has unresolved native amounts'; end if;
 select coalesce(sum(case when type in ('INCOME','DEPOSIT') then original_amount when type in ('EXPENSE','WITHDRAW') then -original_amount else 0 end),0)
 into balance from public.cash_activities where bucket_id=b.id and user_id=auth.uid();
 if balance<new.amount then raise exception 'Insufficient bucket balance'; end if;
 -- Keep the recorded FX convention for the legacy USD column; native money is authoritative.
 select rate_at_time into rate from public.cash_activities where bucket_id=b.id and rate_at_time>0 order by date desc,created_at desc limit 1;
 if b.currency='USD' then rate:=1; end if;
 if rate is null or rate<=0 then raise exception 'Bucket exchange rate is unavailable'; end if;
 legacy:=new.amount/rate;
 new.currency:=b.currency;
 insert into public.cash_activities(user_id,portfolio_id,type,amount,category,note,date,bucket_id,is_transfer,currency,rate_at_time,original_amount)
 values(auth.uid(),b.portfolio_id,'EXPENSE',legacy,'PLAN',p.name||' · '||new.day||' [plan:'||p.id||']',new.day::timestamp at time zone 'Asia/Bangkok',b.id,false,b.currency,rate,new.amount) returning id into new.cash_id;
 insert into public.bucket_activities(user_id,portfolio_id,bucket_id,type,amount,note,date,currency,rate_at_time,original_amount)
 values(auth.uid(),b.portfolio_id,b.id,'withdraw',new.amount,'PLAN · '||p.name,new.day::timestamp at time zone 'Asia/Bangkok',b.currency,rate,new.amount) returning id into new.bucket_activity_id;
 update public.money_buckets set current_amount=balance-new.amount where id=b.id;
 return new;
end $$;
