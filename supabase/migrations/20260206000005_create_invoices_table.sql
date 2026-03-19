BEGIN;

-- =============================================================================
-- Invoices Table Migration (Phase 1)
-- Creates invoices table with minimal lifecycle while preserving PDF-based invoices
-- =============================================================================

-- 1) Create enum invoice_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'void', 'overdue');
  END IF;
END $$;

-- 2) Create invoice_counters table for per-company invoice numbering (concurrency-safe)
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_number bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  invoice_pdf_path text NULL,
  invoice_uploaded_at timestamptz NULL,
  sent_at timestamptz NULL,
  paid_at timestamptz NULL,
  voided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT invoices_subtotal_non_negative CHECK (subtotal >= 0),
  CONSTRAINT invoices_tax_non_negative CHECK (tax >= 0),
  CONSTRAINT invoices_total_non_negative CHECK (total >= 0),
  CONSTRAINT invoices_balance_due_non_negative CHECK (balance_due >= 0),
  CONSTRAINT invoices_invoice_number_not_empty CHECK (length(trim(invoice_number)) > 0)
);

-- 4) Create indexes
CREATE INDEX IF NOT EXISTS idx_invoices_company_status 
  ON public.invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_company_customer 
  ON public.invoices(company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_created 
  ON public.invoices(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id 
  ON public.invoices(job_id);

-- 5) Create invoice number assignment trigger function (per company, concurrency-safe)
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_number bigint;
BEGIN
  -- If invoice_number is already provided and not empty, allow it
  IF NEW.invoice_number IS NOT NULL AND length(trim(NEW.invoice_number)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Ensure company_id is set
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required for invoice number assignment';
  END IF;

  -- Upsert invoice_counters row if missing, then lock and increment atomically
  INSERT INTO public.invoice_counters (company_id, next_number)
  VALUES (NEW.company_id, 1)
  ON CONFLICT (company_id) DO NOTHING;

  -- Lock the row and get the next number atomically
  SELECT next_number INTO v_next_number
  FROM public.invoice_counters
  WHERE company_id = NEW.company_id
  FOR UPDATE;

  -- Format: INV-000001, INV-000002, etc. (6 digits, zero-padded)
  NEW.invoice_number := 'INV-' || lpad(v_next_number::text, 6, '0');

  -- Increment for next invoice
  UPDATE public.invoice_counters
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE company_id = NEW.company_id;

  RETURN NEW;
END;
$$;

-- 6) Create trigger for invoice number assignment
DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR length(trim(NEW.invoice_number)) = 0)
  EXECUTE FUNCTION public.assign_invoice_number();

-- 7) Create updated_at trigger
DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 8) Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 9) Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS invoices_select_tenant ON public.invoices;
DROP POLICY IF EXISTS invoices_insert_tenant ON public.invoices;
DROP POLICY IF EXISTS invoices_update_tenant ON public.invoices;

-- 10) RLS Policy: SELECT - authenticated users can see invoices in their company
CREATE POLICY invoices_select_tenant
ON public.invoices
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- 11) RLS Policy: INSERT - authenticated users can insert invoices in their company
CREATE POLICY invoices_insert_tenant
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- 12) RLS Policy: UPDATE - only admin/manager/dispatcher can update (restrict status updates)
CREATE POLICY invoices_update_tenant
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- 13) Create upsert_invoice_from_job RPC function
CREATE OR REPLACE FUNCTION public.upsert_invoice_from_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_job record;
  v_customer_id uuid;
  v_job_cost numeric;
  v_invoice_pdf_path text;
  v_invoice_uploaded_at timestamptz;
  v_invoice_id uuid;
  v_total_paid numeric;
  v_balance_due numeric;
  v_status public.invoice_status;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'NO_COMPANY',
      'message', 'User must be associated with a company'
    );
  END IF;

  -- 3) Only admin/manager/dispatcher can upsert invoices
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins, managers, and dispatchers can create invoices'
    );
  END IF;

  -- 4) Load job and ensure company_id matches
  SELECT j.* INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'JOB_NOT_FOUND',
      'message', 'Job not found or access denied'
    );
  END IF;

  -- 5) Extract values from job
  v_customer_id := v_job.customer_id;
  v_job_cost := COALESCE(v_job.job_cost, 0);
  v_invoice_pdf_path := v_job.invoice_path;
  v_invoice_uploaded_at := v_job.invoice_uploaded_at;

  -- 6) Compute total paid from payments ledger
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_paid
  FROM public.payments p
  WHERE p.job_id = p_job_id
    AND p.company_id = v_company_id
    AND p.status = 'posted'
    AND (p.voided_at IS NULL);

  -- 7) Compute balance_due
  v_balance_due := GREATEST(v_job_cost - v_total_paid, 0);

  -- 8) Determine status: if invoice_pdf_path exists, set to 'sent', else 'draft'
  IF v_invoice_pdf_path IS NOT NULL AND length(trim(v_invoice_pdf_path)) > 0 THEN
    v_status := 'sent';
  ELSE
    v_status := 'draft';
  END IF;

  -- 9) Upsert invoice (INSERT ... ON CONFLICT DO UPDATE)
  INSERT INTO public.invoices (
    company_id,
    customer_id,
    job_id,
    invoice_number, -- Will be auto-assigned by trigger if NULL
    status,
    subtotal,
    tax,
    total,
    balance_due,
    invoice_pdf_path,
    invoice_uploaded_at
  ) VALUES (
    v_company_id,
    v_customer_id,
    p_job_id,
    NULL, -- Let trigger assign number
    v_status,
    v_job_cost, -- For v1, subtotal = total (no separate tax breakdown yet)
    0, -- tax = 0 for v1
    v_job_cost,
    v_balance_due,
    v_invoice_pdf_path,
    v_invoice_uploaded_at
  )
  ON CONFLICT (job_id) DO UPDATE SET
    status = EXCLUDED.status,
    subtotal = EXCLUDED.subtotal,
    tax = EXCLUDED.tax,
    total = EXCLUDED.total,
    balance_due = EXCLUDED.balance_due,
    invoice_pdf_path = EXCLUDED.invoice_pdf_path,
    invoice_uploaded_at = EXCLUDED.invoice_uploaded_at,
    updated_at = now()
  RETURNING id INTO v_invoice_id;

  -- 10) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', v_invoice_id
  );
END;
$$;

-- 14) Grant execute on RPC to authenticated
GRANT EXECUTE ON FUNCTION public.upsert_invoice_from_job(uuid) TO authenticated;

COMMIT;
