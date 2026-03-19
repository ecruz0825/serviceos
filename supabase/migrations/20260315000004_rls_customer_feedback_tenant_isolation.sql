BEGIN;

-- =============================================================================
-- RLS Remediation Phase 3: Customer Feedback Tenant Isolation
-- Completes RLS policies for customer_feedback (SELECT policy already exists)
-- Adds missing INSERT / UPDATE / DELETE policies
-- =============================================================================

-- 1) Enable RLS on customer_feedback table (if not already enabled)
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
-- Note: customer_feedback_select_own may already exist from previous migration
DROP POLICY IF EXISTS customer_feedback_select_own ON public.customer_feedback;
DROP POLICY IF EXISTS customer_feedback_select_admin ON public.customer_feedback;
DROP POLICY IF EXISTS customer_feedback_insert_customer ON public.customer_feedback;
DROP POLICY IF EXISTS customer_feedback_insert_admin ON public.customer_feedback;
DROP POLICY IF EXISTS customer_feedback_update_customer ON public.customer_feedback;
DROP POLICY IF EXISTS customer_feedback_update_admin ON public.customer_feedback;
DROP POLICY IF EXISTS customer_feedback_delete_admin ON public.customer_feedback;

-- 3) RLS Policies for customer_feedback table
-- Note: customer_feedback does not have company_id column, so we use EXISTS subqueries
-- to verify tenant boundary via jobs and customers tables

-- SELECT: Customer can see their own feedback
CREATE POLICY customer_feedback_select_own
ON public.customer_feedback
FOR SELECT
TO authenticated
USING (
  public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_feedback.customer_id
      AND c.user_id = auth.uid()
  )
);

-- SELECT: Admin can see feedback for jobs/customers in their company
CREATE POLICY customer_feedback_select_admin
ON public.customer_feedback
FOR SELECT
TO authenticated
USING (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.jobs j ON j.customer_id = c.id
    WHERE c.id = customer_feedback.customer_id
      AND j.id = customer_feedback.job_id
      AND c.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
  )
);

-- INSERT: Customer can create feedback for their own jobs
CREATE POLICY customer_feedback_insert_customer
ON public.customer_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.jobs j ON j.customer_id = c.id
    WHERE c.id = customer_feedback.customer_id
      AND j.id = customer_feedback.job_id
      AND c.user_id = auth.uid()
      AND c.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
  )
);

-- INSERT: Admin can create feedback for jobs/customers in their company
CREATE POLICY customer_feedback_insert_admin
ON public.customer_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.jobs j ON j.customer_id = c.id
    WHERE c.id = customer_feedback.customer_id
      AND j.id = customer_feedback.job_id
      AND c.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
  )
);

-- UPDATE: Customer can update their own feedback (rating, comment only)
CREATE POLICY customer_feedback_update_customer
ON public.customer_feedback
FOR UPDATE
TO authenticated
USING (
  public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_feedback.customer_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = customer_feedback.customer_id
      AND c.user_id = auth.uid()
  )
);

-- UPDATE: Admin can update feedback for jobs/customers in their company
CREATE POLICY customer_feedback_update_admin
ON public.customer_feedback
FOR UPDATE
TO authenticated
USING (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.jobs j ON j.customer_id = c.id
    WHERE c.id = customer_feedback.customer_id
      AND j.id = customer_feedback.job_id
      AND c.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
  )
)
WITH CHECK (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.jobs j ON j.customer_id = c.id
    WHERE c.id = customer_feedback.customer_id
      AND j.id = customer_feedback.job_id
      AND c.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
  )
);

-- DELETE: Admin can delete feedback for jobs/customers in their company
CREATE POLICY customer_feedback_delete_admin
ON public.customer_feedback
FOR DELETE
TO authenticated
USING (
  public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.jobs j ON j.customer_id = c.id
    WHERE c.id = customer_feedback.customer_id
      AND j.id = customer_feedback.job_id
      AND c.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
  )
);

COMMIT;
