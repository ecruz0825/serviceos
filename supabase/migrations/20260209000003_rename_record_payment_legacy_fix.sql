BEGIN;

-- =============================================================================
-- Fix: Rename Legacy record_payment Overload (OID-based detection)
-- Resolves PGF7F23 "Could not choose the best candidate function" error
-- =============================================================================
-- The previous migration didn't detect the 5-parameter function correctly.
-- This migration uses proargtypes OID matching to reliably find and rename
-- the legacy 5-parameter version (without invoice_id).
-- =============================================================================

-- Use DO block to find and rename the 5-parameter function by OID types
DO $$
DECLARE
  v_func_oid oid;
BEGIN
  -- Find the 5-parameter function by matching OID types directly
  -- OIDs: uuid=2950, numeric=1700, text=25
  -- We're looking for: uuid, numeric, text, text, text (5 parameters)
  SELECT p.oid INTO v_func_oid
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'record_payment'
    AND p.pronargs = 5  -- Must have exactly 5 parameters
    AND p.proargtypes::oidvector = '2950 1700 25 25 25'::oidvector;  -- uuid, numeric, text, text, text

  -- If the 5-parameter function exists, rename it
  IF v_func_oid IS NOT NULL THEN
    -- Rename the legacy 5-parameter function
    ALTER FUNCTION public.record_payment(uuid, numeric, text, text, text)
      RENAME TO record_payment_legacy;
    
    -- Grant execute permissions on the renamed function
    GRANT EXECUTE ON FUNCTION public.record_payment_legacy(uuid, numeric, text, text, text) TO authenticated;
    
    RAISE NOTICE 'Successfully renamed record_payment (5-parameter) to record_payment_legacy';
  ELSE
    -- Check if it was already renamed
    SELECT p.oid INTO v_func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'record_payment_legacy'
      AND p.pronargs = 5
      AND p.proargtypes::oidvector = '2950 1700 25 25 25'::oidvector;
    
    IF v_func_oid IS NOT NULL THEN
      RAISE NOTICE 'record_payment_legacy already exists - rename was already completed';
    ELSE
      RAISE NOTICE 'Legacy 5-parameter record_payment function not found - may not exist';
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the migration
    RAISE WARNING 'Error during rename operation: %', SQLERRM;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERY (run manually after migration):
-- =============================================================================
-- SELECT 
--   proname,
--   pg_get_function_identity_arguments(oid) as arguments,
--   pronargs as param_count,
--   proargtypes::regtype[] as param_types
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND proname IN ('record_payment', 'record_payment_legacy')
-- ORDER BY proname, pronargs;
--
-- Expected result:
-- - record_payment: 6 parameters (uuid, numeric, text, text, text, uuid)
-- - record_payment_legacy: 5 parameters (uuid, numeric, text, text, text)
-- =============================================================================
