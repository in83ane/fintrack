-- Apply with matching app release, after PLAN phase 2. No historical amounts/FX rewritten.
begin;
lock table public.money_buckets,public.cash_activities,public.bucket_activities,public.brokerage_cash_entries,public.plan_checks,public.plan_month_locks,public.daily_plans in share row exclusive mode;
create schema if not exists bucket_private;
revoke all on schema bucket_private from public,anon,authenticated;
create table bucket_private.write_context(pid integer,tx bigint,owner uuid,primary key(pid,tx));
create table bucket_private.requests(owner uuid,id uuid,payload jsonb not null,result jsonb not null,primary key(owner,id));
create table bucket_private.links(cash_id uuid primary key,activity_id uuid unique,owner uuid not null,group_id uuid,origin text not null);
alter table bucket_private.write_context enable row level security;
alter table bucket_private.requests enable row level security;
alter table bucket_private.links enable row level security;
create index bucket_writer_link_group on bucket_private.links(owner,group_id);
create index if not exists cash_activities_bucket_writer_idx on public.cash_activities(bucket_id,user_id);
revoke all on all tables in schema bucket_private from public,anon,authenticated;
-- Schema-only recovery snapshot; no user data is copied into this table.
create table bucket_private.rollback_snapshot(kind text,name text,definition text);
alter table bucket_private.rollback_snapshot enable row level security;
revoke all on bucket_private.rollback_snapshot from public,anon,authenticated;
insert into bucket_private.rollback_snapshot
select 'function', signature, case when to_regprocedure(signature) is null then null else pg_get_functiondef(to_regprocedure(signature)) end
from unnest(array[
 'plan_private.apply_money_check()','plan_private.undo_money_check()',
 'public.transfer_bucket_to_broker(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric)',
 'public.transfer_broker_to_bucket(uuid,uuid,uuid,numeric,numeric)',
 'public.delete_broker_cash_movement(uuid)','public.protect_funding_activity()']) signature;
insert into bucket_private.rollback_snapshot
select 'grant',c.relname,format('grant %s on public.%I to %s%s',a.privilege_type,c.relname,case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end,case when a.is_grantable then ' with grant option' else '' end)
from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where c.oid in ('public.cash_activities'::regclass,'public.bucket_activities'::regclass,'public.money_buckets'::regclass)
and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'));
insert into bucket_private.rollback_snapshot
select 'grant',c.relname,format('grant %s (%I) on public.%I to %s%s',a.privilege_type,att.attname,c.relname,case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end,case when a.is_grantable then ' with grant option' else '' end)
from pg_class c join pg_attribute att on att.attrelid=c.oid cross join lateral aclexplode(att.attacl) a
where c.oid in ('public.cash_activities'::regclass,'public.bucket_activities'::regclass,'public.money_buckets'::regclass)
and a.privilege_type in ('INSERT','UPDATE') and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'));
insert into bucket_private.rollback_snapshot
select 'function_grant',r.name,format('grant execute on function %s to %s%s',r.name,case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end,case when a.is_grantable then ' with grant option' else '' end)
from bucket_private.rollback_snapshot r join pg_proc p on p.oid=to_regprocedure(r.name)
cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
where r.kind='function' and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'));
create function bucket_private.financial_fingerprint() returns text language plpgsql security definer set search_path='' as $$
declare t text; digest text; result text:='';begin
 foreach t in array array['cash_activities','bucket_activities','money_buckets','brokerage_cash_entries','plan_checks','plan_month_locks'] loop
  execute format($q$select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by to_jsonb(r)::text),'')) from public.%I r$q$,t) into digest;
  result:=result||t||digest;
 end loop;
 return md5(result);
end $$;
insert into bucket_private.rollback_snapshot values('fingerprint','financial',bucket_private.financial_fingerprint());

-- Only explicit, validated IDs are linked. Never infer relationships from note text.
insert into bucket_private.links(cash_id,activity_id,owner,origin)
select c.id,a.id,c.user_id,'plan' from public.plan_checks p
join public.cash_activities c on c.id=p.cash_id join public.bucket_activities a on a.id=p.bucket_activity_id
where c.user_id=p.user_id and a.user_id=c.user_id and c.bucket_id=a.bucket_id
and c.original_amount=a.original_amount and c.currency=a.currency;
insert into bucket_private.links(cash_id,activity_id,owner,origin)
select c.id,a.id,c.user_id,'plan' from public.plan_checks p
join public.cash_activities c on c.id=p.destination_cash_id join public.bucket_activities a on a.id=p.destination_activity_id
where c.user_id=p.user_id and a.user_id=c.user_id and c.bucket_id=a.bucket_id
and c.original_amount=a.original_amount and c.currency=a.currency on conflict do nothing;
insert into bucket_private.links(cash_id,activity_id,owner,origin)
select c.id,a.id,c.user_id,'broker' from public.cash_activities c join public.bucket_activities a
on a.id=c.id and a.brokerage_entry_id=c.brokerage_entry_id
where c.brokerage_entry_id is not null and c.user_id=a.user_id and c.bucket_id=a.bucket_id
and c.original_amount=a.original_amount and c.currency=a.currency on conflict do nothing;

create function bucket_private.lock_owner() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,761));
end $$;
create function bucket_private.native_balance(target uuid) returns numeric language plpgsql security definer set search_path='' as $$
declare b public.money_buckets; total numeric; begin
 select * into b from public.money_buckets where id=target and user_id=auth.uid();
 if not found or b.currency not in ('THB','USD') then raise exception 'Invalid owned bucket'; end if;
 if exists(select 1 from public.cash_activities where bucket_id=target and
  (user_id is distinct from auth.uid() or original_amount is null or currency is distinct from b.currency
  or original_amount::text in ('NaN','Infinity','-Infinity') or original_amount<0 or original_amount<>trunc(original_amount,2)
  or type is null or type not in ('INCOME','DEPOSIT','EXPENSE','WITHDRAW'))) then raise exception 'Unresolved bucket history: audit required'; end if;
 select coalesce(sum(case when type in ('INCOME','DEPOSIT') then original_amount else -original_amount end),0) into total from public.cash_activities where bucket_id=target;
 return total;
end $$;
create function bucket_private.guard_write() returns trigger language plpgsql security definer set search_path='' as $$
declare permitted boolean; begin
 select exists(select 1 from bucket_private.write_context where pid=pg_backend_pid() and tx=txid_current() and owner=auth.uid()) into permitted;
 if tg_table_name='money_buckets' then
  if tg_op='INSERT' then
   if coalesce(new.current_amount,0)<>0 and not permitted then raise exception 'Use atomic bucket writer'; end if;
   return new;
  end if;
  if tg_op='UPDATE' and new.current_amount is not distinct from old.current_amount and new.currency is not distinct from old.currency
   and new.user_id is not distinct from old.user_id and new.portfolio_id is not distinct from old.portfolio_id then return new; end if;
 end if;
 if not permitted then raise exception 'Use atomic bucket writer'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

-- One private writer: validate the complete net effect, then cash + mirror + cache.
-- Caller supplies rates explicitly; this is the future quote-snapshot policy seam.
create function bucket_private.write_rows(puts jsonb, removes uuid[], origin text, operation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; c public.cash_activities; oldc public.cash_activities; b public.money_buckets; link bucket_private.links;
 ids uuid[]; affected uuid[]; delta numeric; balance numeric; aid uuid; result jsonb:='[]';
begin
 perform bucket_private.lock_owner();
 if jsonb_typeof(puts)<>'array' or jsonb_array_length(puts)>200 or cardinality(removes)>200 then raise exception 'Invalid batch'; end if;
 select array_agg(id) into ids from (select (value->>'id')::uuid id from jsonb_array_elements(puts) union select unnest(coalesce(removes,'{}'))) s;
 if (select count(*) from jsonb_array_elements(puts))<>(select count(distinct value->>'id') from jsonb_array_elements(puts)) then raise exception 'Duplicate row IDs'; end if;
 if exists(select 1 from jsonb_array_elements(puts) where value->>'id' is null) then raise exception 'Missing row ID'; end if;
 if exists(select 1 from unnest(coalesce(removes,'{}')) rid where not exists(select 1 from public.cash_activities where id=rid)) then raise exception 'Unlinked missing activity: audit required';end if;
 if exists(select 1 from public.cash_activities where id=any(ids) and user_id<>auth.uid()) then raise exception 'Unauthorized cash row'; end if;
 select array_agg(distinct bid order by bid) into affected from (
  select bucket_id bid from public.cash_activities where id=any(ids)
  union select (value->>'bucket_id')::uuid from jsonb_array_elements(puts)) s where bid is not null;
 perform 1 from public.money_buckets where id=any(affected) and user_id=auth.uid() order by id for update;
 if (select count(*) from public.money_buckets where id=any(affected) and user_id=auth.uid())<>coalesce(cardinality(affected),0) then raise exception 'Invalid owned bucket'; end if;
 perform 1 from public.cash_activities where id=any(ids) order by id for update;
 for oldc in select * from public.cash_activities where id=any(ids) loop
  select * into link from bucket_private.links where cash_id=oldc.id and owner=auth.uid();
  if not found or (oldc.bucket_id is not null and link.activity_id is null) then raise exception 'Unlinked legacy activity: audit required'; end if;
  if oldc.bucket_id is not null and not exists(select 1 from public.bucket_activities a where a.id=link.activity_id and a.user_id=auth.uid()
   and a.bucket_id=oldc.bucket_id and a.currency=oldc.currency and a.original_amount=oldc.original_amount
   and a.amount=oldc.original_amount and a.portfolio_id=oldc.portfolio_id and a.rate_at_time=oldc.rate_at_time
   and a.type=case when oldc.type in ('INCOME','DEPOSIT') then 'deposit' else 'withdraw' end) then raise exception 'Unresolved activity pair: audit required';end if;
  if link.origin<>origin then raise exception 'Manage linked activity from its original source'; end if;
  if oldc.original_amount is null or oldc.original_amount<>trunc(oldc.original_amount,2) or oldc.original_amount<0
   or oldc.original_amount::text in ('NaN','Infinity','-Infinity') or oldc.type not in ('INCOME','DEPOSIT','EXPENSE','WITHDRAW') then raise exception 'Unresolved activity: audit required'; end if;
 end loop;
 for r in select value from jsonb_array_elements(puts) loop
  -- Validate JSON before assigning a numeric(18,4) record (which can round).
  if (r->>'original_amount')::numeric is distinct from trunc((r->>'original_amount')::numeric,2) then raise exception 'Invalid sub-cent native amount';end if;
  c:=jsonb_populate_record(null::public.cash_activities,r);
  if c.type is null or c.type not in ('INCOME','DEPOSIT','EXPENSE','WITHDRAW') or c.currency is null or c.currency not in ('USD','THB')
   or c.original_amount is null or c.original_amount<=0 or c.original_amount<>trunc(c.original_amount,2)
   or c.original_amount::text in ('NaN','Infinity','-Infinity') or c.rate_at_time is null or c.rate_at_time<=0
   or c.rate_at_time::text in ('NaN','Infinity','-Infinity') or c.date is null then raise exception 'Invalid native amount or rate'; end if;
  if not exists(select 1 from public.portfolios where id=c.portfolio_id and user_id=auth.uid() and kind='cash_management') then raise exception 'Invalid cash portfolio'; end if;
  if c.bucket_id is not null and not exists(select 1 from public.money_buckets where id=c.bucket_id and currency=c.currency and portfolio_id=c.portfolio_id and user_id=auth.uid()) then raise exception 'Bucket currency/portfolio mismatch'; end if;
 end loop;
 foreach aid in array coalesce(affected,'{}') loop
  select * into b from public.money_buckets where id=aid;
  balance:=bucket_private.native_balance(aid);
  if b.current_amount is distinct from balance then raise exception 'Bucket balance mismatch: audit required'; end if;
  select coalesce(sum(case when type in ('INCOME','DEPOSIT') then -original_amount else original_amount end),0) into delta from public.cash_activities where bucket_id=aid and id=any(ids);
  select delta+coalesce(sum(case when value->>'type' in ('INCOME','DEPOSIT') then (value->>'original_amount')::numeric else -(value->>'original_amount')::numeric end),0)
   into delta from jsonb_array_elements(puts) where (value->>'bucket_id')::uuid=aid;
  if balance+delta<0 then raise exception 'Insufficient bucket balance' using errcode='P0001'; end if;
 end loop;
 insert into bucket_private.write_context values(pg_backend_pid(),txid_current(),auth.uid());
 for oldc in select * from public.cash_activities where id=any(coalesce(removes,'{}')) loop
  select * into link from bucket_private.links where cash_id=oldc.id;
  delete from public.cash_activities where id=oldc.id;
  delete from public.bucket_activities where id=link.activity_id;
  delete from bucket_private.links where cash_id=oldc.id;
 end loop;
 for r in select value from jsonb_array_elements(puts) loop
  c:=jsonb_populate_record(null::public.cash_activities,r);
  c.user_id:=auth.uid(); c.amount:=c.original_amount/c.rate_at_time;
  -- Preserve the established broker FX snapshot (before native cent rounding).
  -- Public commands cannot request this trusted-origin override.
  if origin='broker' and r ? 'amount' then c.amount:=(r->>'amount')::numeric;end if;
  -- Metadata edits never reprice historical USD snapshots.
  select * into oldc from public.cash_activities where id=c.id;
  if found and c.original_amount=oldc.original_amount and c.currency=oldc.currency and c.rate_at_time=oldc.rate_at_time then c.amount:=oldc.amount; end if;
  insert into public.cash_activities(id,user_id,portfolio_id,bucket_id,type,amount,original_amount,currency,rate_at_time,date,category,note,is_transfer,brokerage_entry_id,funding_details)
  values(c.id,c.user_id,c.portfolio_id,c.bucket_id,c.type,c.amount,c.original_amount,c.currency,c.rate_at_time,c.date,c.category,c.note,coalesce(c.is_transfer,false),c.brokerage_entry_id,c.funding_details)
  on conflict(id) do update set bucket_id=excluded.bucket_id,portfolio_id=excluded.portfolio_id,type=excluded.type,amount=excluded.amount,original_amount=excluded.original_amount,currency=excluded.currency,rate_at_time=excluded.rate_at_time,date=excluded.date,category=excluded.category,note=excluded.note,is_transfer=excluded.is_transfer returning * into c;
  select * into link from bucket_private.links where cash_id=c.id;
  aid:=coalesce(link.activity_id,c.id);
  if link.cash_id is null and exists(select 1 from public.bucket_activities where id=aid) then raise exception 'Unlinked activity ID conflict';end if;
  if c.bucket_id is not null then
   insert into public.bucket_activities(id,user_id,portfolio_id,bucket_id,type,amount,original_amount,currency,rate_at_time,date,note,brokerage_entry_id)
   values(aid,auth.uid(),c.portfolio_id,c.bucket_id,case when c.type in ('INCOME','DEPOSIT') then 'deposit' else 'withdraw' end,c.original_amount,c.original_amount,c.currency,c.rate_at_time,c.date,c.note,c.brokerage_entry_id)
   on conflict(id) do update set bucket_id=excluded.bucket_id,portfolio_id=excluded.portfolio_id,type=excluded.type,amount=excluded.amount,original_amount=excluded.original_amount,currency=excluded.currency,rate_at_time=excluded.rate_at_time,date=excluded.date,note=excluded.note;
  else
   delete from public.bucket_activities where id=link.activity_id; aid:=null;
  end if;
  insert into bucket_private.links values(c.id,aid,auth.uid(),operation,origin)
  on conflict(cash_id) do update set activity_id=excluded.activity_id;
  result:=result||jsonb_build_array(to_jsonb(c)||jsonb_build_object('bucket_activity_id',aid));
 end loop;
 foreach aid in array coalesce(affected,'{}') loop
  update public.money_buckets set current_amount=bucket_private.native_balance(aid) where id=aid;
 end loop;
 delete from bucket_private.write_context where pid=pg_backend_pid() and tx=txid_current();
 return result;
end $$;

create function public.write_bucket_cash(request_id uuid,command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached bucket_private.requests; op text:=command->>'op'; rows jsonb:='[]'; r jsonb; c public.cash_activities; ids uuid[]:='{}'; result jsonb; gid uuid;
begin
 perform bucket_private.lock_owner();
 if request_id is null or jsonb_typeof(command)<>'object' then raise exception 'Invalid request'; end if;
 select * into cached from bucket_private.requests where owner=auth.uid() and id=request_id;
 if found then if cached.payload<>command then raise exception 'Idempotency conflict'; end if;return cached.result; end if;
 if op in ('create','transfer','distribute') then
  rows:=command->'rows';
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)=0 then raise exception 'Missing rows'; end if;
  if op='create' and jsonb_array_length(rows)<>1 then raise exception 'Expected one record'; end if;
  for r in select value from jsonb_array_elements(rows) loop
   if exists(select 1 from public.cash_activities where id=(r->>'id')::uuid) then raise exception 'Row ID conflict'; end if;
   if r ?| array['brokerage_entry_id','funding_details','user_id'] then raise exception 'Protected input'; end if;
   if op='create' and coalesce((r->>'is_transfer')::boolean,false) then raise exception 'Use transfer operation'; end if;
   if op='distribute' and (r->>'type' not in ('INCOME','DEPOSIT') or coalesce((r->>'is_transfer')::boolean,false)) then raise exception 'Invalid distribution'; end if;
  end loop;
  if op='transfer' then
   if jsonb_array_length(rows)<>2 or (select count(distinct value->>'bucket_id') from jsonb_array_elements(rows))<>2
    or (select count(distinct value->>'currency') from jsonb_array_elements(rows))<>1
    or not exists(select 1 from jsonb_array_elements(rows) where value->>'type'='WITHDRAW')
    or not exists(select 1 from jsonb_array_elements(rows) where value->>'type'='DEPOSIT')
    or exists(select 1 from jsonb_array_elements(rows) where not coalesce((value->>'is_transfer')::boolean,false) or value->>'bucket_id' is null)
    or (rows->0->>'original_amount')::numeric<>(rows->1->>'original_amount')::numeric then raise exception 'Invalid transfer pair'; end if;
  end if;
 elsif op in ('edit','delete') then
  select * into c from public.cash_activities where id=(command->>'id')::uuid and user_id=auth.uid();
  if not found then raise exception 'Activity not found'; end if;
  if coalesce(c.is_transfer,false) then
   if op='edit' then raise exception 'Reverse transfer and create a new transfer'; end if;
   select group_id into gid from bucket_private.links where cash_id=c.id and owner=auth.uid() and origin='ledger';
   if gid is null then raise exception 'Unlinked legacy activity: audit required'; end if;
   select array_agg(cash_id) into ids from bucket_private.links where group_id=gid and owner=auth.uid() and origin='ledger';
  else ids:=array[c.id]; end if;
  if op='edit' then
   if exists(select 1 from jsonb_object_keys(command->'patch') k where k not in ('category','note','date','type','original_amount','currency','rate_at_time','bucket_id')) then raise exception 'Protected input'; end if;
   if (command->'patch' ? 'rate_at_time' and (command->'patch'->>'rate_at_time')::numeric is distinct from c.rate_at_time)
    or (command->'patch' ? 'currency' and command->'patch'->>'currency' is distinct from c.currency) then raise exception 'Historical FX snapshot is immutable';end if;
   rows:=jsonb_build_array(to_jsonb(c)||(command->'patch'));ids:='{}';
  end if;
 else raise exception 'Unknown cash operation'; end if;
 result:=bucket_private.write_rows(rows,ids,'ledger',case when op='transfer' then request_id else null end);
 insert into bucket_private.requests values(auth.uid(),request_id,command,result);
 return result;
end $$;

create or replace function plan_private.apply_money_check() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.daily_plans; r jsonb; monthly_rule jsonb; ml public.plan_month_locks; b public.money_buckets; dest uuid;
 m date:=date_trunc('month',new.day)::date; today date:=plan_private.today(); state text;
 schedule jsonb; required integer; k text; quota integer; count_group integer; count_total integer; spent bigint;
 minor bigint:=0; balance bigint; target bigint; amount numeric; rate numeric; note text; mode text; method text; legs jsonb; written jsonb;
begin
 -- These are database-derived snapshots, never client inputs. Reset before any
 -- zero-amount/habit early return, including privileged caller insert paths.
 new.cash_id:=null; new.bucket_activity_id:=null;
 new.destination_cash_id:=null; new.destination_activity_id:=null;
 new.source_bucket_id:=null; new.destination_bucket_id:=null;
 new.month_key:=null; new.group_key:=null;
 new.currency:=null; new.money_mode:=null;
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 perform bucket_private.lock_owner();
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
 balance:=bucket_private.native_balance(b.id)*100;
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
 new.cash_id:=gen_random_uuid(); new.bucket_activity_id:=new.cash_id;
 legs:=jsonb_build_array(jsonb_build_object('id',new.cash_id,'portfolio_id',b.portfolio_id,'type',case when mode='saving' then 'WITHDRAW' else 'EXPENSE' end,
 'category','PLAN','note',note,'date',new.day::timestamp at time zone 'Asia/Bangkok','bucket_id',b.id,'is_transfer',mode='saving','currency',b.currency,'rate_at_time',rate,'original_amount',amount));
 if dest is not null then
  new.destination_cash_id:=gen_random_uuid();new.destination_activity_id:=new.destination_cash_id;
  legs:=legs||jsonb_build_array((legs->0)||jsonb_build_object('id',new.destination_cash_id,'bucket_id',dest,'type','DEPOSIT'));
 end if;
 written:=bucket_private.write_rows(legs,'{}','plan');
 return new;
end $$;

create or replace function plan_private.undo_money_check() returns trigger language plpgsql security definer set search_path='' as $$
declare source uuid; p public.daily_plans; begin
 if auth.uid() is null or old.user_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 perform bucket_private.lock_owner();
 select * into p from public.daily_plans where id=old.plan_id and user_id=auth.uid() for update;
 if old.cash_id is not null or old.destination_cash_id is not null then
  perform bucket_private.write_rows('[]',array_remove(array[old.cash_id,old.destination_cash_id],null),'plan');
 end if;
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

-- Statement locks precede row locks for check/undo/edit and use the same owner key.
create function bucket_private.lock_statement() returns trigger language plpgsql security definer set search_path='' as $$
begin perform bucket_private.lock_owner();return null;end $$;
create trigger bucket_owner_plan_checks before insert or update or delete on public.plan_checks for each statement execute function bucket_private.lock_statement();
create trigger bucket_owner_plans before insert or update on public.daily_plans for each statement execute function bucket_private.lock_statement();

CREATE OR REPLACE FUNCTION public.transfer_bucket_to_broker(
  p_transfer_id uuid, p_bucket_id uuid, p_account_id uuid,
  p_source_amount numeric, p_received_amount numeric, p_fee numeric, p_thb_per_usd numeric,
  p_legacy_thb_per_usd numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bucket public.money_buckets%ROWTYPE;
  v_account public.brokerage_accounts%ROWTYPE;
  v_cash public.cash_activities%ROWTYPE;
  v_activity public.bucket_activities%ROWTYPE;
  v_entry public.brokerage_cash_entries%ROWTYPE;
  v_portfolio_name text;
  v_balance numeric;
  v_brokerage_balance numeric;
  v_source_rate numeric;
  v_expected numeric;
  v_details jsonb;
  v_note text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_transfer_id IS NULL OR p_bucket_id IS NULL OR p_account_id IS NULL
    OR p_source_amount IS NULL OR p_received_amount IS NULL OR p_fee IS NULL OR p_thb_per_usd IS NULL OR p_legacy_thb_per_usd IS NULL
    OR p_source_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_received_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_fee::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_thb_per_usd::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_legacy_thb_per_usd::text IN ('NaN', 'Infinity', '-Infinity') OR p_legacy_thb_per_usd <= 0
    OR p_source_amount <= 0 OR p_received_amount <= 0 OR p_fee < 0 OR p_fee >= p_source_amount OR p_thb_per_usd <= 0
    OR p_source_amount <> round(p_source_amount, 2) OR p_received_amount <> round(p_received_amount, 2) OR p_fee <> round(p_fee, 2)
  THEN RAISE EXCEPTION 'Invalid funding amounts or exchange rate'; END IF;

  PERFORM bucket_private.lock_owner();
  -- Serialise transfers using the same bank balance, including duplicate retries.
  SELECT * INTO v_bucket FROM public.money_buckets
    WHERE id = p_bucket_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.portfolios WHERE id = v_bucket.portfolio_id AND user_id = v_user AND kind = 'cash_management'
  ) THEN RAISE EXCEPTION 'Invalid source Bucket'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  SELECT * INTO v_account FROM public.brokerage_accounts
    WHERE id = p_account_id AND user_id = v_user AND kind = 'cash' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid destination cash account'; END IF;
  SELECT name INTO v_portfolio_name FROM public.portfolios
    WHERE id = v_account.portfolio_id AND user_id = v_user AND kind = 'trading';
  IF NOT FOUND OR v_bucket.currency NOT IN ('THB', 'USD') OR v_bucket.currency IS NULL
    OR v_account.currency NOT IN ('THB', 'USD')
  THEN RAISE EXCEPTION 'Unsupported funding accounts'; END IF;

  v_source_rate := CASE WHEN v_bucket.currency = 'USD' THEN 1 ELSE p_thb_per_usd END;
  v_expected := CASE
    WHEN v_bucket.currency = v_account.currency THEN p_source_amount - p_fee
    WHEN v_bucket.currency = 'THB' THEN (p_source_amount - p_fee) / p_thb_per_usd
    ELSE (p_source_amount - p_fee) * p_thb_per_usd END;
  IF abs(round(v_expected, 2) - p_received_amount) > 0.01 THEN
    RAISE EXCEPTION 'Received amount does not match the exchange rate and fee';
  END IF;
  v_details := jsonb_build_object('bucket_id', p_bucket_id, 'account_id', p_account_id,
    'source_currency', v_bucket.currency, 'destination_currency', v_account.currency,
    'source_amount', p_source_amount, 'received_amount', p_received_amount,
    'fee', p_fee, 'thb_per_usd', p_thb_per_usd);

  SELECT * INTO v_cash FROM public.cash_activities WHERE id = p_transfer_id AND user_id = v_user;
  IF FOUND THEN
    IF v_cash.funding_details IS DISTINCT FROM v_details OR v_cash.brokerage_entry_id IS DISTINCT FROM p_transfer_id THEN
      RAISE EXCEPTION 'Transfer ID already used with different amounts';
    END IF;
    SELECT * INTO STRICT v_entry FROM public.brokerage_cash_entries WHERE id = p_transfer_id AND user_id = v_user;
    SELECT * INTO STRICT v_activity FROM public.bucket_activities WHERE id = p_transfer_id AND user_id = v_user;
  ELSE
    -- Match the existing bank ledger, prioritising its original denomination.
    -- Legacy rows in another denomination still use the app's reference rate;
    -- editing this transfer's execution rate must never revalue the source balance.
    v_balance:=bucket_private.native_balance(p_bucket_id);
    IF round(v_balance, 2) < p_source_amount THEN RAISE EXCEPTION 'Insufficient Bucket balance'; END IF;

    v_note := format('Bucket %s → %s · %s | หัก %s %s · รับ %s %s · ค่าธรรมเนียม %s %s',
      v_bucket.name, v_portfolio_name, v_account.name, p_source_amount, v_bucket.currency,
      p_received_amount, v_account.currency, p_fee, v_bucket.currency);
    IF v_bucket.currency <> v_account.currency THEN
      v_note := v_note || format(' · 1 USD = %s THB', p_thb_per_usd);
    END IF;
    v_note := v_note || format(' [funding:%s]', p_transfer_id);
    INSERT INTO public.brokerage_cash_entries (id, user_id, portfolio_id, brokerage_account_id, type, amount, currency, note)
      VALUES (p_transfer_id, v_user, v_account.portfolio_id, p_account_id, 'DEPOSIT', p_received_amount, v_account.currency, v_note)
      RETURNING * INTO v_entry;
    PERFORM bucket_private.write_rows(jsonb_build_array(jsonb_build_object(
      'id',p_transfer_id,'portfolio_id',v_bucket.portfolio_id,'bucket_id',p_bucket_id,'type','WITHDRAW','category','โอนไป '||v_portfolio_name,
      'date',now(),'is_transfer',true,'currency',v_bucket.currency,'rate_at_time',v_source_rate,'original_amount',p_source_amount,
      'note',v_note,'brokerage_entry_id',p_transfer_id,'funding_details',v_details)),'{}','broker');
    SELECT * INTO STRICT v_cash FROM public.cash_activities WHERE id=p_transfer_id;
    SELECT * INTO STRICT v_activity FROM public.bucket_activities WHERE id=p_transfer_id;
  END IF;
  SELECT cash_balance INTO v_brokerage_balance FROM public.brokerage_account_balances WHERE brokerage_account_id = p_account_id;
  RETURN jsonb_build_object('cash_activity', to_jsonb(v_cash), 'bucket_activity', to_jsonb(v_activity),
    'brokerage_entry', to_jsonb(v_entry), 'brokerage_balance', v_brokerage_balance);
END;
$$;


CREATE OR REPLACE FUNCTION public.transfer_broker_to_bucket(p_id uuid,p_account_id uuid,p_bucket_id uuid,p_amount numeric,p_rate numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.brokerage_accounts%ROWTYPE; b public.money_buckets%ROWTYPE; usd numeric; received numeric; note_text text;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_amount IS NULL OR p_rate IS NULL OR p_amount<=0 OR p_rate<=0
    OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_rate::text IN ('NaN','Infinity','-Infinity')
  THEN RAISE EXCEPTION 'Invalid transfer'; END IF;
  PERFORM bucket_private.lock_owner();
  SELECT * INTO b FROM public.money_buckets WHERE id=p_bucket_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR b.currency IS NULL OR b.currency NOT IN ('USD','THB') OR NOT EXISTS(SELECT 1 FROM public.portfolios WHERE id=b.portfolio_id AND user_id=auth.uid() AND kind='cash_management') THEN RAISE EXCEPTION 'Invalid Bucket'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  SELECT * INTO a FROM public.brokerage_accounts WHERE id=p_account_id AND user_id=auth.uid() AND kind='cash' FOR UPDATE;
  IF NOT FOUND OR a.currency NOT IN ('USD','THB') THEN RAISE EXCEPTION 'Invalid broker account'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.id::text,0));
  IF EXISTS(SELECT 1 FROM public.brokerage_cash_entries WHERE id=p_id) THEN
    IF EXISTS(SELECT 1 FROM public.cash_activities WHERE id=p_id AND user_id=auth.uid() AND bucket_id=b.id
      AND funding_details=jsonb_build_object('account_id',a.id,'amount',p_amount,'rate',p_rate)) THEN RETURN true; END IF;
    RAISE EXCEPTION 'Transfer ID conflict';
  END IF;
  IF (SELECT cash_balance FROM public.brokerage_account_balances WHERE brokerage_account_id=a.id)<p_amount THEN RAISE EXCEPTION 'Insufficient brokerage cash'; END IF;
  usd:=p_amount / CASE WHEN a.currency='USD' THEN 1 ELSE p_rate END;
  received:=round(usd * CASE WHEN b.currency='USD' THEN 1 ELSE p_rate END,2);
  IF received<=0 THEN RAISE EXCEPTION 'Received amount too small'; END IF;
  note_text:=format('Broker %s → Bucket %s · %s %s → %s %s',a.name,b.name,p_amount,a.currency,received,b.currency);
  INSERT INTO public.brokerage_cash_entries(id,user_id,portfolio_id,brokerage_account_id,type,amount,currency,note)
    VALUES(p_id,auth.uid(),a.portfolio_id,a.id,'WITHDRAW',p_amount,a.currency,note_text);
  PERFORM bucket_private.write_rows(jsonb_build_array(jsonb_build_object('id',p_id,'portfolio_id',b.portfolio_id,'bucket_id',b.id,'type','DEPOSIT','category','โอนจากโบรก',
    'date',now(),'is_transfer',true,'currency',b.currency,'rate_at_time',CASE WHEN b.currency='USD' THEN 1 ELSE p_rate END,'original_amount',received,'amount',usd,
    'note',note_text,'brokerage_entry_id',p_id,'funding_details',jsonb_build_object('account_id',a.id,'amount',p_amount,'rate',p_rate))),'{}','broker');
  RETURN true;
END; $$;


create or replace function public.delete_broker_cash_movement(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare e public.brokerage_cash_entries; ids uuid[]; begin
 perform bucket_private.lock_owner();
 select * into e from public.brokerage_cash_entries where id=p_id and user_id=auth.uid();
 if not found then return false;end if;
 if e.trade_id is not null then raise exception 'Delete the linked trade instead';end if;
 -- owner -> bucket -> broker advisory -> broker row -> cash entry order
 perform 1 from public.money_buckets where id in (select bucket_id from public.cash_activities where brokerage_entry_id=p_id and user_id=auth.uid()) order by id for update;
 perform pg_advisory_xact_lock(hashtextextended(e.brokerage_account_id::text,0));
 perform 1 from public.brokerage_accounts where id=e.brokerage_account_id for update;
 perform 1 from public.brokerage_cash_entries where id=p_id for update;
 select array_agg(id) into ids from public.cash_activities where brokerage_entry_id=p_id and user_id=auth.uid();
 if cardinality(ids)>0 then perform bucket_private.write_rows('[]',ids,'broker');end if;
 perform set_config('app.allow_brokerage_ledger_mutation','on',true);
 delete from public.brokerage_cash_entries where id=p_id and user_id=auth.uid();
 if exists(select 1 from public.brokerage_account_balances where brokerage_account_id=e.brokerage_account_id and cash_balance<0) then raise exception 'Insufficient brokerage cash';end if;
 perform set_config('app.allow_brokerage_ledger_mutation','off',true);
 return true;
end $$;
-- Funding protection uses an unforgeable private table context, not a client GUC.
create or replace function public.protect_funding_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.brokerage_entry_id is not null and not exists(select 1 from bucket_private.write_context where pid=pg_backend_pid() and tx=txid_current() and owner=auth.uid()) then raise exception 'Manage linked funding from its original source';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

-- Metadata RPC handles opening balance as an explicit ledger event, never cache-only.
create function public.save_cash_bucket(request_id uuid,bucket_id uuid,details jsonb,opening_rate numeric default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.money_buckets; payload jsonb:=jsonb_build_object('op','save_bucket','id',bucket_id,'details',details,'rate',opening_rate); cached bucket_private.requests; opening numeric; begin
 perform bucket_private.lock_owner();
 if request_id is null or bucket_id is null or jsonb_typeof(details) is distinct from 'object' then raise exception 'Invalid request';end if;
 select * into cached from bucket_private.requests where owner=auth.uid() and id=request_id;
 if found then if cached.payload<>payload then raise exception 'Idempotency conflict';end if;return cached.result;end if;
 if exists(select 1 from jsonb_object_keys(details) k where k not in ('name','portfolio_id','currency','current_amount','target_percent','target_amount','color','icon','linked_to_expenses')) then raise exception 'Protected bucket field';end if;
 select * into b from public.money_buckets where id=bucket_id for update;
 if found then
  if b.user_id<>auth.uid() then raise exception 'Unauthorized';end if;
  if (details ? 'current_amount' and (details->>'current_amount')::numeric is distinct from b.current_amount)
   or (details ? 'currency' and details->>'currency' is distinct from b.currency)
   or (details ? 'portfolio_id' and (details->>'portfolio_id')::uuid is distinct from b.portfolio_id) then raise exception 'Use deposit/withdraw to change balance; bucket currency is fixed';end if;
  update public.money_buckets set name=coalesce(details->>'name',name),target_percent=coalesce((details->>'target_percent')::numeric,target_percent),
   target_amount=coalesce((details->>'target_amount')::numeric,target_amount),color=coalesce(details->>'color',color),icon=coalesce(details->>'icon',icon),
   linked_to_expenses=coalesce((details->>'linked_to_expenses')::boolean,linked_to_expenses) where id=bucket_id returning * into b;
 else
  if not exists(select 1 from public.portfolios where id=(details->>'portfolio_id')::uuid and user_id=auth.uid() and kind='cash_management')
   or details->>'currency' is null or details->>'currency' not in ('USD','THB') or nullif(trim(details->>'name'),'') is null then raise exception 'Invalid owned cash portfolio or bucket';end if;
  opening:=coalesce((details->>'current_amount')::numeric,0);
  if opening<0 or opening<>trunc(opening,2) or opening::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid opening amount';end if;
  insert into public.money_buckets(id,user_id,portfolio_id,name,currency,current_amount,target_percent,target_amount,color,icon,linked_to_expenses)
  values(bucket_id,auth.uid(),(details->>'portfolio_id')::uuid,details->>'name',details->>'currency',0,coalesce((details->>'target_percent')::numeric,0),coalesce((details->>'target_amount')::numeric,0),details->>'color',details->>'icon',coalesce((details->>'linked_to_expenses')::boolean,false)) returning * into b;
  if opening>0 then perform bucket_private.write_rows(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'portfolio_id',b.portfolio_id,'bucket_id',b.id,'type','DEPOSIT','category','Opening balance','note','Opening balance','date',now(),'currency',b.currency,'original_amount',opening,'rate_at_time',opening_rate)),'{}','ledger');end if;
  select * into b from public.money_buckets where id=bucket_id;
 end if;
 insert into bucket_private.requests values(auth.uid(),request_id,payload,to_jsonb(b));return to_jsonb(b);
end $$;
create function public.remove_empty_cash_bucket(bucket_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform bucket_private.lock_owner();
 perform 1 from public.money_buckets where id=bucket_id and user_id=auth.uid() for update;
 if not found then return false;end if;
 if exists(select 1 from public.cash_activities where cash_activities.bucket_id=remove_empty_cash_bucket.bucket_id)
 or exists(select 1 from public.bucket_activities where bucket_activities.bucket_id=remove_empty_cash_bucket.bucket_id)
 or exists(select 1 from public.plan_system_buckets where plan_system_buckets.bucket_id=remove_empty_cash_bucket.bucket_id)
 or bucket_private.native_balance(bucket_id)<>0 then raise exception 'Bucket has financial history; cannot delete';end if;
 insert into bucket_private.write_context values(pg_backend_pid(),txid_current(),auth.uid());
 delete from public.money_buckets where id=bucket_id and user_id=auth.uid();
 delete from bucket_private.write_context where pid=pg_backend_pid() and tx=txid_current();return true;
end $$;

-- Final activation: writers above are ready before grants/guards close old paths.
create trigger atomic_cash_gate before insert or update or delete on public.cash_activities for each row execute function bucket_private.guard_write();
create trigger atomic_bucket_activity_gate before insert or update or delete on public.bucket_activities for each row execute function bucket_private.guard_write();
create trigger atomic_bucket_balance_gate before insert or update or delete on public.money_buckets for each row execute function bucket_private.guard_write();
revoke insert,update,delete,truncate on public.cash_activities,public.bucket_activities,public.money_buckets from public,anon,authenticated;
-- Remove column-level grants too; table REVOKE alone does not revoke these.
do $$ declare t text; cols text; begin
 foreach t in array array['cash_activities','bucket_activities','money_buckets'] loop
  select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
  execute format('revoke insert (%s),update (%s) on public.%I from public,anon,authenticated',cols,cols,t);
 end loop;
end $$;
revoke all on all functions in schema bucket_private from public,anon,authenticated;
revoke all on function public.write_bucket_cash(uuid,jsonb),public.save_cash_bucket(uuid,uuid,jsonb,numeric),public.remove_empty_cash_bucket(uuid) from public,anon;
grant execute on function public.write_bucket_cash(uuid,jsonb),public.save_cash_bucket(uuid,uuid,jsonb,numeric),public.remove_empty_cash_bucket(uuid) to authenticated;
revoke all on function public.transfer_bucket_to_broker(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric),public.transfer_broker_to_bucket(uuid,uuid,uuid,numeric,numeric),public.delete_broker_cash_movement(uuid) from public,anon;
grant execute on function public.transfer_bucket_to_broker(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric),public.transfer_broker_to_bucket(uuid,uuid,uuid,numeric,numeric),public.delete_broker_cash_movement(uuid) to authenticated;
revoke all on function public.protect_funding_activity() from public,anon,authenticated;
commit;
