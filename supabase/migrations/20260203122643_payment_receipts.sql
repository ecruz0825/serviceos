BEGIN;

-- Create payment_receipts table to link payments to customer_files
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  customer_file_id uuid NOT NULL REFERENCES public.customer_files(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS payment_receipts_company_payment_idx ON public.payment_receipts(company_id, payment_id);
CREATE INDEX IF NOT EXISTS payment_receipts_payment_id_idx ON public.payment_receipts(payment_id);
CREATE INDEX IF NOT EXISTS payment_receipts_customer_file_id_idx ON public.payment_receipts(customer_file_id);
CREATE INDEX IF NOT EXISTS payment_receipts_created_at_desc_idx ON public.payment_receipts(created_at DESC);

-- Enable RLS
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS payment_receipts_admin_crud ON public.payment_receipts;
DROP POLICY IF EXISTS payment_receipts_select_crew ON public.payment_receipts;
DROP POLICY IF EXISTS payment_receipts_select_customer ON public.payment_receipts;

-- Admin: full CRUD for rows in their company
CREATE POLICY payment_receipts_admin_crud
ON public.payment_receipts
FOR ALL
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
);

-- Crew: SELECT only for receipts linked to customers they are assigned to
CREATE POLICY payment_receipts_select_crew
ON public.payment_receipts
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    INNER JOIN public.jobs j ON j.id = p.job_id
    WHERE p.id = payment_receipts.payment_id
      AND p.company_id = public.current_company_id()
      AND (
        j.assigned_team_id IN (
          SELECT tm.team_id
          FROM public.team_members tm
          INNER JOIN public.crew_members cm ON cm.id = tm.crew_member_id
          WHERE cm.user_id = auth.uid()
            AND cm.company_id = public.current_company_id()
        )
        OR
        j.assigned_to IN (
          SELECT cm.id
          FROM public.crew_members cm
          WHERE cm.user_id = auth.uid()
            AND cm.company_id = public.current_company_id()
        )
      )
  )
);

-- Customer: SELECT only for receipts linked to their own customer record
CREATE POLICY payment_receipts_select_customer
ON public.payment_receipts
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    INNER JOIN public.jobs j ON j.id = p.job_id
    INNER JOIN public.customers c ON c.id = j.customer_id
    WHERE p.id = payment_receipts.payment_id
      AND p.company_id = public.current_company_id()
      AND c.user_id = auth.uid()
      AND c.company_id = public.current_company_id()
  )
);

COMMIT;
