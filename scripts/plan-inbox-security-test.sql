-- Rollback-only verification. No user balances or notification history persist from this test.
begin;
do $$ declare a uuid; b uuid; port uuid; bucket uuid:=gen_random_uuid(); alert uuid:=gen_random_uuid(); begin
 select id into a from auth.users order by created_at limit 1;
 select id into b from auth.users where id<>a order by created_at limit 1;
 select id into port from public.portfolios where user_id=a and kind='cash_management' limit 1;
 if a is null or b is null or port is null then raise exception 'Two accounts and a cash portfolio required'; end if;
 perform set_config('test.owner',a::text,true);perform set_config('test.other',b::text,true);perform set_config('test.bucket',bucket::text,true);perform set_config('test.port',port::text,true);
 insert into public.money_buckets(id,user_id,portfolio_id,name,currency,current_amount) values(bucket,a,port,'QA PLAN rollback','THB',1000);
 insert into public.cash_activities(user_id,portfolio_id,type,amount,original_amount,currency,rate_at_time,bucket_id,category,date) values(a,port,'INCOME',1000/34.0,1000,'THB',34,bucket,'QA',now());
 insert into public.price_email_alerts(id,user_id,symbol,target_price,currency,direction) values(alert,a,'QA',100,'USD','above');
 update public.price_email_alerts set status='triggered',current_price=101,triggered_at=now() where id=alert;
 update public.price_email_alerts set checked_at=now() where id=alert;
 if (select count(*) from public.account_notifications where id='price:'||alert)<>1 then raise exception 'Inbox event not exactly once'; end if;
 perform set_config('test.notification','price:'||alert,true);
 insert into public.account_notifications(user_id,id,title,message,type) values(b,'qa-other','other','private','system');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true) is not null as owner_set;
do $$ declare plan uuid; habit uuid; expense uuid; d date:=(now() at time zone 'Asia/Bangkok')::date; begin
 if exists(select from public.account_notifications where id='qa-other') then raise exception 'Cross-account inbox leak'; end if;
 update public.account_notifications set read=true where id=current_setting('test.notification');
 if not exists(select from public.account_notifications where id=current_setting('test.notification') and read) then raise exception 'Read state not saved'; end if;
 begin delete from public.account_notifications;raise exception 'History deletion allowed';exception when insufficient_privilege then null;end;
 insert into public.daily_plans(name,amount,bucket_id,starts_on,ends_on) values('QA goal',100,current_setting('test.bucket')::uuid,d-10,d+10) returning id into plan;
 perform set_config('test.plan',plan::text,true);
 insert into public.plan_checks(plan_id,day) values(plan,d);
 select cash_id into expense from public.plan_checks where plan_id=plan and day=d;
 if (select original_amount from public.cash_activities where id=expense)<>100 then raise exception 'Expense missing'; end if;
 if (select current_amount from public.money_buckets where id=current_setting('test.bucket')::uuid)<>900 then raise exception 'Wrong debit'; end if;
 begin insert into public.plan_checks(plan_id,day) values(plan,d);raise exception 'Duplicate check accepted';exception when unique_violation then null;end;
 if (select current_amount from public.money_buckets where id=current_setting('test.bucket')::uuid)<>900 then raise exception 'Double debit'; end if;
 begin update public.cash_activities set original_amount=1 where id=expense;raise exception 'Linked expense editable';exception when raise_exception then if sqlerrm<>'Manage this linked expense from PLAN' then raise;end if;end;
 delete from public.plan_checks where plan_id=plan and day=d;
 if exists(select from public.cash_activities where id=expense) or (select current_amount from public.money_buckets where id=current_setting('test.bucket')::uuid)<>1000 then raise exception 'Undo not atomic'; end if;
 insert into public.daily_plans(name,starts_on,ends_on) values('QA habit',d,d+10) returning id into habit;
 insert into public.plan_checks(plan_id,day) values(habit,d);
 if exists(select from public.plan_checks where plan_id=habit and cash_id is not null) then raise exception 'Habit moved money'; end if;
 begin insert into public.plan_checks(plan_id,day) values(habit,d+1);raise exception 'Future date accepted';exception when raise_exception then if sqlerrm<>'Date outside plan or in the future' then raise;end if;end;
 insert into public.daily_plans(name,amount,bucket_id,starts_on,ends_on) values('QA insufficient',1001,current_setting('test.bucket')::uuid,d,d) returning id into habit;
 begin insert into public.plan_checks(plan_id,day) values(habit,d);raise exception 'Overdraft accepted';exception when raise_exception then if sqlerrm<>'Insufficient bucket balance' then raise;end if;end;
 if exists(select from public.plan_checks where plan_id=habit) then raise exception 'Failed debit left tick'; end if;
 -- A short month segment allocates every cent, then all checks can be undone.
 insert into public.daily_plans(name,amount,amount_period,bucket_id,starts_on,ends_on) values('QA monthly',100,'month',current_setting('test.bucket')::uuid,date_trunc('month',d)::date,date_trunc('month',d)::date+2) returning id into habit;
 insert into public.plan_checks(plan_id,day) select habit,date_trunc('month',d)::date+i from generate_series(0,2) i;
 if (select sum(amount) from public.plan_checks where plan_id=habit)<>100 then raise exception 'Monthly cents do not sum to target'; end if;
 if (select count(*) from public.plan_checks where plan_id=habit and amount=33.33)<>2 then raise exception 'Wrong per-day allocation'; end if;
 delete from public.plan_checks where plan_id=habit;
 if (select current_amount from public.money_buckets where id=current_setting('test.bucket')::uuid)<>1000 then raise exception 'Monthly reversal drift'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true) is not null as other_set;
do $$ begin
 if exists(select from public.daily_plans where id=current_setting('test.plan')::uuid) then raise exception 'Plan isolation failed'; end if;
 begin insert into public.plan_checks(plan_id,day) values(current_setting('test.plan')::uuid,current_date);raise exception 'Cross-owner check allowed';exception when raise_exception then if sqlerrm<>'Plan unavailable' then raise;end if;end;
end $$;
rollback;
select 'PASS: durable inbox, read state, account isolation, atomic debit/undo, duplicate clicks, future days, insufficient funds, habit-only goals' as result;
