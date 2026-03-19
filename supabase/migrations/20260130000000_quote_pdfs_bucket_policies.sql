-- Migration: Create storage policies for quote-pdfs bucket
-- NOTE: Bucket 'quote-pdfs' must be created manually in Supabase Dashboard as private bucket
-- Path format: {company_id}/{quote_id}.pdf

BEGIN;

-- Enable RLS on storage.objects (if not already enabled)
-- Note: RLS is typically enabled by default on storage.objects

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS quote_pdfs_select_same_company ON storage.objects;
DROP POLICY IF EXISTS quote_pdfs_insert_admin ON storage.objects;
DROP POLICY IF EXISTS quote_pdfs_update_admin ON storage.objects;
DROP POLICY IF EXISTS quote_pdfs_delete_admin ON storage.objects;

-- SELECT: Allow authenticated users in same company folder
-- Path format: {company_id}/{quote_id}.pdf
-- Check that first folder (company_id) matches current_company_id()
CREATE POLICY quote_pdfs_select_same_company
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'quote-pdfs'
  AND public.current_company_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

-- INSERT: Admin-only in same company folder
CREATE POLICY quote_pdfs_insert_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quote-pdfs'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

-- UPDATE: Admin-only in same company folder
CREATE POLICY quote_pdfs_update_admin
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'quote-pdfs'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
)
WITH CHECK (
  bucket_id = 'quote-pdfs'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

-- DELETE: Admin-only in same company folder
CREATE POLICY quote_pdfs_delete_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'quote-pdfs'
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);

COMMIT;

