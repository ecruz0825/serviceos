BEGIN;

-- =============================================================================
-- RLS Remediation Phase 2: Customers Tenant Isolation
-- Adds Row Level Security policies to enforce tenant boundaries for customers
-- =============================================================================

-- 1) Enable RLS on customers table (if not already enabled)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS customers_select_admin ON public.customers;
DROP POLICY IF EXISTS customers_select_customer_own ON public.customers;
DROP POLICY IF EXISTS customers_insert_admin ON public.customers;
DROP POLICY IF EXISTS customers_insert_customer_self ON public.customers;
DROP POLICY IF EXISTS customers_update_admin ON public.customers;
DROP POLICY IF EXISTS customers_update_customer_own ON public.customers;
DROP POLICY IF EXISTS customers_delete_admin ON public.customers;

-- 3) RLS Policies for customers table

-- SELECT: Admin can see all customers in their company
CREATE POLICY customers_select_admin
ON public.customers
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- SELECT: Customer can see their own record
CREATE POLICY customers_select_customer_own
ON public.customers
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND user_id = auth.uid()
  AND public.current_user_role() = 'customer'
);

-- INSERT: Admin can create customers in their company
CREATE POLICY customers_insert_admin
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- INSERT: Customer can create their own record (self-registration)
-- Note: This enables customer portal signup, but may not be actively used
-- in current app flow. Left enabled per remediation plan for future use.
CREATE POLICY customers_insert_customer_self
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND user_id = auth.uid()
  AND public.current_user_role() = 'customer'
);

-- UPDATE: Admin can update customers in their company
CREATE POLICY customers_update_admin
ON public.customers
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

-- UPDATE: Customer can update their own record
CREATE POLICY customers_update_customer_own
ON public.customers
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND user_id = auth.uid()
  AND public.current_user_role() = 'customer'
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND user_id = auth.uid()
  AND public.current_user_role() = 'customer'
);

-- DELETE: Admin can delete customers in their company
CREATE POLICY customers_delete_admin
ON public.customers
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;
