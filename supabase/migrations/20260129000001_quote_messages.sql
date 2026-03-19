-- Migration: Create quote_messages table for quote send audit trail
-- Tracks email sends for quotes (queued, sent, failed status)

BEGIN;

-- Create quote_messages table
CREATE TABLE IF NOT EXISTS public.quote_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NULL,
  status text NOT NULL DEFAULT 'queued', -- queued, sent, failed
  error text NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS quote_messages_company_quote_created_idx
  ON public.quote_messages(company_id, quote_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quote_messages_company_status_idx
  ON public.quote_messages(company_id, status);

-- Enable RLS
ALTER TABLE public.quote_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS quote_messages_select_same_company ON public.quote_messages;
DROP POLICY IF EXISTS quote_messages_insert_admin ON public.quote_messages;
DROP POLICY IF EXISTS quote_messages_update_admin ON public.quote_messages;
DROP POLICY IF EXISTS quote_messages_delete_admin ON public.quote_messages;

-- SELECT: Allow authenticated users in same company
CREATE POLICY quote_messages_select_same_company
ON public.quote_messages
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- INSERT: Admin-only in same company
CREATE POLICY quote_messages_insert_admin
ON public.quote_messages
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Admin-only in same company
CREATE POLICY quote_messages_update_admin
ON public.quote_messages
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

-- DELETE: Admin-only in same company (optional)
CREATE POLICY quote_messages_delete_admin
ON public.quote_messages
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;

