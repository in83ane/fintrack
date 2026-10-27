-- READ ONLY. Run after the new migration on a disposable copy, plus
-- scripts/plan-bucket-audit.sql. Findings do not repair or match any rows.
select c.id cash_id,c.bucket_id,c.user_id,c.date,
 case when l.cash_id is null then 'unlinked_legacy'
 when l.owner is distinct from c.user_id then 'link_owner_mismatch'
 when c.bucket_id is not null and a.id is null then 'missing_mirror'
 else 'mirror_mismatch' end issue
from public.cash_activities c left join bucket_private.links l on l.cash_id=c.id
left join public.bucket_activities a on a.id=l.activity_id
where l.cash_id is null or l.owner is distinct from c.user_id
 or (c.bucket_id is not null and (a.id is null or a.user_id is distinct from c.user_id
  or a.bucket_id is distinct from c.bucket_id or a.portfolio_id is distinct from c.portfolio_id
  or a.currency is distinct from c.currency or a.original_amount is distinct from c.original_amount
  or a.amount is distinct from c.original_amount or a.rate_at_time is distinct from c.rate_at_time
  or a.type is distinct from case when c.type in ('INCOME','DEPOSIT') then 'deposit' else 'withdraw' end))
order by c.user_id,c.bucket_id,c.date,c.id;

select a.id activity_id,a.bucket_id,a.user_id,'unlinked_bucket_activity' issue
from public.bucket_activities a left join bucket_private.links l on l.activity_id=a.id
where l.cash_id is null order by a.user_id,a.bucket_id,a.id;

-- These security result sets must be empty for anon/authenticated.
select r.role_name,c.relname,p.privilege
from (values('anon'),('authenticated')) r(role_name)
cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)
cross join pg_class c
where c.oid in ('public.cash_activities'::regclass,'public.bucket_activities'::regclass,'public.money_buckets'::regclass)
and has_table_privilege(r.role_name,c.oid,p.privilege);

select r.role_name,c.relname,a.attname,p.privilege
from (values('anon'),('authenticated')) r(role_name)
cross join (values('INSERT'),('UPDATE')) p(privilege)
cross join pg_attribute a join pg_class c on c.oid=a.attrelid
where c.oid in ('public.cash_activities'::regclass,'public.bucket_activities'::regclass,'public.money_buckets'::regclass)
and a.attnum>0 and not a.attisdropped and has_column_privilege(r.role_name,c.oid,a.attnum,p.privilege);

select n.nspname,p.proname,r.role_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join (values('anon'),('authenticated')) r(role_name)
where n.nspname in ('bucket_private','plan_private') and has_function_privilege(r.role_name,p.oid,'EXECUTE');

select n.nspname,r.role_name from pg_namespace n cross join (values('anon'),('authenticated')) r(role_name)
where n.nspname in ('bucket_private','plan_private') and has_schema_privilege(r.role_name,n.oid,'USAGE');
