BEGIN;

-- =============================================================================
-- RLS Remediation Phase 2: Customer Notes Tenant Isolation
-- Adds Row Level Security policies to enforce tenant boundaries for customer_notes
-- Uses relationship-based EXISTS subquery since customer_notes does not have company_id
-- =============================================================================

-- 1) Enable RLS on customer_notes table (if not already enabled)
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS customer_notes_select_admin ON public.customer_notes;
DROP POLICY IF EXISTS customer_notes_insert_admin ON public.customer_notes;
DROP POLICY IF EXISTS customer_notes_update_admin ON public.customer_notes;
DROP POLICY IF EXISTS customer_notes_delete_admin ON public.customer_notes;

-- 3) RLS Policies for customer_notes table
-- Note: customer_notes does not have company_id column, so we use EXISTS subquery
-- to verify tenant boundary via the customers table relationship

-- SELECT: Admin can see notes for customers in their company
CREATE POLICY customer_notes_select_admin
ON public.customer_notes
FOR SELECT
TO authenticated
USING (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND c.company_id = public.current_company_id()
  )
);

-- INSERT: Admin can create notes for customers in their company
CREATE POLICY customer_notes_insert_admin
ON public.customer_notes
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND c.company_id = public.current_company_id()
  )
);

-- UPDATE: Admin can update notes for customers in their company
CREATE POLICY customer_notes_update_admin
ON public.customer_notes
FOR UPDATE
TO authenticated
USING (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND c.company_id = public.current_company_id()
  )
)
WITH CHECK (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND c.company_id = public.current_company_id()
  )
);

-- DELETE: Admin can delete notes for customers in their company
CREATE POLICY customer_notes_delete_admin
ON public.customer_notes
FOR DELETE
TO authenticated
USING (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND c.company_id = public.current_company_id()
  )
);

COMMIT;
