BEGIN;

-- =============================================================================
-- Expense Items Table: Support for line items on expenses
-- - Multi-tenant safe (company_id)
-- - Foreign key to expenses with cascade delete
-- - RLS policies matching expenses pattern
-- - Backfill helper for existing expenses
-- =============================================================================

-- 1) Create expense_items table
CREATE TABLE IF NOT EXISTS public.expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NULL,
  unit_price numeric NULL,
  line_total numeric NULL,
  category text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Add indexes for performance
CREATE INDEX IF NOT EXISTS expense_items_company_expense_idx 
  ON public.expense_items(company_id, expense_id);

CREATE INDEX IF NOT EXISTS expense_items_company_category_idx 
  ON public.expense_items(company_id, category);

-- 3) Enable RLS
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

-- 4) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS expense_items_select_same_company ON public.expense_items;
DROP POLICY IF EXISTS expense_items_insert_admin ON public.expense_items;
DROP POLICY IF EXISTS expense_items_update_admin ON public.expense_items;
DROP POLICY IF EXISTS expense_items_delete_admin ON public.expense_items;

-- 5) RLS Policies (matching expenses multi-tenant pattern)

-- SELECT: Allow authenticated users in same company
CREATE POLICY expense_items_select_same_company
ON public.expense_items
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- INSERT: Admin-only in same company
CREATE POLICY expense_items_insert_admin
ON public.expense_items
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Admin-only in same company
CREATE POLICY expense_items_update_admin
ON public.expense_items
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

-- DELETE: Admin-only in same company
CREATE POLICY expense_items_delete_admin
ON public.expense_items
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- 6) Safety backfill helper: Create default item for existing expenses
-- Only backfill expenses that:
--   - Have an amount > 0
--   - Don't already have any expense_items
--   - Have a valid company_id
DO $$
DECLARE
  expense_record RECORD;
  items_count INTEGER;
BEGIN
  FOR expense_record IN 
    SELECT id, company_id, amount, category
    FROM public.expenses
    WHERE amount IS NOT NULL 
      AND amount > 0
      AND company_id IS NOT NULL
  LOOP
    -- Check if expense already has items
    SELECT COUNT(*) INTO items_count
    FROM public.expense_items
    WHERE expense_id = expense_record.id;
    
    -- Only backfill if no items exist
    IF items_count = 0 THEN
      INSERT INTO public.expense_items (
        company_id,
        expense_id,
        description,
        line_total,
        category
      )
      VALUES (
        expense_record.company_id,
        expense_record.id,
        'Expense',
        expense_record.amount,
        expense_record.category
      )
      ON CONFLICT DO NOTHING; -- Safety: ignore if somehow duplicate
    END IF;
  END LOOP;
END $$;

COMMIT;

