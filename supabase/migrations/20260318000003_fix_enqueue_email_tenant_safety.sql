-- Migration: Fix enqueue_email() tenant safety
-- 
-- Issue: The enqueue_email function was SECURITY DEFINER with GRANT to authenticated,
-- allowing any authenticated user to pass arbitrary company_id values and enqueue
-- emails for any company. This is a multi-tenant safety violation.
--
-- Fix: Add tenant validation that:
-- 1. For authenticated users: p_company_id must match their profile's company_id
-- 2. Service role callers can pass any company_id (for edge function usage)
--
-- This function is intended for:
-- - Backend RPCs that have already validated tenant context
-- - Edge functions using service role
-- - NOT for direct frontend calls with arbitrary company_id
--
-- Also updates error_message column comment to clarify it's the canonical field.

BEGIN;

-- =============================================================================
-- 1. Update error_message column comment to clarify canonical status
-- =============================================================================
COMMENT ON COLUMN public.quote_messages.error IS 
  'LEGACY: Error message if sending failed. Deprecated - use error_message instead. Kept for backward compatibility with existing quote UI code.';

COMMENT ON COLUMN public.quote_messages.error_message IS 
  'CANONICAL: Detailed error message if sending failed. This is the primary error field for the generic email system. New code should read this field.';

-- =============================================================================
-- 2. Replace enqueue_email with tenant-safe version
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
  v_caller_company_id uuid;
  v_is_service_role boolean;
BEGIN
  -- ==========================================================================
  -- TENANT SAFETY CHECK
  -- ==========================================================================
  -- Determine if caller is service role (edge functions, admin scripts)
  -- Service role has no auth.uid() or the JWT role claim is 'service_role'
  v_is_service_role := (
    auth.uid() IS NULL 
    OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );
  
  -- If not service role, validate company_id matches caller's company
  IF NOT v_is_service_role THEN
    SELECT company_id INTO v_caller_company_id
    FROM public.profiles
    WHERE id = auth.uid();
    
    IF v_caller_company_id IS NULL THEN
      RAISE EXCEPTION 'enqueue_email: caller has no company_id in profile';
    END IF;
    
    IF v_caller_company_id != p_company_id THEN
      RAISE EXCEPTION 'enqueue_email: company_id mismatch - cannot enqueue emails for other companies';
    END IF;
  END IF;
  -- ==========================================================================

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

-- =============================================================================
-- 3. Update function comment to document tenant safety posture
-- =============================================================================
COMMENT ON FUNCTION public.enqueue_email(
  uuid, text, text, text, jsonb, text, text, uuid, uuid, uuid, uuid, uuid, uuid
) IS 
'Enqueues a transactional email for processing by the send-quote-emails edge function.

TENANT SAFETY:
- Authenticated users can only enqueue emails for their own company
- Service role callers (edge functions) can enqueue for any company
- Direct frontend calls should NOT use this function with arbitrary company_id

INTENDED CALLERS:
- Backend RPCs that have already validated tenant context
- Edge functions using service role
- Admin operations with service role

ERROR FIELDS:
- On failure, both error (legacy) and error_message (canonical) are populated
- New code should read error_message';

COMMIT;
