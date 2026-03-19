-- Sprint 1: introduce invoices.pdf_path as the canonical invoice PDF storage path.
-- Non-breaking: keeps invoice_pdf_path and jobs.invoice_path for backward compatibility.

BEGIN;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS pdf_path text;

COMMENT ON COLUMN public.invoices.pdf_path IS
'Canonical invoice PDF storage path (preferred). Backfilled from invoice_pdf_path and jobs.invoice_path; legacy columns retained temporarily.';

CREATE INDEX IF NOT EXISTS invoices_company_pdf_path_idx
ON public.invoices(company_id)
WHERE pdf_path IS NOT NULL AND pdf_path <> '';

COMMIT;
