-- ==============================================================================
-- FINTRACK DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Updated: 2026-04-27
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- HELPER FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- ==============================================================================
-- 1. PROFILES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid not null,
  email text not null,
  full_name text null,
  avatar_url text null,
  language text null default 'th'::text,
  currency text null default 'USD'::text,
  email_verified boolean null default false,
  account_status text null default 'active'::text,
  registration_ip inet null,
  device_fingerprint text null,
  user_agent text null,
  last_login_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE TRIGGER update_profiles_updated_at BEFORE
update on profiles for EACH row
execute FUNCTION update_updated_at_column ();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 2. ASSETS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  name text not null,
  symbol text not null,
  asset_type text null default 'stock'::text,
  value_usd numeric(15, 2) not null default 0,
  quantity numeric(15, 6) null default 0,
  avg_purchase_price numeric(15, 2) null,
  current_price numeric(15, 2) null,
  change_24h numeric(5, 2) null,
  change_percentage numeric(5, 2) null,
  allocation_target numeric(5, 2) null default 0,
  allocation_current numeric(5, 2) null default 0,
  sector text null,
  country text null,
  notes text null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  is_favorite boolean null default false,
  sort_order integer null default 0,
  constraint assets_pkey primary key (id),
  constraint assets_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_assets_user_id ON public.assets USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_assets_sort_order ON public.assets USING btree (sort_order) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON public.assets USING btree (symbol) TABLESPACE pg_default;

CREATE TRIGGER update_assets_updated_at BEFORE
update on assets for EACH row
execute FUNCTION update_updated_at_column ();

-- ==============================================================================
-- 3. TRADES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.trades (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  asset_id uuid null,
  asset_name text not null,
  symbol text not null,
  type text not null,
  amount_usd numeric(15, 2) not null,
  quantity numeric(15, 6) not null,
  price_at_execution numeric(15, 6) not null,
  currency text null default 'USD'::text,
  exchange_rate_at_time numeric(10, 4) null default 1,
  fees numeric(10, 2) null default 0,
  taxes numeric(10, 2) null default 0,
  total_cost numeric(15, 2) null,
  profit_loss numeric(15, 2) null,
  profit_loss_percentage numeric(5, 2) null,
  execution_date timestamp with time zone null default now(),
  settlement_date timestamp with time zone null,
  status text null default 'completed'::text,
  notes text null,
  tags text[] null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint trades_pkey primary key (id),
  constraint trades_asset_id_fkey foreign KEY (asset_id) references assets (id) on delete set null,
  constraint trades_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint trades_type_check check (
    type = any (array['BUY'::text, 'SELL'::text, 'DIVIDEND'::text])
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_trades_asset_id ON public.trades USING btree (asset_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_trades_execution_date ON public.trades USING btree (execution_date) TABLESPACE pg_default;

CREATE TRIGGER update_trades_updated_at BEFORE
update on trades for EACH row
execute FUNCTION update_updated_at_column ();

-- ==============================================================================
-- 4. ALLOCATIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.allocations (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  label text not null,
  value numeric(10, 2) null default 0,
  color text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint allocations_pkey primary key (id),
  constraint allocations_user_id_label_key unique (user_id, label),
  constraint allocations_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_allocations_user_id ON public.allocations USING btree (user_id) TABLESPACE pg_default;

-- ==============================================================================
-- 5. MONEY BUCKETS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.money_buckets (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  name text not null,
  target_percent numeric(5, 2) null default 0,
  current_amount numeric(15, 2) null default 0,
  color text null,
  icon text null,
  linked_to_expenses boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  target_amount numeric(15, 2) null default 0,
  constraint money_buckets_pkey primary key (id),
  constraint money_buckets_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_money_buckets_user_id ON public.money_buckets USING btree (user_id) TABLESPACE pg_default;

CREATE TRIGGER update_money_buckets_updated_at BEFORE
update on money_buckets for EACH row
execute FUNCTION update_updated_at_column ();

-- ==============================================================================
-- 6. BUCKET ACTIVITIES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bucket_activities (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  bucket_id uuid null,
  type text not null,
  amount numeric(15, 2) not null,
  note text null,
  date timestamp with time zone not null default now(),
  created_at timestamp with time zone null default now(),
  constraint bucket_activities_pkey primary key (id),
  constraint bucket_activities_bucket_id_fkey foreign KEY (bucket_id) references money_buckets (id) on delete CASCADE,
  constraint bucket_activities_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint bucket_activities_type_check check (
    type = any (
      array[
        'deposit'::text,
        'withdraw'::text,
        'income_split'::text,
        'invest'::text,
        'profit_split'::text
      ]
    )
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_bucket_activities_user_id ON public.bucket_activities USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_bucket_activities_bucket_id ON public.bucket_activities USING btree (bucket_id) TABLESPACE pg_default;

-- ==============================================================================
-- 7. CASH ACTIVITIES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cash_activities (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  type text not null,
  amount numeric(15, 2) not null,
  category text not null,
  note text null,
  date timestamp with time zone not null default now(),
  created_at timestamp with time zone null default now(),
  constraint cash_activities_pkey primary key (id),
  constraint cash_activities_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint cash_activities_type_check check (
    type = any (array['INCOME'::text, 'EXPENSE'::text])
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_cash_activities_user_id ON public.cash_activities USING btree (user_id) TABLESPACE pg_default;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bucket_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_activities ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Assets Policies
CREATE POLICY "Users can manage own assets" ON assets
  FOR ALL USING (auth.uid() = user_id);

-- Trades Policies
CREATE POLICY "Users can manage own trades" ON trades
  FOR ALL USING (auth.uid() = user_id);

-- Allocations Policies
CREATE POLICY "Users can manage own allocations" ON allocations
  FOR ALL USING (auth.uid() = user_id);

-- Money Buckets Policies
CREATE POLICY "Users can manage own money buckets" ON money_buckets
  FOR ALL USING (auth.uid() = user_id);

-- Bucket Activities Policies
CREATE POLICY "Users can manage own bucket activities" ON bucket_activities
  FOR ALL USING (auth.uid() = user_id);

-- Cash Activities Policies
CREATE POLICY "Users can manage own cash activities" ON cash_activities
  FOR ALL USING (auth.uid() = user_id);
