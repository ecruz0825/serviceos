BEGIN;

-- =============================================================================
-- Customer Files Storage: Bucket and policies for customer-files bucket
-- - Private bucket (no public access)
-- - Multi-tenant via folder structure: {company_id}/customers/{customer_id}/...
-- - Role-based access via storage policies
-- =============================================================================

-- 1) Create customer-files bucket if it doesn't exist (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-files', 'customer-files', false, 52428800, NULL) -- 50MB limit
ON CONFLICT (id) DO UPDATE
SET public = false;

-- 2) Drop existing storage policies if they exist (for idempotency)
DROP POLICY IF EXISTS customer_files_storage_select ON storage.objects;
DROP POLICY IF EXISTS customer_files_storage_insert ON storage.objects;
DROP POLICY IF EXISTS customer_files_storage_update ON storage.objects;
DROP POLICY IF EXISTS customer_files_storage_delete ON storage.objects;

-- 3) Storage Policies for customer-files bucket

-- SELECT: Authenticated users can select files if first folder matches their company_id
CREATE POLICY customer_files_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND public.current_company_id() IS NOT NULL
  AND (
    -- Path format: {company_id}/customers/{customer_id}/...
    -- Check if path starts with company_id/
    name LIKE (public.current_company_id()::text || '/%')
  )
);

-- INSERT: Only admins can insert files, and only in their company folder
CREATE POLICY customer_files_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-files'
  AND public.current_user_role() = 'admin'
  AND public.current_company_id() IS NOT NULL
  AND (
    -- Path format: {company_id}/customers/{customer_id}/...
    name LIKE (public.current_company_id()::text || '/%')
  )
);

-- UPDATE: Only admins can update files, and only in their company folder
CREATE POLICY customer_files_storage_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND public.current_user_role() = 'admin'
  AND public.current_company_id() IS NOT NULL
  AND (
    name LIKE (public.current_company_id()::text || '/%')
  )
)
WITH CHECK (
  bucket_id = 'customer-files'
  AND public.current_user_role() = 'admin'
  AND public.current_company_id() IS NOT NULL
  AND (
    name LIKE (public.current_company_id()::text || '/%')
  )
);

-- DELETE: Only admins can delete files, and only in their company folder
CREATE POLICY customer_files_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND public.current_user_role() = 'admin'
  AND public.current_company_id() IS NOT NULL
  AND (
    name LIKE (public.current_company_id()::text || '/%')
  )
);

COMMIT;
