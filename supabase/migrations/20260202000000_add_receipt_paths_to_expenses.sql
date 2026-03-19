BEGIN;

-- =============================================================================
-- Add Multi-Page Receipt Support to Expenses
-- - Add receipt_paths text[] column for storing multiple receipt images
-- - Keeps receipt_path as legacy single-receipt field for backward compatibility
-- =============================================================================

-- Add receipt_paths column (text array) for multi-page receipts
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_paths text[] NULL;

COMMIT;

