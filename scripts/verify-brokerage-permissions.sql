-- Run in Supabase SQL Editor. All fixtures are rolled back; no financial
-- records persist. Exercise the web client's role, not administrator rights.
begin;
select set_config('request.jwt.claims', json_build_object('sub',user_id,'role','authenticated')::text,true), set_config('request.jwt.claim.sub',user_id::text,true)
from public.brokerage_accounts where kind='cash' and currency='USD' limit 1;
set local role authenticated;
do $test$
declare a public.brokerage_accounts%rowtype; t uuid:=gen_random_uuid(); base numeric; bal numeric; rejected boolean:=false;
begin
 if current_user <> 'authenticated' then raise exception 'wrong test role'; end if;
 select * into strict a from public.brokerage_accounts where user_id=auth.uid() and kind='cash' and currency='USD' limit 1;
 select cash_balance into base from public.brokerage_account_balances where brokerage_account_id=a.id;
 insert into public.brokerage_cash_entries(user_id,portfolio_id,brokerage_account_id,type,amount,currency,note) values(a.user_id,a.portfolio_id,a.id,'DEPOSIT',1000,'USD','rollback permission verification');
 insert into public.trades(id,user_id,portfolio_id,brokerage_account_id,asset_name,symbol,type,quantity,price_at_execution,amount_usd,original_amount,currency) values(t,a.user_id,a.portfolio_id,a.id,'Verification','CODEXPERMTEST','BUY',2,10,20,20,'USD');
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base-980)>0.000001 then raise exception 'buy cash mismatch'; end if;
 if not exists(select 1 from public.assets where user_id=auth.uid() and portfolio_id=a.portfolio_id and symbol='CODEXPERMTEST' and quantity=2) then raise exception 'buy holding mismatch'; end if;
 perform public.replace_brokerage_trade(t,'CODEXPERMTEST',now(),3,10,30,30);
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base-970)>0.000001 then raise exception 'edit cash mismatch'; end if;
 begin
 perform public.replace_brokerage_trade(t,'CODEXPERMTEST',now(),100000000,10,1000000000,1000000000);
 exception when others then
 if SQLERRM like '%Insufficient%' then rejected:=true; else raise; end if;
 end;
 if not rejected then raise exception 'insufficient funds accepted'; end if;
 perform public.delete_trade_with_brokerage_cash(t);
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base-1000)>0.000001 then raise exception 'delete cash mismatch'; end if;
 if exists(select 1 from public.trades where id=t) then raise exception 'trade survived deletion'; end if;
end $test$;
select current_user as tested_role, 'PASS: insert, projection, edit, insufficient funds, delete, cash reversal' as result;
rollback;
