BEGIN;

-- =============================================================================
-- Billing Subscription History (Production Hardening - Phase 2)
-- =============================================================================
-- Creates a table to track all subscription and billing-state changes over time.
--
-- Purpose:
-- - Audit trail of plan changes, status changes, and billing field updates
-- - Track who/what changed billing state (webhook, checkout, portal, admin, etc.)
-- - Link changes to Stripe events for full traceability
-- - Enable querying billing history (e.g., "When did this company upgrade to Pro?")
--
-- Security:
-- - RLS enabled
-- - service_role: full access (for webhook/system writes)
-- - authenticated: read-only access to their company's history
-- =============================================================================

-- =============================================================================
-- Create billing_subscription_history table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,  -- null for webhook/system changes
  source text NOT NULL,  -- webhook | checkout | portal | admin | reconciliation | system
  field_name text NOT NULL,  -- plan | subscription_status | stripe_subscription_id | stripe_customer_id | trial_ends_at | billing_grace_until
  old_value text NULL,
  new_value text NULL,
  stripe_event_id text NULL REFERENCES public.stripe_event_ledger(event_id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- =============================================================================
-- Add CHECK constraint for source
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_subscription_history_source_check'
      AND conrelid = 'public.billing_subscription_history'::regclass
  ) THEN
    ALTER TABLE public.billing_subscription_history
      ADD CONSTRAINT billing_subscription_history_source_check
      CHECK (source IN ('webhook', 'checkout', 'portal', 'admin', 'reconciliation', 'system'));
  END IF;
END
$$;

-- =============================================================================
-- Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS billing_subscription_history_company_changed_idx
  ON public.billing_subscription_history(company_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS billing_subscription_history_stripe_event_idx
  ON public.billing_subscription_history(stripe_event_id);

-- Index on field_name for querying specific field changes
CREATE INDEX IF NOT EXISTS billing_subscription_history_field_name_idx
  ON public.billing_subscription_history(company_id, field_name, changed_at DESC);

-- =============================================================================
-- Enable Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.billing_subscription_history ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS billing_subscription_history_service_role_all ON public.billing_subscription_history;
DROP POLICY IF EXISTS billing_subscription_history_authenticated_select ON public.billing_subscription_history;

-- Policy: service_role has full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY billing_subscription_history_service_role_all
ON public.billing_subscription_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: authenticated users can read their company's billing history
CREATE POLICY billing_subscription_history_authenticated_select
ON public.billing_subscription_history
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- Note: No INSERT/UPDATE/DELETE policies for authenticated users
-- All writes must go through service_role (webhook, checkout, admin RPCs, etc.)

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT SELECT ON public.billing_subscription_history TO authenticated;
GRANT ALL ON public.billing_subscription_history TO service_role;

-- Explicitly revoke from anon/public (defense in depth)
REVOKE ALL ON public.billing_subscription_history FROM anon;
REVOKE ALL ON public.billing_subscription_history FROM public;

COMMIT;
