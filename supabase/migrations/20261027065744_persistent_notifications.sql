-- Keep the existing scheduler/alert IDs; delivery now goes to the account inbox only.
alter table public.price_email_alerts drop constraint price_email_alerts_status_check;
alter table public.price_email_alerts add constraint price_email_alerts_status_check check (status in ('active','pending','sent','failed','skipped','triggered'));
alter table public.price_email_alerts add column source_key text;
create unique index price_alert_source on public.price_email_alerts(user_id,source_key) where source_key is not null;
grant insert(source_key) on public.price_email_alerts to authenticated;

create table public.account_notifications (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id text not null default gen_random_uuid()::text,
 title text not null check(length(title)<=500),
 message text not null check(length(message)<=4000),
 type text not null check(type in ('price','system','trade','rebalance')),
 created_at timestamptz not null default now(),
 read boolean not null default false,
 primary key(user_id,id)
);
alter table public.account_notifications enable row level security;
revoke all on public.account_notifications from anon,authenticated;
grant select on public.account_notifications to authenticated;
grant insert(user_id,id,title,message,type,created_at,read), update(read) on public.account_notifications to authenticated;
grant all on public.account_notifications to service_role;
create policy notification_read on public.account_notifications for select to authenticated using ((select auth.uid())=user_id);
create policy notification_create on public.account_notifications for insert to authenticated with check ((select auth.uid())=user_id);
create policy notification_mark on public.account_notifications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy notification_worker on public.account_notifications for all to service_role using(true) with check(true);
create index notification_history on public.account_notifications(user_id,created_at desc,id desc);
create index notification_unread on public.account_notifications(user_id,created_at desc) where not read;

-- Runs in the same transaction as the price hit; neither a crash nor a retry can lose/duplicate it.
create function public.capture_price_notification() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status in ('pending','triggered') and old.status='active' then
  insert into public.account_notifications(user_id,id,title,message,type,created_at)
  values(new.user_id,'price:'||new.id,
    case when new.locale='th' then 'ถึงราคาแจ้งเตือน: ' else 'Price target reached: ' end||new.symbol,
    new.currency||' '||round(new.current_price,4)::text||case when new.direction='above' then ' ≥ ' else ' ≤ ' end||new.target_price::text||case when new.note<>'' then ' · '||new.note else '' end,
    'price',coalesce(new.triggered_at,now())) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.capture_price_notification() from public,anon,authenticated;
create trigger capture_price_notification after update on public.price_email_alerts for each row execute function public.capture_price_notification();

-- Preserve already detected events as history, including pending email attempts.
insert into public.account_notifications(user_id,id,title,message,type,created_at)
select user_id,'price:'||id,case when locale='th' then 'ถึงราคาแจ้งเตือน: ' else 'Price target reached: ' end||symbol,
 currency||' '||coalesce(current_price,target_price)::text||case when direction='above' then ' ≥ ' else ' ≤ ' end||target_price::text,'price',triggered_at
from public.price_email_alerts where triggered_at is not null on conflict do nothing;
update public.price_email_alerts set status='triggered',next_attempt_at=null where status='pending';
