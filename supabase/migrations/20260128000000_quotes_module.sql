BEGIN;

-- =============================================================================
-- Quotes Module Migration
-- Creates quotes table, quote_counters table, enum, triggers, RLS, and indexes
-- =============================================================================

-- 1) Create enum for quote status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_status') THEN
    CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');
  END IF;
END $$;

-- 2) Create quote_counters table for per-company quote numbering (concurrency-safe)
CREATE TABLE IF NOT EXISTS public.quote_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_number bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Create quotes table
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  quote_number text NOT NULL,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status public.quote_status NOT NULL DEFAULT 'draft',
  valid_until date NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at timestamptz NULL,
  accepted_at timestamptz NULL,
  rejected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT quotes_subtotal_non_negative CHECK (subtotal >= 0),
  CONSTRAINT quotes_tax_non_negative CHECK (tax >= 0),
  CONSTRAINT quotes_total_non_negative CHECK (total >= 0),
  CONSTRAINT quotes_quote_number_not_empty CHECK (length(trim(quote_number)) > 0)
);

-- 4) Create or replace updated_at trigger function (generic)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS quotes_updated_at ON public.quotes;
DROP TRIGGER IF EXISTS quote_counters_updated_at ON public.quote_counters;

-- Create triggers for updated_at
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER quote_counters_updated_at
  BEFORE UPDATE ON public.quote_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5) Create quote number assignment trigger function (per company, concurrency-safe)
CREATE OR REPLACE FUNCTION public.assign_quote_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_number bigint;
BEGIN
  -- If quote_number is already provided and not empty, allow it (but uniqueness is enforced by unique index)
  IF NEW.quote_number IS NOT NULL AND length(trim(NEW.quote_number)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Ensure company_id is set
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required for quote number assignment';
  END IF;

  -- Upsert quote_counters row if missing, then lock and increment atomically
  INSERT INTO public.quote_counters (company_id, next_number)
  VALUES (NEW.company_id, 1)
  ON CONFLICT (company_id) DO NOTHING;

  -- Lock the row and get the next number atomically
  SELECT next_number INTO v_next_number
  FROM public.quote_counters
  WHERE company_id = NEW.company_id
  FOR UPDATE;

  -- Increment and update
  UPDATE public.quote_counters
  SET next_number = next_number + 1
  WHERE company_id = NEW.company_id;

  -- Format quote number: 'Q-' || zero-padded number (4 digits)
  NEW.quote_number := 'Q-' || lpad(v_next_number::text, 4, '0');

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS quotes_assign_quote_number ON public.quotes;

-- Create BEFORE INSERT trigger on quotes
CREATE TRIGGER quotes_assign_quote_number
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_quote_number();

-- 6) Create indexes
-- Unique index: (company_id, quote_number)
CREATE UNIQUE INDEX IF NOT EXISTS quotes_company_quote_number_unique
  ON public.quotes(company_id, quote_number);

-- Non-unique indexes
CREATE INDEX IF NOT EXISTS quotes_company_status_idx
  ON public.quotes(company_id, status);

CREATE INDEX IF NOT EXISTS quotes_company_customer_idx
  ON public.quotes(company_id, customer_id);

CREATE INDEX IF NOT EXISTS quotes_company_created_at_desc_idx
  ON public.quotes(company_id, created_at DESC);

-- 7) Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_counters ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS quotes_select_same_company ON public.quotes;
DROP POLICY IF EXISTS quotes_insert_admin ON public.quotes;
DROP POLICY IF EXISTS quotes_update_admin ON public.quotes;
DROP POLICY IF EXISTS quotes_delete_admin ON public.quotes;

DROP POLICY IF EXISTS quote_counters_select_admin ON public.quote_counters;
DROP POLICY IF EXISTS quote_counters_insert_admin ON public.quote_counters;
DROP POLICY IF EXISTS quote_counters_update_admin ON public.quote_counters;
DROP POLICY IF EXISTS quote_counters_delete_admin ON public.quote_counters;

-- 8) RLS Policies for quotes table

-- A) SELECT: Allow authenticated users in same company
CREATE POLICY quotes_select_same_company
ON public.quotes
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- B) INSERT: Admin-only in same company
CREATE POLICY quotes_insert_admin
ON public.quotes
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- C) UPDATE: Admin-only in same company
CREATE POLICY quotes_update_admin
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- D) DELETE: Admin-only in same company
CREATE POLICY quotes_delete_admin
ON public.quotes
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- Optional future: Allow customers to SELECT their own quotes
-- Uncomment if your app has customer auth profiles linked to customers.user_id
/*
CREATE POLICY quotes_select_customer_own
ON public.quotes
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = quotes.customer_id
      AND c.company_id = quotes.company_id
      AND c.user_id = auth.uid()
  )
);
*/

-- 9) RLS Policies for quote_counters table (admin-only, same company)

-- SELECT: Admin-only
CREATE POLICY quote_counters_select_admin
ON public.quote_counters
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- INSERT: Admin-only
CREATE POLICY quote_counters_insert_admin
ON public.quote_counters
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Admin-only
CREATE POLICY quote_counters_update_admin
ON public.quote_counters
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- DELETE: Admin-only
CREATE POLICY quote_counters_delete_admin
ON public.quote_counters
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;

