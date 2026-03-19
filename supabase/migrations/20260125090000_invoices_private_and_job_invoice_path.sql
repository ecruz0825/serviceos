-- Migration: Harden invoice storage and add job invoice tracking
-- Makes invoices bucket private and adds invoice path tracking to jobs table

-- A) Make the invoices bucket PRIVATE (no public URL access)
UPDATE storage.buckets SET public = false WHERE id = 'invoices';

-- B) Add job invoice tracking columns (idempotent)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS invoice_path text,
  ADD COLUMN IF NOT EXISTS invoice_uploaded_at timestamptz;

