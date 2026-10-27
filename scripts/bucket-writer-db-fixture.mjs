import {planDatabase,sql,owner,bucket} from './plan-phase2-db-fixture.mjs';
export {owner,bucket};
export const portfolio='44444444-4444-4444-8444-444444444444';
export async function writerDatabase(){
 const db=await planDatabase();await db.exec('reset role');
 await db.exec(`alter table portfolios add column name text default 'QA';
 alter table money_buckets add column target_percent numeric default 0,add column target_amount numeric default 0,add column color text,add column icon text,add column linked_to_expenses boolean default false;
 create table brokerage_accounts(id uuid primary key,user_id uuid,portfolio_id uuid,name text,currency text,kind text default 'cash');
 create table brokerage_cash_entries(id uuid primary key,user_id uuid,portfolio_id uuid,brokerage_account_id uuid,type text,amount numeric(20,6),currency text,trade_id uuid,note text,occurred_at timestamptz default now());
 grant select on brokerage_accounts,brokerage_cash_entries to authenticated;
 alter table brokerage_cash_entries enable row level security;
 create policy own_cash on brokerage_cash_entries for select to authenticated using(user_id=auth.uid());
 create view brokerage_account_balances as select a.id brokerage_account_id,a.user_id,a.portfolio_id,coalesce(sum(case when e.type in ('DEPOSIT','TRADE_SELL','ADJUSTMENT') then e.amount else -e.amount end),0) cash_balance from brokerage_accounts a left join brokerage_cash_entries e on a.id=e.brokerage_account_id group by a.id;
 `);
 await db.exec(`alter table cash_activities alter amount type numeric(18,4),alter original_amount type numeric(18,4);
 alter table bucket_activities alter amount type numeric(18,4),alter original_amount type numeric(18,4);
 alter table money_buckets alter current_amount type numeric(18,4);`);
 await db.exec(sql('supabase/migrations/018_bucket_broker_transfers.sql'));
 const brokerValidation=sql('supabase/migrations/013_portfolio_roles_and_brokerage_accounts.sql').split('CREATE OR REPLACE FUNCTION public.validate_brokerage_cash_entry()')[1].split('CREATE OR REPLACE FUNCTION public.prevent_brokerage_cash_entry_mutation()')[0];
 await db.exec('CREATE OR REPLACE FUNCTION public.validate_brokerage_cash_entry()'+brokerValidation);
 await db.exec('grant truncate on money_buckets,cash_activities,bucket_activities to authenticated;grant update(current_amount) on money_buckets to authenticated;');
 const guard=sql('supabase/migrations/020_correct_brokerage_trade_deletions.sql').split('CREATE OR REPLACE FUNCTION public.delete_trade_with_brokerage_cash')[0];
 await db.exec(guard+`create trigger prevent_broker_mutation before update or delete on brokerage_cash_entries for each row execute function prevent_brokerage_cash_entry_mutation();`);
 await db.exec(sql('supabase/migrations/20261027131636_bucket_atomic_writer.sql'));
 await db.exec('set role authenticated');return db;
}
