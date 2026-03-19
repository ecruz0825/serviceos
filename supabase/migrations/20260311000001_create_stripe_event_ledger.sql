BEGIN;

-- =============================================================================
-- Stripe Event Ledger (Production Hardening - Phase 1)
-- =============================================================================
-- Creates a table to store all Stripe webhook events for idempotent processing.
--
-- Purpose:
-- - Store every webhook event received from Stripe
-- - Enable idempotent event processing (prevent duplicate handling)
-- - Track event processing state and errors
-- - Provide audit trail of all billing events
--
-- Security:
-- - RLS enabled, service_role only
-- - No authenticated user access (webhook processing is server-side)
-- =============================================================================

-- =============================================================================
-- Create stripe_event_ledger table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_event_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,  -- Stripe event ID (evt_xxx)
  event_type text NOT NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processing_state text NOT NULL DEFAULT 'pending',  -- pending | processing | success | error | ignored
  processing_attempts integer NOT NULL DEFAULT 0,
  processing_error text NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Add CHECK constraint for processing_state
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stripe_event_ledger_processing_state_check'
      AND conrelid = 'public.stripe_event_ledger'::regclass
  ) THEN
    ALTER TABLE public.stripe_event_ledger
      ADD CONSTRAINT stripe_event_ledger_processing_state_check
      CHECK (processing_state IN ('pending', 'processing', 'success', 'error', 'ignored'));
  END IF;
END
$$;

-- =============================================================================
-- Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS stripe_event_ledger_company_idx
  ON public.stripe_event_ledger(company_id);

CREATE INDEX IF NOT EXISTS stripe_event_ledger_created_idx
  ON public.stripe_event_ledger(created_at DESC);

-- Index on processing_state for querying pending/error events
CREATE INDEX IF NOT EXISTS stripe_event_ledger_processing_state_idx
  ON public.stripe_event_ledger(processing_state)
  WHERE processing_state IN ('pending', 'error');

-- =============================================================================
-- Enable Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.stripe_event_ledger ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies: service_role full access, authenticated none
-- =============================================================================

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS stripe_event_ledger_service_role_all ON public.stripe_event_ledger;

-- Policy: service_role has full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY stripe_event_ledger_service_role_all
ON public.stripe_event_ledger
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Note: No policy for authenticated users - this table is service_role only
-- Webhook processing happens server-side via service_role

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT ALL ON public.stripe_event_ledger TO service_role;

-- Explicitly revoke from authenticated (defense in depth)
REVOKE ALL ON public.stripe_event_ledger FROM authenticated;
REVOKE ALL ON public.stripe_event_ledger FROM anon;
REVOKE ALL ON public.stripe_event_ledger FROM public;

COMMIT;
