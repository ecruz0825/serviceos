BEGIN;

-- =============================================================================
-- Harden Expenses Schema: Multi-tenant safety + receipt support
-- - Ensure company_id, date, created_at are NOT NULL with defaults
-- - Add receipt storage fields
-- - Add performance indexes
-- =============================================================================

-- 1) Backfill NULL company_id values (shouldn't exist, but safe)
-- Note: This assumes expenses without company_id should be deleted or assigned
-- For safety, we'll set a placeholder that will fail the NOT NULL constraint
-- if any exist, making the migration fail visibly
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.expenses WHERE company_id IS NULL;
  
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Found % expenses with NULL company_id. Please fix before migration.', null_count;
  END IF;
END$$;

-- 2) Backfill NULL date values with current_date
UPDATE public.expenses
SET date = CURRENT_DATE
WHERE date IS NULL;

-- 3) Backfill NULL created_at values with now()
UPDATE public.expenses
SET created_at = now()
WHERE created_at IS NULL;

-- 4) Add receipt fields (idempotent)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_path text NULL,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz NULL;

-- 5) Set NOT NULL constraints with defaults (safe after backfill)
ALTER TABLE public.expenses
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN date SET NOT NULL,
  ALTER COLUMN date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now();

-- 6) Add indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS expenses_company_date_idx 
  ON public.expenses(company_id, date DESC);

CREATE INDEX IF NOT EXISTS expenses_company_category_idx 
  ON public.expenses(company_id, category);

COMMIT;

