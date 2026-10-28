-- Safe verification: all test rows are rolled back, no emails are sent.
begin;
do $$ declare a uuid; b uuid; one uuid:=gen_random_uuid(); two uuid:=gen_random_uuid(); three uuid:=gen_random_uuid(); result jsonb; begin
 select id into a from auth.users order by created_at limit 1;
 select id into b from auth.users where id<>a order by created_at limit 1;
 if a is null or b is null then raise exception 'Need two existing accounts for isolation test'; end if;
 perform set_config('test.email_owner',a::text,true);
 perform set_config('test.email_other',b::text,true);
 perform set_config('test.email_one',one::text,true);
 perform set_config('test.email_two',two::text,true);
 perform set_config('test.email_three',three::text,true);
 insert into public.price_email_alerts(id,user_id,symbol,target_price,currency,direction,status,next_attempt_at) values
 (one,a,'TEST',100,'USD','above','pending',now()),(two,a,'TEST',100,'USD','above','pending',now()),(three,b,'TEST',100,'USD','below','active',null);
 -- Reserve once and return the identical immutable payload on retries.
 result:=public.reserve_price_email(one,'{"subject":"first"}'::jsonb);
 if result->>'subject'<>'first' then raise exception 'Reservation failed'; end if;
 result:=public.reserve_price_email(one,'{"subject":"changed"}'::jsonb);
 if result->>'subject'<>'first' then raise exception 'Payload changed across retries'; end if;
 if (select count(*) from public.price_email_budget where alert_id=one)<>1 then raise exception 'Duplicate budget reservation'; end if;
 -- Consume only test quota inside this transaction. Exceeding the cap must skip and reserve nothing.
 insert into public.price_email_budget(alert_id) select gen_random_uuid() from generate_series(1,100);
 result:=public.reserve_price_email(two,'{}'::jsonb);
 if result is not null or (select status from public.price_email_alerts where id=two)<>'skipped' then raise exception 'Daily cap failed'; end if;
 if exists(select from public.price_email_budget where alert_id=two) then raise exception 'Over-cap reservation'; end if;
 -- Move only our test rows outside the 24h window and verify the 31-day cap independently.
 update public.price_email_budget set reserved_at=now()-interval '2 days' where reserved_at>=transaction_timestamp();
 insert into public.price_email_budget(alert_id,reserved_at) select gen_random_uuid(),now()-interval '2 days' from generate_series(1,3000);
 update public.price_email_alerts set status='pending' where id=two;
 result:=public.reserve_price_email(two,'{}'::jsonb);
 if result is not null or (select status from public.price_email_alerts where id=two)<>'skipped' then raise exception 'Monthly cap failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.email_owner'),true) is not null as claims_set;
do $$ declare new_id uuid; begin
 insert into public.price_email_alerts(symbol,target_price,currency,direction) values('TEST',100,'THB','above') returning id into new_id;
 if new_id is null or not exists(select from public.price_email_alerts where id=new_id and user_id=current_setting('test.email_owner')::uuid) then raise exception 'Default owner/id insert failed'; end if;
 delete from public.price_email_alerts where id=new_id;
 if (select count(*) from public.price_email_alerts where id in (current_setting('test.email_one')::uuid,current_setting('test.email_two')::uuid,current_setting('test.email_three')::uuid))<>2 then raise exception 'Owner isolation failed'; end if;
 begin
   insert into public.price_email_alerts(user_id,symbol,target_price,currency,direction) values(current_setting('test.email_other')::uuid,'TEST',100,'USD','above');
   raise exception 'Cross-owner insert unexpectedly permitted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.price_email_alerts(id,symbol,target_price,currency,direction) values(gen_random_uuid(),'TEST',100,'USD','above');
   raise exception 'Client can reuse deleted alert IDs';
 exception when insufficient_privilege then null; end;
 begin
   update public.price_email_alerts set status='sent' where id=current_setting('test.email_one')::uuid;
   raise exception 'Client can change delivery status';
 exception when insufficient_privilege then null; end;
 begin
   perform public.reserve_price_email(current_setting('test.email_one')::uuid,'{}');
   raise exception 'Client can reserve quota';
 exception when insufficient_privilege then null; end;
 begin
   perform * from public.price_email_worker;
   raise exception 'Client can read worker token hash';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.price_email_alerts(symbol,target_price,currency,direction) values('TEST',100,'JPY','above');
   raise exception 'JPY accepted';
 exception when check_violation then null; end;
 delete from public.price_email_alerts where id=current_setting('test.email_three')::uuid;
 if exists(select from public.price_email_alerts where id=current_setting('test.email_three')::uuid) then raise exception 'Unexpected visibility'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select from public.price_email_alerts where id=current_setting('test.email_three')::uuid) then raise exception 'Cross-user delete succeeded'; end if;
end $$;
rollback;
select 'PASS: daily/monthly hard caps, immutable payload, owner RLS, privileged worker boundaries, currency validation' as result;
