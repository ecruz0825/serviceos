BEGIN;

-- =============================================================================
-- Claim Stripe Event Function (Production Hardening - Phase 1)
-- =============================================================================
-- Creates a function to atomically claim Stripe webhook events for processing.
--
-- Purpose:
-- - Atomically insert event into stripe_event_ledger
-- - Return ledger row id if event is new (successfully claimed)
-- - Return NULL if event already exists (already processed)
-- - Enables idempotent webhook processing
--
-- Usage:
-- - Called by webhook handler before processing any event
-- - If returns NULL, event was already processed, skip
-- - If returns UUID, event is claimed, proceed with processing
-- =============================================================================

-- =============================================================================
-- Create claim_stripe_event function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Attempt to insert event with 'processing' state
  -- ON CONFLICT (event_id) DO NOTHING ensures idempotency
  INSERT INTO public.stripe_event_ledger (
    event_id,
    processing_state
  )
  VALUES (
    p_event_id,
    'processing'
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  -- Return ledger row id if insert succeeded, NULL if event already exists
  RETURN v_id;
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text) TO service_role;

COMMIT;
