BEGIN;

-- =============================================================================
-- Drop logo_url Column from companies Table (OPTIONAL)
-- =============================================================================
-- WARNING: This migration is OPTIONAL and should only be run after:
-- 1. Verifying no runtime code uses logo_url
-- 2. Verifying no external systems depend on logo_url
-- 3. Running the SQL check queries to see if any data exists
-- 4. Backing up the database
-- 
-- This migration is idempotent (safe to run multiple times)
-- =============================================================================

-- Check if column exists before dropping (idempotent)
DO $$
BEGIN
  -- Check if logo_url column exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'logo_url'
  ) THEN
    -- Drop the column
    ALTER TABLE public.companies
      DROP COLUMN logo_url;
    
    RAISE NOTICE 'Dropped logo_url column from companies table';
  ELSE
    RAISE NOTICE 'logo_url column does not exist in companies table (already dropped or never existed)';
  END IF;
END $$;

COMMIT;
