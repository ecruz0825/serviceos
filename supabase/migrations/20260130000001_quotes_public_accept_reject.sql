BEGIN;

-- =============================================================================
-- Quotes Public Accept/Reject Feature
-- Adds public token, accept/reject tracking, and job conversion
-- =============================================================================

-- 1) Add columns to public.quotes (idempotent)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS accepted_by_name text NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_name text NULL,
  ADD COLUMN IF NOT EXISTS customer_comment text NULL,
  ADD COLUMN IF NOT EXISTS converted_job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL;

-- 2) Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS quotes_public_token_unique_idx
  ON public.quotes(public_token)
  WHERE public_token IS NOT NULL;

-- Note: company_id, status and company_id, customer_id indexes already exist from initial migration

-- 3) Ensure quote_status enum includes accepted/rejected (already does, but verify)
-- The enum was created with: ('draft', 'sent', 'accepted', 'rejected', 'expired')
-- No action needed if already exists

-- 4) Create SECURITY DEFINER RPC: get_quote_public
CREATE OR REPLACE FUNCTION public.get_quote_public(p_token uuid)
RETURNS TABLE (
  id uuid,
  quote_number text,
  status text,
  services jsonb,
  subtotal numeric,
  tax numeric,
  total numeric,
  valid_until date,
  notes text,
  created_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  customer_full_name text,
  customer_email text,
  company_display_name text,
  company_name text,
  company_address text,
  company_support_phone text,
  company_support_email text,
  company_logo_path text,
  company_logo_url text,
  is_expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_expired boolean;
BEGIN
  -- Look up quote by public_token
  SELECT q.*, c.full_name, c.email, co.display_name, co.name, co.address, 
         co.support_phone, co.support_email, co.logo_path, co.logo_url
  INTO v_quote
  FROM public.quotes q
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = q.company_id
  WHERE q.public_token = p_token;

  -- If not found, return empty result
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check if expired: valid_until < now() and status='sent'
  v_expired := (v_quote.valid_until IS NOT NULL 
                AND v_quote.valid_until < CURRENT_DATE 
                AND v_quote.status = 'sent');

  -- If expired and still marked as 'sent', update status to 'expired' (safely)
  IF v_expired AND v_quote.status = 'sent' THEN
    UPDATE public.quotes
    SET status = 'expired'
    WHERE id = v_quote.id;
    v_quote.status := 'expired';
  END IF;

  -- Only allow viewing if status is in ('sent','accepted','rejected','expired')
  IF v_quote.status NOT IN ('sent','accepted','rejected','expired') THEN
    RETURN;
  END IF;

  -- Return quote data
  RETURN QUERY SELECT
    v_quote.id,
    v_quote.quote_number,
    v_quote.status::text,
    v_quote.services,
    v_quote.subtotal,
    v_quote.tax,
    v_quote.total,
    v_quote.valid_until,
    v_quote.notes,
    v_quote.created_at,
    v_quote.sent_at,
    v_quote.accepted_at,
    v_quote.rejected_at,
    v_quote.full_name,
    v_quote.email,
    v_quote.display_name,
    v_quote.name,
    v_quote.address,
    v_quote.support_phone,
    v_quote.support_email,
    v_quote.logo_path,
    v_quote.logo_url,
    v_expired;
END;
$$;

-- 5) Create SECURITY DEFINER RPC: respond_to_quote_public
CREATE OR REPLACE FUNCTION public.respond_to_quote_public(
  p_token uuid,
  p_action text,
  p_signer_name text,
  p_comment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_job_id uuid;
  v_services_text text;
  v_service record;
  v_admin_id uuid;
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept','reject') THEN
    RAISE EXCEPTION 'Invalid action. Must be "accept" or "reject"';
  END IF;

  -- Look up quote by token (lock row for update)
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.public_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Check if quote is in valid state for action
  IF v_quote.status != 'sent' THEN
    RAISE EXCEPTION 'Quote has already been %', v_quote.status;
  END IF;

  -- Check if expired
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Quote expired';
  END IF;

  -- Process accept action
  IF p_action = 'accept' THEN
    -- Update quote
    UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        accepted_by_name = p_signer_name,
        customer_comment = p_comment
    WHERE id = v_quote.id
    RETURNING id INTO v_quote.id;

    -- Build services_performed string from services jsonb
    v_services_text := '';
    FOR v_service IN 
      SELECT * FROM jsonb_array_elements(v_quote.services)
    LOOP
      IF v_services_text != '' THEN
        v_services_text := v_services_text || ', ';
      END IF;
      v_services_text := v_services_text || 
        COALESCE(v_service->>'name', 'Service') || 
        ' (' || COALESCE(v_service->>'qty', '1') || 
        ' x ' || COALESCE(v_service->>'rate', '0') || ')';
    END LOOP;

    -- Get company admin for created_by (if required)
    SELECT p.id INTO v_admin_id
    FROM public.profiles p
    WHERE p.company_id = v_quote.company_id
      AND p.role = 'admin'
    ORDER BY p.created_at
    LIMIT 1;

    -- Create job from quote
    -- Note: Using service_date (not scheduled_date) based on existing schema
    INSERT INTO public.jobs (
      customer_id,
      company_id,
      job_cost,
      services_performed,
      service_date,
      assigned_team_id,
      status,
      created_by
    ) VALUES (
      v_quote.customer_id,
      v_quote.company_id,
      v_quote.total,
      v_services_text,
      NULL,
      NULL,
      'Pending',
      v_admin_id
    )
    RETURNING id INTO v_job_id;

    -- Update quote with converted_job_id
    UPDATE public.quotes
    SET converted_job_id = v_job_id
    WHERE id = v_quote.id;

    -- Return success
    RETURN jsonb_build_object(
      'ok', true,
      'quote_id', v_quote.id,
      'new_status', 'accepted',
      'job_id', v_job_id
    );

  -- Process reject action
  ELSIF p_action = 'reject' THEN
    -- Update quote
    UPDATE public.quotes
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by_name = p_signer_name,
        customer_comment = p_comment
    WHERE id = v_quote.id;

    -- Return success
    RETURN jsonb_build_object(
      'ok', true,
      'quote_id', v_quote.id,
      'new_status', 'rejected',
      'job_id', NULL
    );
  END IF;
END;
$$;

-- 6) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_quote_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_quote_public(uuid, text, text, text) TO anon, authenticated;

COMMIT;

