BEGIN;

-- ============================================================================
-- Add billing fields to public.companies (Stripe SaaS billing state)
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS billing_updated_at timestamptz NULL;

-- Unique identifiers for Stripe objects (nullable for pre-billing tenants)
CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_key
  ON public.companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_subscription_id_key
  ON public.companies (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Enforce allowed subscription statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_subscription_status_check'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_status_check
      CHECK (
        subscription_status IN (
          'inactive',
          'trialing',
          'active',
          'past_due',
          'canceled',
          'unpaid'
        )
      );
  END IF;
END
$$;

-- Filter/index support for billing status checks
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status
  ON public.companies (subscription_status);

COMMIT;
