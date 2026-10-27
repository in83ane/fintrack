import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(path.join(os.tmpdir(),'fintrack-plan-db-qa/package.json'));
const {PGlite}=require('@electric-sql/pglite');
export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',bucket='33333333-3333-4333-8333-333333333333';
export const sql=file=>readFileSync(file,'utf8');
export async function planDatabase({phase2=true,testClock=true}={}){
 const db=new PGlite();
 await db.exec(`
 set time zone 'Asia/Bangkok';
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;
 grant execute on function auth.uid() to authenticated,service_role;
 create table public.portfolios(id uuid primary key,user_id uuid,kind text);
 insert into public.portfolios values('44444444-4444-4444-8444-444444444444','${owner}','cash_management');
 create table public.money_buckets(id uuid primary key default gen_random_uuid(),user_id uuid,portfolio_id uuid default '44444444-4444-4444-8444-444444444444',name text,currency text,current_amount numeric default 0);
 create table public.cash_activities(id uuid primary key default gen_random_uuid(),user_id uuid,portfolio_id uuid,type text,amount numeric,category text,note text,date timestamptz,bucket_id uuid,is_transfer boolean,currency text,rate_at_time numeric,original_amount numeric,created_at timestamptz default now());
 create table public.bucket_activities(id uuid primary key default gen_random_uuid(),user_id uuid,portfolio_id uuid,bucket_id uuid,type text,amount numeric,note text,date timestamptz,currency text,rate_at_time numeric,original_amount numeric);
 grant select,insert,update,delete on money_buckets,cash_activities,bucket_activities to authenticated;
 alter table money_buckets enable row level security; alter table cash_activities enable row level security; alter table bucket_activities enable row level security;
 create policy owner on money_buckets for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy owner on cash_activities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy owner on bucket_activities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 insert into auth.users values('${owner}'),('${other}');
 insert into money_buckets(id,user_id,name,currency,current_amount) values('${bucket}','${owner}','QA','THB',1000);
 insert into cash_activities(user_id,bucket_id,type,amount,original_amount,currency,rate_at_time,date) values('${owner}','${bucket}','INCOME',1000/34.0,1000,'THB',34,now());
 `);
 await db.exec(sql('supabase/migrations/014_enforce_cash_management_bucket_boundary.sql'));
 await db.exec(sql('supabase/migrations/20261027070148_daily_plans.sql'));
 await db.exec(sql('supabase/migrations/20261027070606_plan_monthly_targets.sql'));

 await db.exec(sql('supabase/migrations/20261027075524_plan_recurrence_rules.sql'));
 await db.exec(sql('supabase/migrations/20261027081807_plan_monthly_recurrence_guard.sql'));
 if(phase2)await db.exec(sql('supabase/migrations/20261027084140_plan_atomic_money.sql'));
 // Test-only clock substitution: clients cannot call or replace this private helper.
 if(phase2&&testClock)await db.exec("create or replace function plan_private.today() returns date language sql stable set search_path='' as $$select coalesce(nullif(current_setting('test.today',true),''),'2026-10-27')::date$$");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.exec('set role authenticated');
 return db;
}
