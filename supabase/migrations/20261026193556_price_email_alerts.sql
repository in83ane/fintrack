-- Email alerts are independent of browser tabs. Only the worker may change delivery state.
create table public.price_email_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.^=/-]{1,32}$'),
  target_price numeric not null check (target_price > 0 and target_price < 1000000000000),
  currency text not null check (currency in ('USD','THB')),
  direction text not null check (direction in ('above','below')),
  locale text not null default 'en' check (locale in ('en','th')),
  note text not null default '' check (length(note) <= 240),
  status text not null default 'active' check (status in ('active','pending','sent','failed','skipped')),
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  quote_at timestamptz,
  current_price numeric,
  triggered_at timestamptz,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  payload jsonb
);
alter table public.price_email_alerts enable row level security;
revoke all on public.price_email_alerts from anon, authenticated;
grant select, delete on public.price_email_alerts to authenticated;
grant insert (id,user_id,symbol,target_price,currency,direction,locale,note) on public.price_email_alerts to authenticated;
grant all on public.price_email_alerts to service_role;
create policy email_alert_read on public.price_email_alerts for select to authenticated using ((select auth.uid())=user_id);
create policy email_alert_create on public.price_email_alerts for insert to authenticated with check ((select auth.uid())=user_id);
create policy email_alert_delete on public.price_email_alerts for delete to authenticated using ((select auth.uid())=user_id);
create index price_email_alert_user on public.price_email_alerts(user_id);
create index price_email_alert_work on public.price_email_alerts(status, checked_at) where status in ('active','pending');

create function public.limit_price_email_alerts() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 20261027));
  if (select count(*) from public.price_email_alerts where user_id=new.user_id and status in ('active','pending')) >= 20 then
    raise exception 'Maximum 20 active email alerts per account';
  end if;
  return new;
end $$;
revoke all on function public.limit_price_email_alerts() from public, anon, authenticated;
create trigger limit_price_email_alerts before insert on public.price_email_alerts for each row execute function public.limit_price_email_alerts();

-- No client access. Reservations survive alert deletion so quotas cannot be reset.
create table public.price_email_budget (alert_id uuid primary key, reserved_at timestamptz not null default now());
alter table public.price_email_budget enable row level security;
revoke all on public.price_email_budget from anon, authenticated;
grant all on public.price_email_budget to service_role;
create index price_email_budget_time on public.price_email_budget(reserved_at);

create table public.price_email_worker (
  id boolean primary key default true check(id),
  token_hash text not null,
  lease_id uuid,
  lease_until timestamptz not null default '-infinity',
  last_run_at timestamptz,
  configured boolean not null default false
);
alter table public.price_email_worker enable row level security;
revoke all on public.price_email_worker from anon, authenticated;
grant all on public.price_email_worker to service_role;
-- The scheduler token is generated within Postgres; neither plaintext nor service keys enter migrations/logs.
do $$ declare token text := gen_random_uuid()::text || gen_random_uuid()::text; begin
  perform vault.create_secret(token, 'fintrack_price_alert_worker', 'Price alert scheduler only');
  insert into public.price_email_worker(id,token_hash) values(true,encode(sha256(convert_to(token,'UTF8')),'hex'));
end $$;

create function public.reserve_price_email(p_id uuid, p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row_data public.price_email_alerts; begin
  perform pg_catalog.pg_advisory_xact_lock(20261027, 1);
  select * into row_data from public.price_email_alerts where id=p_id and status='pending' for update;
  if not found then return null; end if;
  if row_data.payload is not null then return row_data.payload; end if;
  if (select count(*) from public.price_email_budget where reserved_at >= now()-interval '24 hours') >= 100
     or (select count(*) from public.price_email_budget where reserved_at >= now()-interval '31 days') >= 3000 then
    update public.price_email_alerts set status='skipped',last_error='free_quota_reached',next_attempt_at=null where id=p_id;
    return null;
  end if;
  insert into public.price_email_budget(alert_id) values(p_id) on conflict do nothing;
  update public.price_email_alerts set payload=p_payload,first_attempt_at=now() where id=p_id;
  return p_payload;
end $$;
revoke all on function public.reserve_price_email(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_price_email(uuid,jsonb) to service_role;
