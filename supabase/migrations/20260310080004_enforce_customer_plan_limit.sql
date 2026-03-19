-- =============================================================================
-- Customer Plan Limit Enforcement (Phase 3A - Plan Engine)
-- =============================================================================
-- Enforces customer plan limits at the database level using a BEFORE INSERT
-- trigger on public.customers.
--
-- Trigger Function: enforce_customer_plan_limit
-- - Checks company's plan limits and current usage
-- - Blocks insert if customer limit is reached
-- - Allows insert if limit is NULL (unlimited) or not yet reached
--
-- Trigger: trg_enforce_customer_plan_limit
-- - Fires BEFORE INSERT on public.customers
-- - Uses SECURITY DEFINER to access plan_limits table
-- =============================================================================

BEGIN;

-- =============================================================================
-- Trigger Function: enforce_customer_plan_limit
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_customer_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_usage record;
BEGIN
  -- Get company's plan limits and current usage
  SELECT * INTO v_usage
  FROM public.get_company_plan_usage(NEW.company_id);

  -- If no company row returned, raise exception
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_NOT_FOUND' USING
      MESSAGE = format('Company %s not found', NEW.company_id);
  END IF;

  -- If max_customers IS NULL, allow insert (unlimited)
  IF v_usage.max_customers IS NULL THEN
    RETURN NEW;
  END IF;

  -- If current_customers >= max_customers, raise exception
  IF v_usage.current_customers >= v_usage.max_customers THEN
    RAISE EXCEPTION 'CUSTOMER_LIMIT_REACHED' USING
      MESSAGE = format(
        'CUSTOMER_LIMIT_REACHED: %s plan allows up to %s customers. Upgrade to Pro to add more customers.',
        v_usage.plan_code,
        v_usage.max_customers
      );
  END IF;

  -- Otherwise allow insert
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Create Trigger
-- =============================================================================

DROP TRIGGER IF EXISTS trg_enforce_customer_plan_limit ON public.customers;

CREATE TRIGGER trg_enforce_customer_plan_limit
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_plan_limit();

COMMIT;
