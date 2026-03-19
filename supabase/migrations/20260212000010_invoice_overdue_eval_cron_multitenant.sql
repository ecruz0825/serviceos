-- =============================================================================
-- Invoice Overdue Evaluation - Multi-Tenant Cron Function (Step 3B Hardening)
-- =============================================================================
-- Creates a cron-safe function that explicitly iterates through all companies
-- for scheduled job execution. This ensures reliable multi-tenant processing
-- without relying on current_company_id() being NULL.
--
-- Function: eval_invoices_overdue_all_companies
-- - Iterates through all companies in public.companies
-- - Processes overdue invoices for each company explicitly
-- - Returns total updated_count across all companies
-- - SECURITY DEFINER, restricted to service_role for cron execution
-- =============================================================================

BEGIN;

-- =============================================================================
-- Multi-Tenant Cron Function: eval_invoices_overdue_all_companies
-- =============================================================================

CREATE OR REPLACE FUNCTION public.eval_invoices_overdue_all_companies(p_limit int DEFAULT 500)
RETURNS TABLE (
  updated_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_record record;
  v_total_updated int := 0;
  v_company_updated int;
BEGIN
  -- Iterate through all companies
  FOR v_company_record IN
    SELECT DISTINCT id
    FROM public.companies
    ORDER BY id
  LOOP
    -- Process overdue invoices for this company
    WITH overdue_invoices AS (
      UPDATE public.invoices
      SET
        status = 'overdue',
        last_status_eval_at = now(),
        updated_at = now()
      WHERE
        company_id = v_company_record.id
        AND status NOT IN ('paid', 'void')
        AND due_date IS NOT NULL
        AND due_date < now()
        AND COALESCE(balance_due, 0) > 0
      RETURNING id
    )
    SELECT COUNT(*) INTO v_company_updated
    FROM overdue_invoices;

    -- Accumulate total updated count
    v_total_updated := v_total_updated + COALESCE(v_company_updated, 0);
  END LOOP;

  -- Return total count across all companies
  RETURN QUERY
  SELECT v_total_updated;
END;
$$;

-- Grant execute to service_role only (for cron jobs)
-- Note: authenticated users should use eval_invoices_overdue_for_company instead
GRANT EXECUTE ON FUNCTION public.eval_invoices_overdue_all_companies(int) TO service_role;

COMMIT;
