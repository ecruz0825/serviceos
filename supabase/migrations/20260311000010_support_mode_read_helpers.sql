BEGIN;

-- =============================================================================
-- Support Mode Read Helpers (Phase 1C-A)
-- =============================================================================
-- Creates helper functions for read-only support mode access to tenant data.
-- This phase enables platform_admin in support mode to read core tenant pages:
-- - /admin (dashboard)
-- - /admin/jobs
-- - /admin/customers
-- - /admin/payments
-- - /admin/settings
--
-- IMPORTANT: This phase is read-only. No mutations are enabled.
-- =============================================================================

-- =============================================================================
-- Helper Function: is_admin_or_support_mode()
-- =============================================================================
-- Returns true when:
-- - current_user_role() = 'admin' (normal tenant admin)
-- - OR (current_user_role() = 'platform_admin' AND is_support_mode())
--   (platform admin in active support mode)
--
-- Used in RLS policies to allow read access for both tenant admins and
-- platform admins in support mode.

CREATE OR REPLACE FUNCTION public.is_admin_or_support_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT 
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'platform_admin'
      AND public.is_support_mode()
    )
$$;

-- Grant execute to authenticated (used in RLS policies)
GRANT EXECUTE ON FUNCTION public.is_admin_or_support_mode() TO authenticated;

-- Revoke from public/anon (defense in depth)
REVOKE ALL ON FUNCTION public.is_admin_or_support_mode() FROM public;
REVOKE ALL ON FUNCTION public.is_admin_or_support_mode() FROM anon;

-- =============================================================================
-- RLS Policy Patches for Read-Only Support Mode Access
-- =============================================================================
-- Patch SELECT policies that currently require literal 'admin' role to also
-- allow platform_admin in support mode.
--
-- Only patching read/select policies. No INSERT/UPDATE/DELETE policies modified.

-- =============================================================================
-- Payments Table: payments_select_admin
-- =============================================================================
-- Patch: Allow platform_admin in support mode to read payments

DROP POLICY IF EXISTS payments_select_admin ON public.payments;

CREATE POLICY payments_select_admin
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.is_admin_or_support_mode()
);

-- =============================================================================
-- Profiles Table: profiles_select_admin_all_company
-- =============================================================================
-- Patch: Allow platform_admin in support mode to read profiles in support company

DROP POLICY IF EXISTS profiles_select_admin_all_company ON public.profiles;

CREATE POLICY profiles_select_admin_all_company
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_support_mode()
  AND public.current_company_id() IS NOT NULL
  AND company_id = public.current_company_id()
);

-- =============================================================================
-- Invoices Table: invoices_admin_select
-- =============================================================================
-- Patch: Allow platform_admin in support mode to read invoices

DROP POLICY IF EXISTS invoices_admin_select ON public.invoices;

CREATE POLICY invoices_admin_select
ON public.invoices
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.is_admin_or_support_mode()
);

-- =============================================================================
-- Customer Files Table: customer_files_select_admin
-- =============================================================================
-- Patch: Allow platform_admin in support mode to read customer files

DROP POLICY IF EXISTS customer_files_select_admin ON public.customer_files;

CREATE POLICY customer_files_select_admin
ON public.customer_files
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.is_admin_or_support_mode()
);

-- =============================================================================
-- Payment Receipts Table: Split admin policy for support mode
-- =============================================================================
-- Patch: Allow platform_admin in support mode to read payment receipts
-- Split the FOR ALL policy into separate SELECT and mutation policies

DROP POLICY IF EXISTS payment_receipts_admin_crud ON public.payment_receipts;

-- SELECT: Allow admin or platform_admin in support mode
CREATE POLICY payment_receipts_admin_select
ON public.payment_receipts
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.is_admin_or_support_mode()
);

-- INSERT: Still require literal admin role (mutations blocked)
CREATE POLICY payment_receipts_admin_insert
ON public.payment_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Still require literal admin role (mutations blocked)
CREATE POLICY payment_receipts_admin_update
ON public.payment_receipts
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
);

-- DELETE: Still require literal admin role (mutations blocked)
CREATE POLICY payment_receipts_admin_delete
ON public.payment_receipts
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
);

-- =============================================================================
-- Note: Jobs, Customers, Companies, Quotes, Teams Tables
-- =============================================================================
-- These tables likely use company_id scoping via current_company_id() in their
-- RLS policies, which already works with support mode (current_company_id()
-- was modified in Phase 1A to return support company when in support mode).
--
-- If any of these tables have explicit admin role checks in SELECT policies,
-- they should be patched here. For now, we're patching the known policies that
-- explicitly check current_user_role() = 'admin'.

COMMIT;
