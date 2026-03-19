-- =============================================================================
-- Invoice PDF Path Canonical + Legacy Sync
-- =============================================================================
-- Makes invoices.pdf_path the canonical column for invoice PDF storage.
-- Keeps invoice_pdf_path in sync for backwards compatibility.
--
-- Actions:
-- A) Backfill pdf_path from invoice_pdf_path if pdf_path is null/empty
-- B) Create trigger to keep pdf_path and invoice_pdf_path synchronized
-- C) Leave invoice_pdf_path column for backwards compatibility
-- =============================================================================

BEGIN;

-- =============================================================================
-- A) Backfill pdf_path from legacy invoice_pdf_path
-- =============================================================================

UPDATE public.invoices
SET pdf_path = invoice_pdf_path
WHERE (pdf_path IS NULL OR btrim(pdf_path) = '')
  AND invoice_pdf_path IS NOT NULL
  AND btrim(invoice_pdf_path) <> '';

-- =============================================================================
-- B) Create trigger function to sync pdf_path and invoice_pdf_path
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_invoice_pdf_paths()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If pdf_path is null/empty and invoice_pdf_path has a value, sync to pdf_path
  IF (NEW.pdf_path IS NULL OR btrim(NEW.pdf_path) = '')
     AND NEW.invoice_pdf_path IS NOT NULL 
     AND btrim(NEW.invoice_pdf_path) <> '' THEN
    NEW.pdf_path := NEW.invoice_pdf_path;
  END IF;

  -- If invoice_pdf_path is null/empty and pdf_path has a value, sync to invoice_pdf_path
  IF (NEW.invoice_pdf_path IS NULL OR btrim(NEW.invoice_pdf_path) = '')
     AND NEW.pdf_path IS NOT NULL 
     AND btrim(NEW.pdf_path) <> '' THEN
    NEW.invoice_pdf_path := NEW.pdf_path;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- C) Create trigger to execute sync function
-- =============================================================================

DROP TRIGGER IF EXISTS trg_sync_invoice_pdf_paths ON public.invoices;

CREATE TRIGGER trg_sync_invoice_pdf_paths
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_pdf_paths();

COMMIT;
