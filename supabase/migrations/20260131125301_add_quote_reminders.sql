BEGIN;

-- =============================================================================
-- Add quote reminder tracking and RPCs for automated reminder enqueue
-- Uses last_reminded_at for idempotency/rate limiting
-- =============================================================================

-- 1) Add last_reminded_at column to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

-- 2) Create index for filtering
CREATE INDEX IF NOT EXISTS quotes_last_reminded_at_idx
  ON public.quotes (last_reminded_at)
  WHERE last_reminded_at IS NOT NULL;

-- 3) Create RPC: enqueue_quote_reminder_for_quote (single quote, manual action)
CREATE OR REPLACE FUNCTION public.enqueue_quote_reminder_for_quote(
  p_quote_id uuid,
  p_type text -- 'expiring_soon' or 'viewed_no_response'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_quote record;
  v_customer record;
  v_company record;
  v_subject text;
  v_body text;
  v_to_email text;
  v_reminder_enqueued boolean := false;
BEGIN
  -- Verify caller is authenticated and admin
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required'
    );
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL OR v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized'
    );
  END IF;

  -- Validate reminder type
  IF p_type NOT IN ('expiring_soon', 'viewed_no_response') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_type'
    );
  END IF;

  -- Get quote with customer and company info
  SELECT q.*, c.full_name, c.email, co.display_name, co.name
  INTO v_quote
  FROM public.quotes q
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = q.company_id
  WHERE q.id = p_quote_id
    AND q.company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Check if quote is eligible for this reminder type
  IF p_type = 'expiring_soon' THEN
    -- Must be sent, not expired, expiring within 2 days
    IF v_quote.status <> 'sent' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'quote_not_eligible',
        'reason', 'Quote must be sent'
      );
    END IF;
    
    IF v_quote.expires_at IS NULL OR v_quote.expires_at < now() OR v_quote.expires_at > now() + interval '2 days' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'quote_not_eligible',
        'reason', 'Quote must expire within 2 days'
      );
    END IF;
  ELSIF p_type = 'viewed_no_response' THEN
    -- Must be sent, not expired, viewed at least 24 hours ago
    IF v_quote.status <> 'sent' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'quote_not_eligible',
        'reason', 'Quote must be sent'
      );
    END IF;
    
    IF v_quote.expires_at IS NOT NULL AND v_quote.expires_at < now() THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'quote_not_eligible',
        'reason', 'Quote is expired'
      );
    END IF;
    
    IF v_quote.last_viewed_at IS NULL OR v_quote.last_viewed_at > now() - interval '24 hours' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'quote_not_eligible',
        'reason', 'Quote must have been viewed at least 24 hours ago'
      );
    END IF;
  END IF;

  -- Check idempotency: only enqueue if not reminded in last 24 hours
  IF v_quote.last_reminded_at IS NOT NULL AND v_quote.last_reminded_at > now() - interval '24 hours' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'Reminder already sent in last 24 hours'
    );
  END IF;

  -- Get customer email
  v_to_email := v_quote.email;
  IF v_to_email IS NULL OR v_to_email = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_customer_email'
    );
  END IF;

  -- Build subject and body based on type
  IF p_type = 'expiring_soon' THEN
    v_subject := 'Reminder: Quote ' || v_quote.quote_number || ' expires soon';
    v_body := 'Dear ' || COALESCE(v_quote.full_name, 'Customer') || E'\n\n' ||
              'This is a friendly reminder that your quote ' || v_quote.quote_number || 
              ' expires on ' || to_char(v_quote.expires_at, 'Month DD, YYYY') || E'.\n\n' ||
              'Total: $' || COALESCE(v_quote.total::text, '0.00') || E'\n\n' ||
              'Please let us know if you have any questions or would like to proceed.\n\n' ||
              'Best regards,\n' || COALESCE(v_quote.display_name, v_quote.name, 'Your Company');
  ELSIF p_type = 'viewed_no_response' THEN
    v_subject := 'Follow-up: Quote ' || v_quote.quote_number;
    v_body := 'Dear ' || COALESCE(v_quote.full_name, 'Customer') || E'\n\n' ||
              'We noticed you viewed quote ' || v_quote.quote_number || 
              ' and wanted to follow up.\n\n' ||
              'Total: $' || COALESCE(v_quote.total::text, '0.00') || E'\n\n' ||
              'If you have any questions or would like to discuss this quote, please don''t hesitate to reach out.\n\n' ||
              'Best regards,\n' || COALESCE(v_quote.display_name, v_quote.name, 'Your Company');
  END IF;

  -- Insert into quote_messages
  INSERT INTO public.quote_messages (
    company_id,
    quote_id,
    to_email,
    subject,
    body,
    status,
    created_by
  ) VALUES (
    v_company_id,
    v_quote.id,
    v_to_email,
    v_subject,
    v_body,
    'queued',
    auth.uid()
  );

  -- Update last_reminded_at
  UPDATE public.quotes
  SET last_reminded_at = now()
  WHERE id = p_quote_id;

  RETURN jsonb_build_object(
    'ok', true,
    'enqueued', true
  );
END;
$$;

-- 4) Create RPC: enqueue_quote_reminders (batch/nightly mode)
CREATE OR REPLACE FUNCTION public.enqueue_quote_reminders(p_mode text DEFAULT 'nightly')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_quote record;
  v_customer record;
  v_company record;
  v_subject text;
  v_body text;
  v_to_email text;
  v_expiring_enqueued int := 0;
  v_viewed_enqueued int := 0;
  v_skipped int := 0;
BEGIN
  -- Verify caller is authenticated and admin
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required'
    );
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL OR v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized'
    );
  END IF;

  -- Process expiring soon quotes
  FOR v_quote IN
    SELECT q.*, c.full_name, c.email, co.display_name, co.name
    FROM public.quotes q
    INNER JOIN public.customers c ON c.id = q.customer_id
    INNER JOIN public.companies co ON co.id = q.company_id
    WHERE q.company_id = v_company_id
      AND q.status = 'sent'
      AND q.expires_at IS NOT NULL
      AND q.expires_at >= now()
      AND q.expires_at <= now() + interval '2 days'
      AND (q.last_reminded_at IS NULL OR q.last_reminded_at < now() - interval '24 hours')
      AND c.email IS NOT NULL
      AND c.email <> ''
  LOOP
    -- Build reminder email
    v_subject := 'Reminder: Quote ' || v_quote.quote_number || ' expires soon';
    v_body := 'Dear ' || COALESCE(v_quote.full_name, 'Customer') || E'\n\n' ||
              'This is a friendly reminder that your quote ' || v_quote.quote_number || 
              ' expires on ' || to_char(v_quote.expires_at, 'Month DD, YYYY') || E'.\n\n' ||
              'Total: $' || COALESCE(v_quote.total::text, '0.00') || E'\n\n' ||
              'Please let us know if you have any questions or would like to proceed.\n\n' ||
              'Best regards,\n' || COALESCE(v_quote.display_name, v_quote.name, 'Your Company');

    -- Insert into quote_messages
    INSERT INTO public.quote_messages (
      company_id,
      quote_id,
      to_email,
      subject,
      body,
      status,
      created_by
    ) VALUES (
      v_company_id,
      v_quote.id,
      v_quote.email,
      v_subject,
      v_body,
      'queued',
      auth.uid()
    );

    -- Update last_reminded_at
    UPDATE public.quotes
    SET last_reminded_at = now()
    WHERE id = v_quote.id;

    v_expiring_enqueued := v_expiring_enqueued + 1;
  END LOOP;

  -- Process viewed no response quotes
  FOR v_quote IN
    SELECT q.*, c.full_name, c.email, co.display_name, co.name
    FROM public.quotes q
    INNER JOIN public.customers c ON c.id = q.customer_id
    INNER JOIN public.companies co ON co.id = q.company_id
    WHERE q.company_id = v_company_id
      AND q.status = 'sent'
      AND q.last_viewed_at IS NOT NULL
      AND q.last_viewed_at <= now() - interval '24 hours'
      AND (q.expires_at IS NULL OR q.expires_at >= now())
      AND (q.last_reminded_at IS NULL OR q.last_reminded_at < now() - interval '24 hours')
      AND c.email IS NOT NULL
      AND c.email <> ''
  LOOP
    -- Build reminder email
    v_subject := 'Follow-up: Quote ' || v_quote.quote_number;
    v_body := 'Dear ' || COALESCE(v_quote.full_name, 'Customer') || E'\n\n' ||
              'We noticed you viewed quote ' || v_quote.quote_number || 
              ' and wanted to follow up.\n\n' ||
              'Total: $' || COALESCE(v_quote.total::text, '0.00') || E'\n\n' ||
              'If you have any questions or would like to discuss this quote, please don''t hesitate to reach out.\n\n' ||
              'Best regards,\n' || COALESCE(v_quote.display_name, v_quote.name, 'Your Company');

    -- Insert into quote_messages
    INSERT INTO public.quote_messages (
      company_id,
      quote_id,
      to_email,
      subject,
      body,
      status,
      created_by
    ) VALUES (
      v_company_id,
      v_quote.id,
      v_quote.email,
      v_subject,
      v_body,
      'queued',
      auth.uid()
    );

    -- Update last_reminded_at
    UPDATE public.quotes
    SET last_reminded_at = now()
    WHERE id = v_quote.id;

    v_viewed_enqueued := v_viewed_enqueued + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'expiring_enqueued', v_expiring_enqueued,
    'viewed_enqueued', v_viewed_enqueued,
    'skipped', v_skipped
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.enqueue_quote_reminder_for_quote(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_quote_reminders(text) TO authenticated;

COMMIT;

