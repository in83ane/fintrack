-- Migration: Add missing columns to assets table
-- Run this in Supabase SQL Editor to add is_favorite and sort_order columns

-- Add is_favorite column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'assets'
    AND column_name = 'is_favorite'
  ) THEN
    ALTER TABLE public.assets ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add sort_order column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'assets'
    AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE public.assets ADD COLUMN sort_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create index for sort_order
CREATE INDEX IF NOT EXISTS idx_assets_sort_order ON public.assets(sort_order);
