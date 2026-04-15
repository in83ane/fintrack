-- ============================================================================
-- FinTrack Essential Schema (Minimal Setup)
-- ============================================================================
-- ใช้สำหรับ setup เบื้องต้น เน้นแค่ส่วนที่จำเป็นสำหรับ Authentication
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE (extends auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    language TEXT DEFAULT 'th',
    currency TEXT DEFAULT 'USD',
    email_verified BOOLEAN DEFAULT FALSE,
    account_status TEXT DEFAULT 'active',
    registration_ip INET,
    device_fingerprint TEXT,
    user_agent TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert during signup" ON public.profiles;

-- RLS Policies
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Allow insert during signup"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- ============================================================================
-- 2. AUDIT_LOGS TABLE (security logging)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow service role to insert audit logs" ON public.audit_logs;

CREATE POLICY "Users can view own audit logs"
    ON public.audit_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Allow service role to insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (true);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- Index for faster queries
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on profiles
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
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
        NOW(),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- AUTH CONFIGURATION (Run these in Supabase Dashboard SQL Editor)
-- ============================================================================

-- Enable Email Confirmation (recommended for production)
-- Go to: Authentication > Providers > Email
-- Enable "Confirm email" checkbox

-- Configure Email Templates
-- Go to: Authentication > Email Templates

-- Site URL Configuration
-- Go to: Authentication > URL Configuration
-- Set Site URL to: http://localhost:3000 (for development)
-- Add Redirect URLs:
--   - http://localhost:3000/auth/callback
--   - http://localhost:3000/reset-password

-- ============================================================================
-- TEST USERS (Optional - Remove in production)
-- ============================================================================

-- สร้าง test user (ถ้าต้องการ test เร็วๆ)
-- หมายเหตุ: ต้อง enable pgcrypto extension ก่อน

-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- INSERT INTO auth.users (
--     instance_id,
--     id,
--     aud,
--     role,
--     email,
--     encrypted_password,
--     email_confirmed_at,
--     created_at,
--     updated_at,
--     confirmation_token,
--     email_change,
--     email_change_token_new,
--     recovery_token
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000000',
--     gen_random_uuid(),
--     'authenticated',
--     'authenticated',
--     'test@example.com',
--     crypt('Test1234!', gen_salt('bf')),
--     NOW(),
--     NOW(),
--     NOW(),
--     '',
--     '',
--     '',
--     ''
-- );

-- ============================================================================
-- END OF ESSENTIAL SCHEMA
-- ============================================================================
