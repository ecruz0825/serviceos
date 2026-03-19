-- Migration: Create storage policies for expense-receipts bucket
-- NOTE: Bucket 'expense-receipts' must be created manually in Supabase Dashboard as private bucket
-- Path format: {company_id}/expenses/{expense_id}/{timestamp}_{filename}

BEGIN;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS expense_receipts_select_same_company ON storage.objects;
DROP POLICY IF EXISTS expense_receipts_insert_admin ON storage.objects;
DROP POLICY IF EXISTS expense_receipts_update_admin ON storage.objects;
DROP POLICY IF EXISTS expense_receipts_delete_admin ON storage.objects;

-- SELECT: Allow authenticated users in same company folder
-- Path format: {company_id}/expenses/{expense_id}/{filename}
-- Check that first folder (company_id) matches current_company_id()
CREATE POLICY expense_receipts_select_same_company
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND public.current_company_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

-- INSERT: Admin-only in same company folder
CREATE POLICY expense_receipts_insert_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

-- UPDATE: Admin-only in same company folder
CREATE POLICY expense_receipts_update_admin
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'expense-receipts'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
)
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

-- DELETE: Admin-only in same company folder
CREATE POLICY expense_receipts_delete_admin
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'expense-receipts'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

COMMIT;

