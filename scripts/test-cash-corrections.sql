-- Authenticated integration tests; all fixtures roll back.
begin;
select set_config('request.jwt.claims',json_build_object('sub',user_id,'role','authenticated')::text,true), set_config('request.jwt.claim.sub',user_id::text,true)
from public.brokerage_accounts where kind='cash' and currency='USD' limit 1;
set local role authenticated;
do $test$
declare a public.brokerage_accounts%rowtype; b public.money_buckets%rowtype;
 d uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); buy_id uuid:=gen_random_uuid(); sell_id uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); base numeric; bal numeric; rejected boolean:=false;
begin
 select * into strict a from public.brokerage_accounts where user_id=auth.uid() and kind='cash' and currency='USD' limit 1;
 insert into public.portfolios(user_id,name,kind) values(auth.uid(),'Rollback fixture','cash_management') returning id into j;
 insert into public.money_buckets(user_id,portfolio_id,name,currency) values(auth.uid(),j,'Rollback fixture','THB') returning * into b;
 j:=gen_random_uuid();
 select cash_balance into base from public.brokerage_account_balances where brokerage_account_id=a.id;
 insert into public.brokerage_cash_entries(id,user_id,portfolio_id,brokerage_account_id,type,amount,currency) values(d,a.user_id,a.portfolio_id,a.id,'DEPOSIT',1000,'USD');
 perform public.transfer_broker_to_bucket(x,a.id,b.id,100,33);
 perform public.transfer_broker_to_bucket(x,a.id,b.id,100,33);
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base-900)>0.000001 then raise exception 'transfer/idempotency failed'; end if;
 if not exists(select 1 from public.cash_activities where id=x and original_amount=case when b.currency='USD' then 100 else 3300 end) then raise exception 'bucket conversion failed'; end if;
 perform public.delete_broker_cash_movement(x);
 if exists(select 1 from public.cash_activities where id=x) or exists(select 1 from public.bucket_activities where id=x) then raise exception 'linked deletion failed'; end if;
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base-1000)>0.000001 then raise exception 'reversal failed'; end if;
 begin
   perform public.transfer_broker_to_bucket(gen_random_uuid(),a.id,b.id,bal+1,33);
 exception when others then
   if SQLERRM like '%Insufficient%' then rejected:=true; else raise; end if;
 end;
 if not rejected then raise exception 'overspend allowed'; end if;
 insert into public.trades(id,user_id,portfolio_id,brokerage_account_id,asset_name,symbol,type,quantity,price_at_execution,amount_usd,original_amount,currency,tags) values
 (buy_id,a.user_id,a.portfolio_id,a.id,'Verification','CORRECTIONTEST','BUY',1,10,10,10,'USD',ARRAY['DCA entry 987654321']),
 (sell_id,a.user_id,a.portfolio_id,a.id,'Verification','CORRECTIONTEST','SELL',1,12,12,12,'USD',ARRAY['DCA partial exit from entry 987654321']);
 insert into public.trade_journal(id,user_id,portfolio_id,symbol,market,timeframe,status,entries) values(j,a.user_id,a.portfolio_id,'CORRECTIONTEST','US','DAY','CLOSED',jsonb_build_array(jsonb_build_object('level',987654321,'trade_id',buy_id)));
 perform public.delete_trade_journal_transactions(j);
 if exists(select 1 from public.trades where id in (buy_id,sell_id)) or exists(select 1 from public.trade_journal where id=j) then raise exception 'journal deletion failed'; end if;
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base-1000)>0.000001 then raise exception 'journal cash reversal failed'; end if;
 perform public.delete_broker_cash_movement(d);
 select cash_balance into bal from public.brokerage_account_balances where brokerage_account_id=a.id;
 if abs(bal-base)>0.000001 then raise exception 'deposit reversal failed'; end if;
end $test$;
select 'PASS: transfer, retry, FX, linked reversal, insufficient funds, journal/trades/cash deletion' as result;
rollback;
