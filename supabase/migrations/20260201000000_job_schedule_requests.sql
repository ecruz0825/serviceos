BEGIN;

-- =============================================================================
-- Job Schedule Requests: Customer self-scheduling with admin approval
-- Allows customers to request schedule dates for accepted quote jobs
-- =============================================================================

-- 1) Create job_schedule_requests table
CREATE TABLE IF NOT EXISTS public.job_schedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  quote_id uuid NULL REFERENCES public.quotes(id) ON DELETE SET NULL,
  public_token uuid NOT NULL,
  requested_date date NOT NULL,
  customer_note text NULL,
  status text NOT NULL DEFAULT 'requested', -- requested, approved, declined, canceled
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz NULL,
  approved_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  decline_reason text NULL
);

-- 2) Add indexes
CREATE INDEX IF NOT EXISTS idx_job_schedule_requests_company_status 
  ON public.job_schedule_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_job_schedule_requests_job_status 
  ON public.job_schedule_requests(job_id, status);

CREATE INDEX IF NOT EXISTS idx_job_schedule_requests_public_token 
  ON public.job_schedule_requests(public_token);

-- 3) Add status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_schedule_requests_status_check'
  ) THEN
    ALTER TABLE public.job_schedule_requests
      ADD CONSTRAINT job_schedule_requests_status_check 
      CHECK (status IN ('requested', 'approved', 'declined', 'canceled'));
  END IF;
END$$;

-- 4) Enable RLS
ALTER TABLE public.job_schedule_requests ENABLE ROW LEVEL SECURITY;

-- 5) RLS Policies
-- Admins can view/update requests for their company
CREATE POLICY "Admins can view schedule requests for their company"
  ON public.job_schedule_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.company_id = job_schedule_requests.company_id
    )
  );

CREATE POLICY "Admins can update schedule requests for their company"
  ON public.job_schedule_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.company_id = job_schedule_requests.company_id
    )
  );

-- Public can insert requests (via RPC only)
CREATE POLICY "Public can insert schedule requests via RPC"
  ON public.job_schedule_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 6) RPC: request_job_schedule_public
CREATE OR REPLACE FUNCTION public.request_job_schedule_public(
  p_token uuid,
  p_requested_date date,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_company_id uuid;
  v_job_id uuid;
  v_quote_id uuid;
  v_existing_request uuid;
  v_request_id uuid;
BEGIN
  -- Lookup quote by public_token
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.public_token = p_token
  FOR UPDATE;

  -- Check a) Quote exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Quote not found'
    );
  END IF;

  -- Check b) Quote status is 'accepted'
  IF v_quote.status != 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Quote must be accepted before scheduling'
    );
  END IF;

  -- Check c) Quote has converted_job_id
  IF v_quote.converted_job_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_job',
      'reason', 'Job not yet created from quote'
    );
  END IF;

  -- Extract IDs
  v_company_id := v_quote.company_id;
  v_job_id := v_quote.converted_job_id;
  v_quote_id := v_quote.id;

  -- Check d) Idempotency/rate limit: existing request within 24 hours
  SELECT id INTO v_existing_request
  FROM public.job_schedule_requests
  WHERE job_id = v_job_id
    AND status = 'requested'
    AND requested_date = p_requested_date
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF v_existing_request IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'already_requested',
      'requested_date', p_requested_date,
      'request_id', v_existing_request
    );
  END IF;

  -- Generate public_token for this request
  -- Use a deterministic token based on quote token + date for idempotency
  -- Or generate random UUID - let's use random for security
  -- Actually, we don't need public_token for requests since they're accessed via quote token
  -- But let's keep it for future public request status lookup if needed
  -- For now, we'll generate a random UUID

  -- Insert new request
  INSERT INTO public.job_schedule_requests (
    company_id,
    job_id,
    quote_id,
    public_token,
    requested_date,
    customer_note,
    status
  ) VALUES (
    v_company_id,
    v_job_id,
    v_quote_id,
    gen_random_uuid(), -- public_token for potential future public status lookup
    p_requested_date,
    p_customer_note,
    'requested'
  )
  RETURNING id INTO v_request_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'requested_date', p_requested_date
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.request_job_schedule_public(uuid, date, text) TO anon, authenticated;

-- 7) RPC: approve_job_schedule_request
CREATE OR REPLACE FUNCTION public.approve_job_schedule_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_request record;
  v_user_profile record;
  v_company_id uuid;
BEGIN
  -- Auth required
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'reason', 'Authentication required'
    );
  END IF;

  -- Get user profile
  SELECT p.role, p.company_id
  INTO v_user_profile
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'profile_not_found',
      'reason', 'User profile not found'
    );
  END IF;

  -- Must be admin
  IF v_user_profile.role != 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Admin role required'
    );
  END IF;

  -- Lock request row for update
  SELECT *
  INTO v_request
  FROM public.job_schedule_requests
  WHERE id = p_request_id
  FOR UPDATE;

  -- Check a) Request exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Schedule request not found'
    );
  END IF;

  -- Check b) Same company
  IF v_request.company_id != v_user_profile.company_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Request belongs to different company'
    );
  END IF;

  -- Check c) Status is 'requested'
  IF v_request.status != 'requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Request is not in requested status',
      'current_status', v_request.status
    );
  END IF;

  -- Update job: set service_date and scheduled_end_date
  UPDATE public.jobs
  SET 
    service_date = v_request.requested_date,
    scheduled_end_date = v_request.requested_date
  WHERE id = v_request.job_id;

  -- Update request: mark as approved
  UPDATE public.job_schedule_requests
  SET 
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid()
  WHERE id = p_request_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_request.job_id,
    'service_date', v_request.requested_date
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.approve_job_schedule_request(uuid) TO authenticated;

-- 8) RPC: decline_job_schedule_request
CREATE OR REPLACE FUNCTION public.decline_job_schedule_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_request record;
  v_user_profile record;
BEGIN
  -- Auth required
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'reason', 'Authentication required'
    );
  END IF;

  -- Get user profile
  SELECT p.role, p.company_id
  INTO v_user_profile
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'profile_not_found',
      'reason', 'User profile not found'
    );
  END IF;

  -- Must be admin
  IF v_user_profile.role != 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Admin role required'
    );
  END IF;

  -- Lock request row for update
  SELECT *
  INTO v_request
  FROM public.job_schedule_requests
  WHERE id = p_request_id
  FOR UPDATE;

  -- Check a) Request exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Schedule request not found'
    );
  END IF;

  -- Check b) Same company
  IF v_request.company_id != v_user_profile.company_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Request belongs to different company'
    );
  END IF;

  -- Check c) Status is 'requested'
  IF v_request.status != 'requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Request is not in requested status',
      'current_status', v_request.status
    );
  END IF;

  -- Update request: mark as declined
  UPDATE public.job_schedule_requests
  SET 
    status = 'declined',
    decline_reason = p_reason
  WHERE id = p_request_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'status', 'declined'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.decline_job_schedule_request(uuid, text) TO authenticated;

COMMIT;

