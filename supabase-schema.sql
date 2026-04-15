-- ============================================================================
-- FinTrack Supabase Database Schema
-- ============================================================================
-- Run this SQL in Supabase SQL Editor to set up all required tables
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE (extends auth.users)
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

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert during signup" ON public.profiles;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Allow insert during signup"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. ASSETS TABLE (user's portfolio assets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    asset_type TEXT DEFAULT 'stock', -- stock, crypto, bond, etf, cash, etc.
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own assets" ON public.assets;
DROP POLICY IF EXISTS "Users can manage own assets" ON public.assets;

CREATE POLICY "Users can view own assets"
    ON public.assets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own assets"
    ON public.assets FOR ALL
    USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_assets_user_id ON public.assets(user_id);
CREATE INDEX idx_assets_symbol ON public.assets(symbol);

-- ============================================================================
-- 3. TRADES TABLE (transaction history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    asset_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
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

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own trades" ON public.trades;
DROP POLICY IF EXISTS "Users can manage own trades" ON public.trades;

CREATE POLICY "Users can view own trades"
    ON public.trades FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own trades"
    ON public.trades FOR ALL
    USING (auth.uid() = user_id);

CREATE INDEX idx_trades_user_id ON public.trades(user_id);
CREATE INDEX idx_trades_asset_id ON public.trades(asset_id);
CREATE INDEX idx_trades_execution_date ON public.trades(execution_date);

-- ============================================================================
-- 4. ALLOCATION_TARGETS TABLE (portfolio allocation settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.allocation_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    category TEXT NOT NULL, -- Equities, Fixed Income, Alternatives, Cash
    target_percentage DECIMAL(5, 2) NOT NULL CHECK (target_percentage >= 0 AND target_percentage <= 100),
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.allocation_targets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own allocation targets" ON public.allocation_targets;
DROP POLICY IF EXISTS "Users can manage own allocation targets" ON public.allocation_targets;

CREATE POLICY "Users can view own allocation targets"
    ON public.allocation_targets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own allocation targets"
    ON public.allocation_targets FOR ALL
    USING (auth.uid() = user_id);

CREATE INDEX idx_allocation_targets_user_id ON public.allocation_targets(user_id);

-- ============================================================================
-- 5. AUDIT_LOGS TABLE (security audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- LOGIN_SUCCESS, LOGIN_FAILED, REGISTRATION_SUCCESS, etc.
    email TEXT,
    ip_address INET,
    device_fingerprint TEXT,
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    session_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow service role to insert audit logs" ON public.audit_logs;

-- Only users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
    ON public.audit_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert audit logs
CREATE POLICY "Allow service role to insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (true);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ============================================================================
-- 6. RATE_LIMITS TABLE (optional: persistent rate limiting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier TEXT NOT NULL, -- IP or email hash
    type TEXT NOT NULL, -- LOGIN, REGISTER, PASSWORD_RESET, OAUTH
    attempts INTEGER DEFAULT 0,
    first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(identifier, type)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policy
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;

-- Service role only
CREATE POLICY "Service role can manage rate limits"
    ON public.rate_limits FOR ALL
    USING (true);

CREATE INDEX idx_rate_limits_identifier ON public.rate_limits(identifier);
CREATE INDEX idx_rate_limits_type ON public.rate_limits(type);

-- ============================================================================
-- 7. SESSIONS TABLE (active sessions tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    refresh_token_hash TEXT,
    ip_address INET,
    device_fingerprint TEXT,
    user_agent TEXT,
    device_info JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;

CREATE POLICY "Users can view own sessions"
    ON public.sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
    ON public.sessions FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_token ON public.sessions(token_hash);

-- ============================================================================
-- 8. PASSWORD_RESETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- Drop existing policy
DROP POLICY IF EXISTS "Service role can manage password resets" ON public.password_resets;

CREATE POLICY "Service role can manage password resets"
    ON public.password_resets FOR ALL
    USING (true);

-- ============================================================================
-- 9. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- email, sms, push
    category TEXT NOT NULL, -- security, trade, alert, system
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON public.trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_allocation_targets_updated_at BEFORE UPDATE ON public.allocation_targets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limits_updated_at BEFORE UPDATE ON public.rate_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create profile after user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        avatar_url,
        registration_ip,
        device_fingerprint,
        user_agent,
        security_nonce,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        (NEW.raw_user_meta_data->>'registration_ip')::INET,
        NEW.raw_user_meta_data->>'device_fingerprint',
        NEW.raw_user_meta_data->>'user_agent',
        NEW.raw_user_meta_data->>'security_nonce',
        NOW(),
        NOW()
    );

    -- Create default allocation targets
    INSERT INTO public.allocation_targets (user_id, label, category, target_percentage, color, sort_order) VALUES
        (NEW.id, 'Equities', 'Equities', 60, '#ADC6FF', 1),
        (NEW.id, 'Fixed Income', 'Fixed Income', 25, '#E9C349', 2),
        (NEW.id, 'Alternatives', 'Alternatives', 10, '#4EDEA3', 3),
        (NEW.id, 'Cash', 'Cash', 5, '#6B7280', 4);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to calculate portfolio metrics
CREATE OR REPLACE FUNCTION calculate_portfolio_value(p_user_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    total DECIMAL;
BEGIN
    SELECT COALESCE(SUM(value_usd), 0) INTO total
    FROM public.assets
    WHERE user_id = p_user_id AND is_active = TRUE;
    RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- INSERT DEFAULT DATA (Optional)
-- ============================================================================

-- Add a test user (optional - remove in production)
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
-- VALUES (
--     uuid_generate_v4(),
--     'test@example.com',
--     crypt('password123', gen_salt('bf')),
--     NOW(),
--     NOW(),
--     NOW(),
--     '{"provider":"email","providers":["email"]}',
--     '{"full_name":"Test User"}'
-- );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_targets TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, DELETE ON public.sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;

-- Grant sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- VIEWS (Optional - for reporting)
-- ============================================================================

-- Portfolio summary view
CREATE OR REPLACE VIEW public.portfolio_summary AS
SELECT
    user_id,
    COUNT(*) as total_assets,
    SUM(value_usd) as total_value,
    SUM(CASE WHEN change_24h > 0 THEN value_usd * change_24h / 100 ELSE 0 END) as day_gain,
    SUM(CASE WHEN change_24h < 0 THEN value_usd * ABS(change_24h) / 100 ELSE 0 END) as day_loss
FROM public.assets
WHERE is_active = TRUE
GROUP BY user_id;

-- Monthly trade summary view
CREATE OR REPLACE VIEW public.monthly_trade_summary AS
SELECT
    user_id,
    DATE_TRUNC('month', execution_date) as month,
    COUNT(*) as total_trades,
    SUM(CASE WHEN type = 'BUY' THEN amount_usd ELSE 0 END) as total_buys,
    SUM(CASE WHEN type = 'SELL' THEN amount_usd ELSE 0 END) as total_sells,
    SUM(CASE WHEN type = 'SELL' THEN profit_loss ELSE 0 END) as total_profit_loss
FROM public.trades
GROUP BY user_id, DATE_TRUNC('month', execution_date)
ORDER BY month DESC;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
