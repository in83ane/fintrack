-- ============================================================================
-- FinTrack - Create All Tables Script
-- ============================================================================
-- Run this ENTIRE script in Supabase SQL Editor to set up all tables
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    language TEXT DEFAULT 'th',
    currency TEXT DEFAULT 'USD',
    timezone TEXT DEFAULT 'Asia/Bangkok',
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    registration_ip INET,
    device_fingerprint TEXT,
    user_agent TEXT,
    security_nonce TEXT,
    account_status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert during signup" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow insert during signup" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. ASSETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    asset_type TEXT DEFAULT 'stock',
    value_usd DECIMAL(15, 2) NOT NULL DEFAULT 0,
    quantity DECIMAL(15, 6) DEFAULT 0,
    avg_purchase_price DECIMAL(15, 2),
    current_price DECIMAL(15, 2),
    change_24h DECIMAL(5, 2),
    change_percentage DECIMAL(5, 2),
    allocation_target DECIMAL(5, 2) DEFAULT 0,
    allocation_current DECIMAL(5, 2) DEFAULT 0,
    sector TEXT,
    country TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_favorite BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own assets" ON public.assets;
DROP POLICY IF EXISTS "Users can manage own assets" ON public.assets;

CREATE POLICY "Users can view own assets" ON public.assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own assets" ON public.assets FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_assets_user_id ON public.assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON public.assets(symbol);
CREATE INDEX IF NOT EXISTS idx_assets_sort_order ON public.assets(sort_order);

DROP TRIGGER IF EXISTS update_assets_updated_at ON public.assets;
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON public.assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. TRADES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    asset_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DIVIDEND')),
    amount_usd DECIMAL(15, 2) NOT NULL,
    quantity DECIMAL(15, 6) NOT NULL,
    price_at_execution DECIMAL(15, 6) NOT NULL,
    currency TEXT DEFAULT 'USD',
    exchange_rate_at_time DECIMAL(10, 4) DEFAULT 1,
    fees DECIMAL(10, 2) DEFAULT 0,
    taxes DECIMAL(10, 2) DEFAULT 0,
    total_cost DECIMAL(15, 2),
    profit_loss DECIMAL(15, 2),
    profit_loss_percentage DECIMAL(5, 2),
    execution_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settlement_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'completed',
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own trades" ON public.trades;
DROP POLICY IF EXISTS "Users can manage own trades" ON public.trades;

CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own trades" ON public.trades FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_asset_id ON public.trades(asset_id);
CREATE INDEX IF NOT EXISTS idx_trades_execution_date ON public.trades(execution_date);

DROP TRIGGER IF EXISTS update_trades_updated_at ON public.trades;
CREATE TRIGGER update_trades_updated_at
    BEFORE UPDATE ON public.trades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ALLOCATIONS TABLE (simplified from allocation_targets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value DECIMAL(10, 2) DEFAULT 0,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, label)
);

ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own allocations" ON public.allocations;
DROP POLICY IF EXISTS "Users can manage own allocations" ON public.allocations;

CREATE POLICY "Users can view own allocations" ON public.allocations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own allocations" ON public.allocations FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_allocations_user_id ON public.allocations(user_id);

-- ============================================================================
-- 5. MONEY_BUCKETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.money_buckets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_percent DECIMAL(5, 2) DEFAULT 0,
    current_amount DECIMAL(15, 2) DEFAULT 0,
    color TEXT,
    icon TEXT,
    linked_to_expenses BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.money_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own money_buckets" ON public.money_buckets;
DROP POLICY IF EXISTS "Users can manage own money_buckets" ON public.money_buckets;

CREATE POLICY "Users can view own money_buckets" ON public.money_buckets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own money_buckets" ON public.money_buckets FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_money_buckets_user_id ON public.money_buckets(user_id);

-- ============================================================================
-- 6. BUCKET_ACTIVITIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bucket_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bucket_id UUID REFERENCES public.money_buckets(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'income_split', 'invest', 'profit_split')),
    amount DECIMAL(15, 2) NOT NULL,
    note TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.bucket_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bucket_activities" ON public.bucket_activities;
DROP POLICY IF EXISTS "Users can manage own bucket_activities" ON public.bucket_activities;

CREATE POLICY "Users can view own bucket_activities" ON public.bucket_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own bucket_activities" ON public.bucket_activities FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bucket_activities_user_id ON public.bucket_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_bucket_activities_bucket_id ON public.bucket_activities(bucket_id);

-- ============================================================================
-- 7. CASH_ACTIVITIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cash_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    amount DECIMAL(15, 2) NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.cash_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cash_activities" ON public.cash_activities;
DROP POLICY IF EXISTS "Users can manage own cash_activities" ON public.cash_activities;

CREATE POLICY "Users can view own cash_activities" ON public.cash_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own cash_activities" ON public.cash_activities FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cash_activities_user_id ON public.cash_activities(user_id);

-- ============================================================================
-- Function: Create profile on user signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- End of Script
-- ============================================================================
