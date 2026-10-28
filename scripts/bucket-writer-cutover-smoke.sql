-- Synthetic fixture inside a deliberately rolled-back subtransaction.
-- Run as the migration operator. No fixture, receipt or auth user survives.
-- Not a signed-JWT/PostgREST or concurrent-session test.
do $$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
 portfolio_id uuid:=gen_random_uuid(); wallet_id uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); cash_id uuid:=gen_random_uuid(); command jsonb;
 first_result jsonb; second_result jsonb; observed numeric; message text;
begin
 begin
  insert into auth.users(id) values(owner_id),(other_id);
  insert into public.portfolios(id,user_id,name,kind) values(portfolio_id,owner_id,'Transient writer verification','cash_management');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.save_cash_bucket(gen_random_uuid(),wallet_id,
   jsonb_build_object('name','Transient writer verification','portfolio_id',portfolio_id,'currency','THB','current_amount',1000),35);
  command:=jsonb_build_object('op','create','rows',jsonb_build_array(jsonb_build_object(
   'id',cash_id,'portfolio_id',portfolio_id,'bucket_id',wallet_id,'type','EXPENSE',
   'original_amount',153,'currency','THB','rate_at_time',35,'date',now(),'category','QA','note','Transient verification')));
  first_result:=public.write_bucket_cash(request_id,command);
  second_result:=public.write_bucket_cash(request_id,command);
  if first_result is distinct from second_result then raise exception 'SMOKE_IDEMPOTENCY_FAILED'; end if;
  select current_amount into observed from public.money_buckets where id=wallet_id;
  if observed is distinct from 847::numeric then raise exception 'SMOKE_BALANCE_FAILED'; end if;
  if (select count(*) from public.cash_activities where bucket_id=wallet_id)<>2
   or (select count(*) from public.bucket_activities where bucket_id=wallet_id)<>2 then
   raise exception 'SMOKE_ROWS_FAILED';
  end if;
  begin
   perform public.write_bucket_cash(gen_random_uuid(),jsonb_set(jsonb_set(command,
    '{rows,0,id}',to_jsonb(gen_random_uuid()::text)),'{rows,0,original_amount}','848'));
   raise exception 'SMOKE_OVERSPEND_ACCEPTED' using errcode='XX000';
  exception when sqlstate 'P0001' then
   get stacked diagnostics message=message_text;
   if message<>'Insufficient bucket balance' then raise; end if;
  end;
  begin
   update public.money_buckets set current_amount=9999 where id=wallet_id;
   raise exception 'SMOKE_DIRECT_WRITE_ACCEPTED' using errcode='XX000';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
  if exists(select 1 from public.money_buckets where id=wallet_id) then raise exception 'SMOKE_RLS_OWNER_LEAK'; end if;
  begin
   perform public.write_bucket_cash(gen_random_uuid(),jsonb_set(command,'{rows,0,id}',to_jsonb(gen_random_uuid()::text)));
   raise exception 'SMOKE_FOREIGN_WRITE_ACCEPTED' using errcode='XX000';
  exception when sqlstate 'P0001' then
   get stacked diagnostics message=message_text;
   if message<>'Invalid owned bucket' then raise; end if;
  end;
  -- Only this private sentinel is swallowed; all failed assertions abort migration.
  raise exception 'ROLLBACK_SYNTHETIC_SMOKE' using errcode='ZR001';
 exception when sqlstate 'ZR001' then null;
 end;
 if exists(select 1 from auth.users where id in (owner_id,other_id))
  or exists(select 1 from public.portfolios where id=portfolio_id)
  or exists(select 1 from public.money_buckets where id=wallet_id)
  or exists(select 1 from public.cash_activities where id=cash_id)
  or exists(select 1 from bucket_private.requests where owner in (owner_id,other_id))
  or exists(select 1 from bucket_private.write_context where owner in (owner_id,other_id)) then
  raise exception 'SMOKE_ROLLBACK_FAILED';
 end if;
end $$;
