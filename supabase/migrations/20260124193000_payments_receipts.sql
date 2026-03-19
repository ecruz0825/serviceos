BEGIN;

-- Add columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS received_by uuid;

-- Ensure received_by defaults to the current user
ALTER TABLE public.payments
  ALTER COLUMN received_by SET DEFAULT auth.uid();

-- Create a sequence for receipts (global per DB; acceptable for small businesses)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'payments_receipt_seq') THEN
    CREATE SEQUENCE public.payments_receipt_seq;
  END IF;
END$$;

-- Function to generate receipt numbers
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'RCPT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.payments_receipt_seq')::text, 6, '0')
$$;

-- Trigger to set receipt_number on insert if missing
CREATE OR REPLACE FUNCTION public.set_payment_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
    NEW.receipt_number := public.generate_receipt_number();
  END IF;

  IF NEW.received_by IS NULL THEN
    NEW.received_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_payment_receipt_number ON public.payments;

CREATE TRIGGER trg_set_payment_receipt_number
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.set_payment_receipt_number();

-- Add uniqueness constraint (use DO for idempotence)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_receipt_number_unique') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_receipt_number_unique UNIQUE (receipt_number);
  END IF;
END$$;

COMMIT;

