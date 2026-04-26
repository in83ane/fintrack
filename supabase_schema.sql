-- ==============================================================================
-- FINTRACK DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- ==============================================================================

-- 1. Profiles Table (Provided by User)
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

-- Profile Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE
update on profiles for EACH row
execute FUNCTION update_updated_at_column ();

-- Trigger to auto-create profile on signup
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
-- 2. Assets Table (For Live Portfolio Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  shares DECIMAL(20, 8) NOT NULL DEFAULT 0,
  avg_cost DECIMAL(20, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol) -- One summary row per symbol per user
);

CREATE TRIGGER update_assets_updated_at BEFORE
UPDATE ON assets FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 3. Trades Table (Transaction Ledger)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.trades (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  amount_usd DECIMAL(20, 4) NOT NULL,
  shares DECIMAL(20, 8),           -- Quantity received for this specific trade
  price_per_unit DECIMAL(20, 4),   -- Execution price for this specific trade
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  rate_at_time DECIMAL(10, 4) DEFAULT 1,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. Allocations Table (User Custom Portfolio Ratios)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.allocations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value DECIMAL(5, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#ADC6FF',
  UNIQUE(user_id, label)
);

-- ==============================================================================
-- 5. Money Buckets Table (Budget Management)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.money_buckets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  current_amount DECIMAL(20, 4) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#ADC6FF',
  icon TEXT NOT NULL DEFAULT '📦',
  linked_to_expenses BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_money_buckets_updated_at BEFORE
UPDATE ON money_buckets FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 6. Bucket Activities Table (Money Bucket Transaction Log)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bucket_activities (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_id BIGINT NOT NULL REFERENCES public.money_buckets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'income_split', 'invest', 'profit_split')),
  amount DECIMAL(20, 4) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. Cash Activities Table (Income/Expense Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cash_activities (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount DECIMAL(20, 4) NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read and update their own profile
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
