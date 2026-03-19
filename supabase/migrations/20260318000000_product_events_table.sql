-- =============================================================================
-- Product Events Table (Day 1 - Launch Package)
-- =============================================================================
-- Creates a minimal, safe telemetry foundation for product analytics.
--
-- Table: public.product_events
-- - Stores product events for analytics and observability
-- - Multi-tenant safe with RLS
-- - Auth-derived tenant context (no client-supplied company_id)
--
-- Requirements:
-- - Enable RLS
-- - Tenant-scoped read access for admins/platform
-- - Safe insert path via RPC only
-- - No public cross-tenant reads
-- =============================================================================

BEGIN;

-- =============================================================================
-- Create product_events table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  user_id uuid,
  role text,
  event_name text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- =============================================================================
-- Add indexes for common query patterns
-- =============================================================================

-- Index for company-scoped queries with time ordering
CREATE INDEX IF NOT EXISTS idx_product_events_company_created
  ON public.product_events (company_id, created_at DESC);

-- Index for event name queries with time ordering
CREATE INDEX IF NOT EXISTS idx_product_events_event_created
  ON public.product_events (event_name, created_at DESC);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS product_events_select_admin ON public.product_events;
DROP POLICY IF EXISTS product_events_select_platform_admin ON public.product_events;

-- SELECT: Admin can see events for their company
CREATE POLICY product_events_select_admin
ON public.product_events
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- SELECT: Platform admin can see all events (for platform analytics)
CREATE POLICY product_events_select_platform_admin
ON public.product_events
FOR SELECT
TO authenticated
USING (
  public.current_user_role() = 'platform_admin'
);

-- Note: No INSERT policy - inserts must go through log_product_event() RPC
-- This ensures company_id is always derived from auth context, never client-supplied

-- =============================================================================
-- Grant Execute Permission (for RPC)
-- =============================================================================

-- Grant will be added in the RPC migration
-- This ensures only authenticated users can log events via RPC

COMMIT;
