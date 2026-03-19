BEGIN;

-- =============================================================================
-- Customer Files: File storage system for customer documents
-- - Multi-tenant safe (company_id)
-- - Role-based RLS (admin/crew/customer)
-- - Links to customers table
-- =============================================================================

-- 1) Create customer_files table
CREATE TABLE IF NOT EXISTS public.customer_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2) Add indexes for performance
CREATE INDEX IF NOT EXISTS customer_files_company_customer_idx 
  ON public.customer_files(company_id, customer_id);

CREATE INDEX IF NOT EXISTS customer_files_customer_id_idx 
  ON public.customer_files(customer_id);

CREATE INDEX IF NOT EXISTS customer_files_created_at_idx 
  ON public.customer_files(created_at DESC);

-- 3) Enable RLS
ALTER TABLE public.customer_files ENABLE ROW LEVEL SECURITY;

-- 4) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS customer_files_select_admin ON public.customer_files;
DROP POLICY IF EXISTS customer_files_select_crew ON public.customer_files;
DROP POLICY IF EXISTS customer_files_select_customer ON public.customer_files;
DROP POLICY IF EXISTS customer_files_insert_admin ON public.customer_files;
DROP POLICY IF EXISTS customer_files_update_admin ON public.customer_files;
DROP POLICY IF EXISTS customer_files_delete_admin ON public.customer_files;

-- 5) RLS Policies

-- SELECT: Admins can select all files in their company
CREATE POLICY customer_files_select_admin
ON public.customer_files
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- SELECT: Crew can select files for customers assigned to jobs they work on
-- Crew member must be assigned to a job (via team or legacy assigned_to) that belongs to the customer
CREATE POLICY customer_files_select_crew
ON public.customer_files
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND customer_id IN (
    -- Check if crew member is assigned to any job for this customer
    SELECT DISTINCT j.customer_id
    FROM public.jobs j
    WHERE j.company_id = public.current_company_id()
      AND (
        -- New team-based assignment: crew member is in the assigned team
        j.assigned_team_id IN (
          SELECT tm.team_id
          FROM public.team_members tm
          INNER JOIN public.crew_members cm ON cm.id = tm.crew_member_id
          WHERE cm.user_id = auth.uid()
            AND cm.company_id = public.current_company_id()
        )
        OR
        -- Legacy assignment: crew member is directly assigned
        j.assigned_to IN (
          SELECT cm.id
          FROM public.crew_members cm
          WHERE cm.user_id = auth.uid()
            AND cm.company_id = public.current_company_id()
        )
      )
  )
);

-- SELECT: Customers can select ONLY files tied to themselves
CREATE POLICY customer_files_select_customer
ON public.customer_files
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'customer'
  AND customer_id IN (
    SELECT id
    FROM public.customers
    WHERE user_id = auth.uid()
      AND company_id = public.current_company_id()
  )
);

-- INSERT: Only admins can insert files
CREATE POLICY customer_files_insert_admin
ON public.customer_files
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Only admins can update files
CREATE POLICY customer_files_update_admin
ON public.customer_files
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

-- DELETE: Only admins can delete files
CREATE POLICY customer_files_delete_admin
ON public.customer_files
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;
