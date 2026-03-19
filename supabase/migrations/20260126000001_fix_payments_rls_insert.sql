BEGIN;

-- Add INSERT policy for admins to allow direct payment inserts (for CustomerDashboard)
-- This is needed because CustomerDashboard does direct inserts, not RPC calls
DROP POLICY IF EXISTS payments_insert_admin ON public.payments;

CREATE POLICY payments_insert_admin
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
  AND received_by IS NOT NULL
);

COMMIT;

