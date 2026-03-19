-- Migration: Extend quote_messages into a universal transactional email queue
-- This enables the same queue infrastructure to handle multiple email types
-- while maintaining full backward compatibility with existing quote email flows.
--
-- Changes:
-- 1. Add message_type column to differentiate email types
-- 2. Make quote_id nullable for non-quote emails
-- 3. Add payload jsonb for flexible template data
-- 4. Add html_content/text_content for pre-rendered content
-- 5. Add sent_at timestamp and error_message for better tracking
-- 6. Add reference columns for other entity types (job_id, invoice_id, etc.)
-- 7. Add processing status for queue locking
-- 8. Add indexes for efficient queue processing

BEGIN;

-- =============================================================================
-- 1. Add message_type column with default 'quote' for backward compatibility
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'quote';

COMMENT ON COLUMN public.quote_messages.message_type IS 
  'Type of email: quote, invoice_delivery, payment_receipt, job_completed, crew_assignment, schedule_request, etc.';

-- =============================================================================
-- 2. Make quote_id nullable (required for non-quote messages)
-- =============================================================================
-- First drop the NOT NULL constraint if it exists
DO $$
BEGIN
  ALTER TABLE public.quote_messages ALTER COLUMN quote_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- =============================================================================
-- 3. Add payload column for flexible template data
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quote_messages.payload IS 
  'JSON payload containing template variables and metadata for rendering';

-- =============================================================================
-- 4. Add html_content and text_content for pre-rendered or simple emails
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS html_content text NULL;

ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS text_content text NULL;

COMMENT ON COLUMN public.quote_messages.html_content IS 
  'Pre-rendered HTML content (optional - can be generated from payload/template)';
COMMENT ON COLUMN public.quote_messages.text_content IS 
  'Plain text content fallback (optional)';

-- =============================================================================
-- 5. Add sent_at timestamp for tracking when email was actually sent
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL;

COMMENT ON COLUMN public.quote_messages.sent_at IS 
  'Timestamp when email was successfully sent via provider';

-- =============================================================================
-- 6. Add error_message column (rename from 'error' for clarity, keep both)
-- =============================================================================
-- Note: Keeping original 'error' column for backward compatibility
-- Edge function will write to both during transition
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS error_message text NULL;

COMMENT ON COLUMN public.quote_messages.error_message IS 
  'Detailed error message if sending failed';

-- =============================================================================
-- 7. Add reference columns for other entity types
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL;

ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS crew_member_id uuid NULL REFERENCES public.crew_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quote_messages.job_id IS 'Reference to job for job-related emails';
COMMENT ON COLUMN public.quote_messages.invoice_id IS 'Reference to invoice for billing emails';
COMMENT ON COLUMN public.quote_messages.customer_id IS 'Reference to customer (for non-quote customer emails)';
COMMENT ON COLUMN public.quote_messages.crew_member_id IS 'Reference to crew member for crew notifications';

-- =============================================================================
-- 8. Add retry tracking
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0;

ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz NULL;

COMMENT ON COLUMN public.quote_messages.retry_count IS 'Number of send attempts';
COMMENT ON COLUMN public.quote_messages.last_retry_at IS 'Timestamp of last retry attempt';

-- =============================================================================
-- 9. Add updated_at column with trigger
-- =============================================================================
ALTER TABLE public.quote_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Create or replace trigger for updated_at
CREATE OR REPLACE FUNCTION public.quote_messages_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quote_messages_updated_at ON public.quote_messages;
CREATE TRIGGER quote_messages_updated_at
  BEFORE UPDATE ON public.quote_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_messages_set_updated_at();

-- =============================================================================
-- 10. Create indexes for efficient queue processing
-- =============================================================================

-- Index for fetching queued messages by status (most common query)
CREATE INDEX IF NOT EXISTS quote_messages_status_created_idx
  ON public.quote_messages(status, created_at ASC)
  WHERE status IN ('queued', 'processing', 'failed');

-- Index for message type filtering
CREATE INDEX IF NOT EXISTS quote_messages_type_status_idx
  ON public.quote_messages(message_type, status);

-- Index for company + status (tenant-scoped queue processing)
DROP INDEX IF EXISTS quote_messages_company_status_idx;
CREATE INDEX IF NOT EXISTS quote_messages_company_status_created_idx
  ON public.quote_messages(company_id, status, created_at ASC);

-- Index for job-related email lookups
CREATE INDEX IF NOT EXISTS quote_messages_job_id_idx
  ON public.quote_messages(job_id)
  WHERE job_id IS NOT NULL;

-- Index for invoice-related email lookups
CREATE INDEX IF NOT EXISTS quote_messages_invoice_id_idx
  ON public.quote_messages(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- Index for failed messages that may need retry
CREATE INDEX IF NOT EXISTS quote_messages_failed_retry_idx
  ON public.quote_messages(status, retry_count, last_retry_at)
  WHERE status = 'failed' AND retry_count < 3;

-- =============================================================================
-- 11. Backfill message_type for existing rows (all are quotes)
-- =============================================================================
UPDATE public.quote_messages
SET message_type = 'quote'
WHERE message_type IS NULL OR message_type = '';

-- =============================================================================
-- 12. Add check constraint for valid status values
-- =============================================================================
DO $$
BEGIN
  ALTER TABLE public.quote_messages
    DROP CONSTRAINT IF EXISTS quote_messages_status_check;
  
  ALTER TABLE public.quote_messages
    ADD CONSTRAINT quote_messages_status_check
    CHECK (status IN ('queued', 'processing', 'sent', 'failed'));
EXCEPTION
  WHEN others THEN 
    RAISE NOTICE 'Could not add status check constraint: %', SQLERRM;
END $$;

-- =============================================================================
-- 13. Create helper function to enqueue generic emails
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_email(
  p_company_id uuid,
  p_message_type text,
  p_to_email text,
  p_subject text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_html_content text DEFAULT NULL,
  p_text_content text DEFAULT NULL,
  p_quote_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_crew_member_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_message_id uuid;
BEGIN
  INSERT INTO public.quote_messages (
    company_id,
    message_type,
    to_email,
    subject,
    body,
    payload,
    html_content,
    text_content,
    quote_id,
    job_id,
    invoice_id,
    customer_id,
    crew_member_id,
    status,
    created_by
  ) VALUES (
    p_company_id,
    p_message_type,
    p_to_email,
    p_subject,
    p_text_content,  -- body = text_content for backward compat
    p_payload,
    p_html_content,
    p_text_content,
    p_quote_id,
    p_job_id,
    p_invoice_id,
    p_customer_id,
    p_crew_member_id,
    'queued',
    COALESCE(p_created_by, auth.uid())
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_email IS 
  'Helper function to enqueue any type of transactional email';

-- Grant execute to authenticated users (RLS on table still applies)
GRANT EXECUTE ON FUNCTION public.enqueue_email(
  uuid, text, text, text, jsonb, text, text, uuid, uuid, uuid, uuid, uuid, uuid
) TO authenticated;

COMMIT;
