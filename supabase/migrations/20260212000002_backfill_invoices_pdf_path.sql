-- Sprint 1: establish invoices.pdf_path as canonical; legacy fields retained temporarily.
--
-- Idempotent backfill migration to populate invoices.pdf_path from existing data sources.
-- This migration can be run multiple times safely.
--
-- Strategy:
-- 1) Copy from invoices.invoice_pdf_path if pdf_path is NULL
-- 2) Copy from jobs.invoice_path if pdf_path is still NULL and job exists
-- 3) Optionally sync back to invoice_pdf_path for compatibility

BEGIN;

-- Step 1: Backfill pdf_path from invoice_pdf_path (if pdf_path is NULL and invoice_pdf_path exists)
UPDATE public.invoices
SET pdf_path = invoice_pdf_path
WHERE pdf_path IS NULL
  AND invoice_pdf_path IS NOT NULL
  AND invoice_pdf_path <> '';

-- Step 2: Backfill pdf_path from jobs.invoice_path (if pdf_path is still NULL and job has invoice_path)
UPDATE public.invoices i
SET pdf_path = j.invoice_path
FROM public.jobs j
WHERE i.pdf_path IS NULL
  AND i.job_id IS NOT NULL
  AND i.job_id = j.id
  AND j.invoice_path IS NOT NULL
  AND j.invoice_path <> '';

-- Step 3: Optional compatibility - sync pdf_path back to invoice_pdf_path (if invoice_pdf_path is NULL and pdf_path exists)
UPDATE public.invoices
SET invoice_pdf_path = pdf_path
WHERE invoice_pdf_path IS NULL
  AND pdf_path IS NOT NULL
  AND pdf_path <> '';

COMMIT;
