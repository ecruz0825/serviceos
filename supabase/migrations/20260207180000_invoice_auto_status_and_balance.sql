BEGIN;

-- =============================================================================
-- Invoice Auto-Status and Balance Rollup
-- Automatically updates invoice status based on payments and due dates
-- =============================================================================

-- 1) RPC: compute_invoice_balance
-- Sums all posted payments for a given invoice
CREATE OR REPLACE FUNCTION public.compute_invoice_balance(p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_total_paid numeric;
BEGIN
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_paid
  FROM public.payments p
  WHERE p.invoice_id = p_invoice_id
    AND p.status = 'posted'
    AND p.voided_at IS NULL;

  RETURN v_total_paid;
END;
$$;

-- 2) RPC: update_invoice_status
-- Updates invoice status based on payments and due_date
CREATE OR REPLACE FUNCTION public.update_invoice_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_invoice record;
  v_total_paid numeric;
  v_total numeric;
  v_due_date date;
  v_current_status public.invoice_status;
  v_new_status public.invoice_status;
  v_today date;
BEGIN
  -- Get current user context for tenant isolation
  v_user_id := auth.uid();
  
  -- If called from trigger (no user context), we'll validate via invoice.company_id
  -- Otherwise, validate user is admin
  IF v_user_id IS NOT NULL THEN
    SELECT p.company_id, p.role INTO v_company_id, v_role
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'NO_COMPANY';
    END IF;

    -- Only admin can manually call this (trigger calls bypass this check)
    IF v_role <> 'admin' THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  -- Load invoice with FOR UPDATE to prevent race conditions
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;

  -- If called from trigger, validate tenant isolation via invoice.company_id
  -- (This is safe because trigger only fires on payments that match company_id via RLS)
  IF v_user_id IS NULL THEN
    -- Called from trigger - validate via invoice company_id
    -- This is safe because payments RLS ensures payments can only be created
    -- for invoices in the same company
    NULL; -- Trust trigger context
  ELSE
    -- Manual call - validate user's company matches invoice company
    IF v_company_id <> v_invoice.company_id THEN
      RAISE EXCEPTION 'TENANT_MISMATCH';
    END IF;
  END IF;

  -- If invoice is void, do nothing
  IF v_invoice.status = 'void' THEN
    RETURN;
  END IF;

  -- Compute total paid from payments
  v_total_paid := public.compute_invoice_balance(p_invoice_id);
  v_total := COALESCE(v_invoice.total, 0);
  v_due_date := v_invoice.due_date;
  v_current_status := v_invoice.status;
  v_today := CURRENT_DATE;

  -- Determine new status based on business rules
  IF v_total_paid >= v_total AND v_total > 0 THEN
    -- Fully paid
    v_new_status := 'paid';
    
    -- Update invoice
    UPDATE public.invoices
    SET
      status = v_new_status,
      paid_at = CASE WHEN paid_at IS NULL THEN now() ELSE paid_at END,
      updated_at = now()
    WHERE id = p_invoice_id;
    
  ELSIF v_due_date IS NOT NULL AND v_due_date < v_today AND v_total_paid < v_total THEN
    -- Overdue: due_date passed and not fully paid
    v_new_status := 'overdue';
    
    UPDATE public.invoices
    SET
      status = v_new_status,
      updated_at = now()
    WHERE id = p_invoice_id;
    
  ELSIF v_current_status = 'draft' THEN
    -- Keep draft status (not yet sent)
    RETURN;
    
  ELSE
    -- Default to 'sent' if invoice exists and has payments but not fully paid
    v_new_status := 'sent';
    
    UPDATE public.invoices
    SET
      status = v_new_status,
      updated_at = now()
    WHERE id = p_invoice_id;
  END IF;
END;
$$;

-- 3) Trigger function: auto-update invoice status when payments change
CREATE OR REPLACE FUNCTION public.tg_update_invoice_status_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Determine which invoice_id to update
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Only update if invoice_id is set
  IF v_invoice_id IS NOT NULL THEN
    -- Call update_invoice_status (will handle tenant isolation internally)
    BEGIN
      PERFORM public.update_invoice_status(v_invoice_id);
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the payment operation
      RAISE WARNING 'Failed to update invoice status for invoice %: %', v_invoice_id, SQLERRM;
    END;
  END IF;

  -- Return appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 4) Create trigger on payments table
DROP TRIGGER IF EXISTS trg_update_invoice_status_from_payment ON public.payments;
CREATE TRIGGER trg_update_invoice_status_from_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_update_invoice_status_from_payment();

-- 5) Add index for invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_company_status_total
  ON public.invoices(company_id, status)
  WHERE total > 0;

-- 6) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.compute_invoice_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_status(uuid) TO authenticated;

COMMIT;
