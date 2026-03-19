BEGIN;

-- =============================================================================
-- Rename Legacy record_payment Overload
-- Resolves PGF7F23 "Could not choose the best candidate function" error
-- =============================================================================
-- The 5-parameter version (without invoice_id) conflicts with the 6-parameter
-- version (with invoice_id). We rename the old one to record_payment_legacy
-- to eliminate the ambiguity.
-- =============================================================================

-- Use DO block to check if function exists before renaming (PostgreSQL doesn't support ALTER FUNCTION IF EXISTS)
DO $$
DECLARE
  v_func_exists boolean;
BEGIN
  -- Check if the 5-parameter function exists
  -- We look for: uuid, numeric, text, text, text (5 parameters total)
  -- Using pg_get_function_identity_arguments to match the exact signature
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'record_payment'
      AND p.pronargs = 5  -- 5 parameters
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, numeric, text, text, text'
  ) INTO v_func_exists;

  -- If the 5-parameter function exists, rename it
  IF v_func_exists THEN
    -- Rename the legacy 5-parameter function
    ALTER FUNCTION public.record_payment(uuid, numeric, text, text, text)
      RENAME TO record_payment_legacy;
    
    -- Grant execute permissions on the renamed function
    GRANT EXECUTE ON FUNCTION public.record_payment_legacy(uuid, numeric, text, text, text) TO authenticated;
    
    RAISE NOTICE 'Renamed record_payment (5-parameter) to record_payment_legacy';
  ELSE
    RAISE NOTICE 'Legacy 5-parameter record_payment function not found - may have already been renamed or never existed';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If function doesn't exist, ALTER will fail - catch and ignore
    RAISE NOTICE 'Legacy function not found or already renamed: %', SQLERRM;
END $$;

COMMIT;
