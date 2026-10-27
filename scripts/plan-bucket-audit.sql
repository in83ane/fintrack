-- READ ONLY: run against the intended copy/project in SQL Editor or psql.
-- Owner sessions see only their RLS-visible rows; use an authorized admin for
-- a project-wide audit. Does not repair balances, guess FX or change any data.
begin transaction read only;

with rows as (
 select b.id bucket_id,b.user_id,b.portfolio_id,b.currency bucket_currency,b.current_amount,
  a.id activity_id,a.type,a.original_amount,a.currency,
  a.id is not null and (a.original_amount is null
   or a.original_amount::text in ('NaN','Infinity','-Infinity')
   or a.currency is distinct from b.currency
   or a.original_amount<>trunc(a.original_amount,2)
   or a.user_id is distinct from b.user_id) unresolved,
  a.id is not null and (a.type is null or a.type not in ('INCOME','DEPOSIT','EXPENSE','WITHDRAW')) unknown_type,
  case when a.original_amount is not null
    and a.original_amount::text not in ('NaN','Infinity','-Infinity')
    and a.currency=b.currency and a.user_id=b.user_id
   then case when a.type in ('INCOME','DEPOSIT') then a.original_amount
             when a.type in ('EXPENSE','WITHDRAW') then -a.original_amount end end signed_native
 from public.money_buckets b left join public.cash_activities a on a.bucket_id=b.id
), totals as (
 select bucket_id,user_id,portfolio_id,bucket_currency,current_amount,
  count(activity_id) activity_count,count(*) filter(where unresolved) unresolved_count,
  count(*) filter(where unknown_type) unknown_type_count,
  coalesce(sum(signed_native),0) known_cash_subtotal
 from rows group by bucket_id,user_id,portfolio_id,bucket_currency,current_amount
), audit as (
 select *,case when unresolved_count=0 and unknown_type_count=0
   then known_cash_subtotal end expected_current_amount
 from totals
)
select *,case when expected_current_amount is not null
 then current_amount-expected_current_amount end difference,
 expected_current_amount is not null and current_amount is distinct from expected_current_amount balance_mismatch
from audit where unresolved_count>0 or unknown_type_count>0
 or (expected_current_amount is not null and current_amount is distinct from expected_current_amount)
order by user_id,bucket_id;

-- Detail: no note/email fields. Multiple reasons may apply to the same row.
select a.id activity_id,a.bucket_id,b.user_id,b.currency bucket_currency,
 a.type,a.currency,a.original_amount,a.rate_at_time,
 array_remove(array[
  case when a.original_amount is null then 'original_amount_null' end,
  case when a.currency is distinct from b.currency then 'currency_mismatch' end,
  case when a.original_amount<>trunc(a.original_amount,2) then 'sub_cent' end,
  case when a.original_amount::text in ('NaN','Infinity','-Infinity') then 'non_finite' end,
  case when a.type is null or a.type not in ('INCOME','DEPOSIT','EXPENSE','WITHDRAW') then 'unknown_type' end,
  case when a.user_id is distinct from b.user_id then 'owner_mismatch' end
 ],null) reasons
from public.cash_activities a join public.money_buckets b on b.id=a.bucket_id
where a.original_amount is null or a.currency is distinct from b.currency
 or a.original_amount<>trunc(a.original_amount,2)
 or a.original_amount::text in ('NaN','Infinity','-Infinity')
 or a.type is null or a.type not in ('INCOME','DEPOSIT','EXPENSE','WITHDRAW')
 or a.user_id is distinct from b.user_id
order by b.user_id,a.bucket_id,a.id;

commit;
