-- =============================================================================
-- Invoice Balance Sync on Payment (Invoice Pipeline Step 2)
-- =============================================================================
-- Automatically keeps invoices.balance_due and status in sync with payments.
-- When a payment is posted (status='posted') with invoice_id, recalculate
-- the invoice balance_due and update status accordingly.
--
-- Features:
-- - Recalculates balance_due from posted payments
-- - Updates status to 'paid' when balance_due = 0
-- - Sets paid_at timestamp when fully paid
-- - Handles invoice_id changes and status changes
-- =============================================================================

BEGIN;

-- =============================================================================
-- A) Helper function: recalc_invoice_balance
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalc_invoice_balance(p_invoice_id uuid)
RETURNS TABLE (
  id uuid,
  balance_due numeric,
  status public.invoice_status,
  paid_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_invoice record;
  v_total numeric;
  v_total_paid numeric;
  v_balance_due numeric;
  v_current_status public.invoice_status;
  v_new_status public.invoice_status;
  v_paid_at timestamptz;
BEGIN
  -- Load invoice with FOR UPDATE to prevent race conditions
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;

  -- If invoice is void, do not update balance or status
  IF v_invoice.status = 'void' THEN
    RETURN QUERY
    SELECT
      v_invoice.id,
      v_invoice.balance_due,
      v_invoice.status,
      v_invoice.paid_at;
    RETURN;
  END IF;

  -- Sum posted payments for this invoice
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_paid
  FROM public.payments p
  WHERE p.invoice_id = p_invoice_id
    AND p.status = 'posted'
    AND (p.voided_at IS NULL);

  -- Calculate balance_due
  v_total := COALESCE(v_invoice.total, 0);
  v_balance_due := GREATEST(v_total - v_total_paid, 0);
  v_current_status := v_invoice.status;

  -- Determine new status and paid_at
  IF v_balance_due = 0 AND v_total > 0 THEN
    -- Fully paid
    v_new_status := 'paid';
    v_paid_at := COALESCE(v_invoice.paid_at, now());
  ELSIF v_balance_due > 0 AND v_current_status = 'paid' THEN
    -- Edge case: was paid, now has balance (partial refund or payment voided)
    -- Revert to 'sent' if sent_at exists, otherwise 'draft'
    IF v_invoice.sent_at IS NOT NULL THEN
      v_new_status := 'sent';
    ELSE
      v_new_status := 'draft';
    END IF;
    v_paid_at := NULL;
  ELSE
    -- Keep current status (draft, sent, overdue) or update if needed
    v_new_status := v_current_status;
    v_paid_at := v_invoice.paid_at;
  END IF;

  -- Update invoice
  UPDATE public.invoices
  SET
    balance_due = v_balance_due,
    status = v_new_status,
    paid_at = v_paid_at,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Return updated values
  RETURN QUERY
  SELECT
    v_invoice.id,
    v_balance_due,
    v_new_status,
    v_paid_at;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.recalc_invoice_balance(uuid) TO authenticated;

-- =============================================================================
-- B) Trigger function: trg_payments_sync_invoice_balance
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_payments_sync_invoice_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_invoice_id uuid;
  v_old_invoice_id uuid;
BEGIN
  -- Handle INSERT: sync invoice if invoice_id is set and status is 'posted'
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_id IS NOT NULL AND NEW.status = 'posted' THEN
      BEGIN
        PERFORM public.recalc_invoice_balance(NEW.invoice_id);
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail the payment operation
        RAISE WARNING 'Failed to sync invoice balance for invoice %: %', NEW.invoice_id, SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle UPDATE: sync invoice(s) if invoice_id or status changed
  IF TG_OP = 'UPDATE' THEN
    v_invoice_id := NEW.invoice_id;
    v_old_invoice_id := OLD.invoice_id;

    -- Case 1: invoice_id changed (payment moved to different invoice)
    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id != v_invoice_id THEN
      -- Recalc old invoice (payment removed)
      BEGIN
        PERFORM public.recalc_invoice_balance(v_old_invoice_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to sync old invoice balance for invoice %: %', v_old_invoice_id, SQLERRM;
      END;
    END IF;

    -- Case 2: invoice_id is set and (status changed to 'posted' OR invoice_id changed)
    IF v_invoice_id IS NOT NULL AND (
      (OLD.status != NEW.status AND NEW.status = 'posted') OR
      (v_old_invoice_id != v_invoice_id)
    ) THEN
      -- Recalc new invoice
      BEGIN
        PERFORM public.recalc_invoice_balance(v_invoice_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to sync invoice balance for invoice %: %', v_invoice_id, SQLERRM;
      END;
    END IF;

    RETURN NEW;
  END IF;

  -- Handle DELETE: sync invoice if invoice_id was set
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NOT NULL THEN
      BEGIN
        PERFORM public.recalc_invoice_balance(OLD.invoice_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to sync invoice balance after payment delete for invoice %: %', OLD.invoice_id, SQLERRM;
      END;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- =============================================================================
-- C) Create trigger on payments table
-- =============================================================================

DROP TRIGGER IF EXISTS trg_payments_sync_invoice_balance ON public.payments;

CREATE TRIGGER trg_payments_sync_invoice_balance
AFTER INSERT OR UPDATE OF status, amount, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_payments_sync_invoice_balance();

COMMIT;
