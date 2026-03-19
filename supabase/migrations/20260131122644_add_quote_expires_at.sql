BEGIN;

-- =============================================================================
-- Add Quote Expiration Support
-- Adds expires_at column to public.quotes for expiration handling
-- =============================================================================

-- 1) Add expires_at column (nullable, no default to allow explicit control)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2) Backfill existing rows with default expiration (14 days from now)
-- Only update rows where expires_at is NULL to avoid overwriting existing values
UPDATE public.quotes
SET expires_at = now() + interval '14 days'
WHERE expires_at IS NULL;

-- 3) Create index for token-based lookups with expiry checks
-- This index supports efficient queries filtering by public_token and expires_at
CREATE INDEX IF NOT EXISTS quotes_token_expires_idx
  ON public.quotes (public_token, expires_at)
  WHERE public_token IS NOT NULL;

COMMIT;

