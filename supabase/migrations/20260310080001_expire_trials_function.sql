-- =============================================================================
-- Trial Expiration Function
-- =============================================================================
-- Creates a function to expire companies whose trial period has ended.
--
-- Function: expire_trials
-- - Updates public.companies where trial has expired
-- - Sets subscription_status = 'inactive' and billing_updated_at = now()
-- - Only processes companies with:
--   - subscription_status = 'trialing'
--   - trial_ends_at IS NOT NULL
--   - trial_ends_at <= now()
-- - Returns the number of updated rows
-- - SECURITY DEFINER, restricted to service_role for cron execution
-- =============================================================================

BEGIN;

-- =============================================================================
-- Trial Expiration Function: expire_trials
-- =============================================================================

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  UPDATE public.companies
  SET
    subscription_status = 'inactive',
    billing_updated_at = now()
  WHERE
    subscription_status = 'trialing'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at <= now();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY
  SELECT v_updated_count;
END;
$$;

-- Grant execute to service_role only (for cron jobs)
GRANT EXECUTE ON FUNCTION public.expire_trials() TO service_role;

COMMIT;
