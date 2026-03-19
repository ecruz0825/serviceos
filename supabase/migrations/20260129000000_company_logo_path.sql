-- Migration: Add logo_path column to companies table for logo storage
-- Stores the storage path for company logos uploaded to Supabase Storage

BEGIN;

-- Add logo_path column to companies table (nullable, stores storage path)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_path text;

-- Note: RLS policies for companies table should already allow admin updates
-- If companies table has RLS enabled, ensure admin users can update logo_path
-- (This assumes existing RLS patterns allow company admins to update their company)

COMMIT;

