-- Migration: Add DIVIDEND type to trades check constraint
-- Run this in Supabase SQL Editor AFTER creating the trades table

-- First, check if trades table exists
DO $$
BEGIN
  -- Only proceed if trades table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'trades'
  ) THEN
    -- Drop the existing constraint
    ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_type_check;

    -- Add the updated constraint with DIVIDEND
    ALTER TABLE public.trades
    ADD CONSTRAINT trades_type_check
    CHECK (type IN ('BUY', 'SELL', 'DIVIDEND'));
  END IF;
END $$;
