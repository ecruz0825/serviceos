BEGIN;

-- =============================================================================
-- Phase A.1 / Step 5A: Add billing-state enforcement to Priority 1 mutation RPCs
-- =============================================================================
-- Enforces read-only mode for unpaid/canceled tenants at the backend layer.
-- Policy:
--   - active => allowed
--   - trialing => allowed
--   - past_due => allowed
--   - unpaid => reject
--   - canceled => reject
-- =============================================================================

-- =============================================================================
-- 1. record_payment() - Add billing status check
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text DEFAULT NULL,
  p_external_ref text DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  job_id uuid,
  job_cost numeric,
  total_paid numeric,
  balance_due numeric,
  external_ref text,
  receipt_number text,
  received_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
#variable_conflict use_variable
DECLARE
  v_role text;
  v_company_id uuid;
  v_subscription_status text;
  v_job record;
  v_paid_so_far numeric;
  v_new_total numeric;
  v_allowed numeric;
  v_crew_member_id uuid;
  v_payment_id uuid;
  v_external_ref text;
  v_receipt_number text;
  v_received_by uuid;
  v_invoice record;
  v_invoice_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role NOT IN ('admin','crew') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  -- Billing status check: reject unpaid/canceled
  SELECT c.subscription_status INTO v_subscription_status
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_subscription_status IS NULL THEN
    -- Fail closed: unknown status treated as read-only
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = 'Workspace is in read-only mode. Please resolve billing to continue.';
  END IF;

  IF v_subscription_status IN ('unpaid', 'canceled') THEN
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = CASE
        WHEN v_subscription_status = 'unpaid' THEN
          'Workspace is in read-only mode due to unpaid billing. Please resolve billing to continue.'
        WHEN v_subscription_status = 'canceled' THEN
          'Workspace is in read-only mode due to canceled subscription. Please reactivate billing to continue.'
        ELSE
          'Workspace is in read-only mode. Please resolve billing to continue.'
      END;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Auto-link invoice_id if not provided and invoice exists for this job
  v_invoice_id := p_invoice_id;
  IF v_invoice_id IS NULL THEN
    SELECT i.id
    INTO v_invoice_id
    FROM public.invoices i
    WHERE i.job_id = p_job_id
      AND i.company_id = v_company_id
    LIMIT 1;
  END IF;

  -- If invoice_id is provided (or auto-linked), validate it exists and matches company + job
  IF v_invoice_id IS NOT NULL THEN
    SELECT *
    INTO v_invoice
    FROM public.invoices i
    WHERE i.id = v_invoice_id
      AND i.company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND';
    END IF;

    -- Validate invoice belongs to the same job
    IF v_invoice.job_id <> p_job_id THEN
      RAISE EXCEPTION 'INVOICE_JOB_MISMATCH';
    END IF;
  END IF;

  -- Lock job row for consistent totals
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Crew can only record payments for jobs assigned to their team
  -- Use team-based assignment if available, fall back to assigned_to for backward compatibility
  IF v_role = 'crew' THEN
    v_crew_member_id := public.current_crew_member_id();
    IF v_crew_member_id IS NULL THEN
      RAISE EXCEPTION 'CREW_NOT_LINKED';
    END IF;

    -- Check if job uses team-based assignment
    IF v_job.assigned_team_id IS NOT NULL THEN
      -- Team-based: verify crew member is on the assigned team
      IF NOT EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = v_job.assigned_team_id
          AND tm.crew_member_id = v_crew_member_id
      ) THEN
        RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';
      END IF;
    ELSE
      -- Legacy: fall back to assigned_to check
      IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN
        RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_CREW';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(SUM(pmt.amount), 0)
  INTO v_paid_so_far
  FROM public.payments pmt
  WHERE pmt.job_id = p_job_id
    AND pmt.company_id = v_company_id
    AND pmt.status = 'posted';

  v_new_total := v_paid_so_far + p_amount;
  v_allowed := COALESCE(v_job.job_cost, 0);

  -- Block overpayment (and log attempt)
  IF v_allowed > 0 AND v_new_total > v_allowed THEN
    INSERT INTO public.overpayments_log (job_id, crew_id, entered_amount, allowed_amount, company_id)
    VALUES (
      p_job_id,
      COALESCE(v_crew_member_id, public.current_crew_member_id()),
      p_amount,
      GREATEST(v_allowed - v_paid_so_far, 0),
      v_company_id
    );

    RAISE EXCEPTION 'OVERPAYMENT';
  END IF;

  -- Insert payment with explicit column names matching payments table schema
  INSERT INTO public.payments AS pmt (
    job_id,
    amount,
    payment_method,
    paid,
    date_paid,
    notes,
    company_id,
    paid_at,
    status,
    created_by,
    received_by,
    external_ref,
    invoice_id
  )
  VALUES (
    p_job_id,
    p_amount,
    p_method,
    true,
    CURRENT_DATE,
    p_notes,
    v_company_id,
    now(),
    'posted',
    auth.uid(),
    auth.uid(),
    p_external_ref,
    v_invoice_id  -- Use auto-linked invoice_id if found
  )
  RETURNING
    pmt.id,
    pmt.external_ref,
    pmt.receipt_number,
    pmt.received_by
  INTO v_payment_id, v_external_ref, v_receipt_number, v_received_by;

  -- Log audit entry (only on successful payment recording)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'payment',
      p_entity_id := v_payment_id,
      p_action := 'payment_recorded',
      p_metadata := jsonb_build_object(
        'payment_id', v_payment_id,
        'amount', p_amount,
        'job_id', p_job_id,
        'invoice_id', v_invoice_id  -- Log the invoice_id (may be auto-linked)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log payment audit: %', SQLERRM;
  END;

  payment_id := v_payment_id;
  job_id := p_job_id;
  job_cost := v_allowed;
  total_paid := v_new_total;
  balance_due := GREATEST(v_allowed - v_new_total, 0);
  external_ref := v_external_ref;
  receipt_number := v_receipt_number;
  received_by := v_received_by;

  RETURN NEXT;
END;
$$;

-- =============================================================================
-- 2. void_payment() - Add billing status check
-- =============================================================================

CREATE OR REPLACE FUNCTION public.void_payment(
  p_payment_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_subscription_status text;
  v_payment record;
  v_customer_id uuid;
  v_job_id uuid;
  v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Validate reason is provided and not empty
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  -- Billing status check: reject unpaid/canceled
  SELECT c.subscription_status INTO v_subscription_status
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_subscription_status IS NULL THEN
    -- Fail closed: unknown status treated as read-only
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = 'Workspace is in read-only mode. Please resolve billing to continue.';
  END IF;

  IF v_subscription_status IN ('unpaid', 'canceled') THEN
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = CASE
        WHEN v_subscription_status = 'unpaid' THEN
          'Workspace is in read-only mode due to unpaid billing. Please resolve billing to continue.'
        WHEN v_subscription_status = 'canceled' THEN
          'Workspace is in read-only mode due to canceled subscription. Please reactivate billing to continue.'
        ELSE
          'Workspace is in read-only mode. Please resolve billing to continue.'
      END;
  END IF;

  -- Lock payment row for update
  SELECT *
  INTO v_payment
  FROM public.payments pay
  WHERE pay.id = p_payment_id
    AND pay.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  -- Validate payment is posted (not already voided)
  IF v_payment.status <> 'posted' THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_VOIDED';
  END IF;

  -- Store values for logging
  v_job_id := v_payment.job_id;
  v_amount := v_payment.amount;

  -- Update payment to voided
  UPDATE public.payments
  SET status = 'voided',
      voided_at = now(),
      void_reason = trim(p_reason)
  WHERE id = p_payment_id;

  -- Get customer_id from job for timeline logging
  IF v_job_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer_id
    FROM public.jobs
    WHERE id = v_job_id
      AND company_id = v_company_id;
  END IF;

  -- Log to customer timeline (wrapped in exception handler so logging failure doesn't block void)
  IF v_customer_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_customer_activity(
        p_customer_id := v_customer_id,
        p_event_type := 'payment.voided',
        p_event_title := 'Payment voided',
        p_event_description := format('Payment of $%s voided. Reason: %s', v_amount, trim(p_reason)),
        p_event_category := 'payments',
        p_related_type := 'payment',
        p_related_id := p_payment_id,
        p_severity := 'warning',
        p_event_data := jsonb_build_object(
          'job_id', v_job_id,
          'amount', v_amount,
          'reason', trim(p_reason)
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Log warning but don't fail the void operation
        RAISE WARNING 'Failed to log payment void activity: %', SQLERRM;
    END;
  END IF;

  RETURN p_payment_id;
END;
$$;

-- =============================================================================
-- 3. generate_jobs_from_recurring() - Add billing status check
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_jobs_from_recurring()
RETURNS TABLE (
  recurring_job_id uuid,
  job_id uuid,
  service_date date,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_subscription_status text;
  v_today date;
  v_recurring_job record;
  v_next_date date;
  v_base_date date;
  v_job_exists boolean;
  v_new_job_id uuid;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Resolve caller profile
  SELECT company_id, role
  INTO v_company_id, v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Role gate (admin, manager, dispatcher only)
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can generate jobs from recurring schedules';
  END IF;

  -- Billing status check: reject unpaid/canceled
  SELECT c.subscription_status INTO v_subscription_status
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_subscription_status IS NULL THEN
    -- Fail closed: unknown status treated as read-only
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = 'Workspace is in read-only mode. Please resolve billing to continue.';
  END IF;

  IF v_subscription_status IN ('unpaid', 'canceled') THEN
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = CASE
        WHEN v_subscription_status = 'unpaid' THEN
          'Workspace is in read-only mode due to unpaid billing. Please resolve billing to continue.'
        WHEN v_subscription_status = 'canceled' THEN
          'Workspace is in read-only mode due to canceled subscription. Please reactivate billing to continue.'
        ELSE
          'Workspace is in read-only mode. Please resolve billing to continue.'
      END;
  END IF;

  -- 4) Get today's date
  v_today := CURRENT_DATE;

  -- 5) Loop through active recurring jobs for this company
  FOR v_recurring_job IN
    SELECT
      id,
      company_id,
      customer_id,
      start_date,
      recurrence_type,
      last_generated_date,
      services_performed,
      job_cost,
      default_team_id
    FROM public.recurring_jobs
    WHERE company_id = v_company_id
      AND is_paused = false
  LOOP
    -- 6) Calculate next due date as the immediate next occurrence
    -- First generation: use start_date if start_date <= today, otherwise start_date + interval
    -- Subsequent: use last_generated_date + one interval
    IF v_recurring_job.last_generated_date IS NOT NULL THEN
      -- Subsequent generation: add one interval to last_generated_date
      v_base_date := v_recurring_job.last_generated_date;
      IF v_recurring_job.recurrence_type = 'weekly' THEN
        v_next_date := v_base_date + INTERVAL '7 days';
      ELSIF v_recurring_job.recurrence_type = 'biweekly' THEN
        v_next_date := v_base_date + INTERVAL '14 days';
      ELSIF v_recurring_job.recurrence_type = 'monthly' THEN
        v_next_date := v_base_date + INTERVAL '1 month';
      ELSE
        -- Unknown recurrence type, skip this job
        CONTINUE;
      END IF;
    ELSE
      -- First generation: if start_date <= today, use start_date itself
      -- Otherwise, calculate start_date + interval (but won't generate since > today)
      IF v_recurring_job.start_date <= v_today THEN
        v_next_date := v_recurring_job.start_date;
      ELSE
        -- start_date is in the future, calculate next occurrence but won't generate
        IF v_recurring_job.recurrence_type = 'weekly' THEN
          v_next_date := v_recurring_job.start_date + INTERVAL '7 days';
        ELSIF v_recurring_job.recurrence_type = 'biweekly' THEN
          v_next_date := v_recurring_job.start_date + INTERVAL '14 days';
        ELSIF v_recurring_job.recurrence_type = 'monthly' THEN
          v_next_date := v_recurring_job.start_date + INTERVAL '1 month';
        ELSE
          -- Unknown recurrence type, skip this job
          CONTINUE;
        END IF;
      END IF;
    END IF;

    -- 7) Only generate if next_date is today or in the past (due)
    IF v_next_date <= v_today THEN
      -- 9) Check if job already exists for this recurring_job_id and service_date
      SELECT EXISTS(
        SELECT 1
        FROM public.jobs
        WHERE recurring_job_id = v_recurring_job.id
          AND service_date = v_next_date
          AND company_id = v_company_id
      ) INTO v_job_exists;

      -- 10) Create job if it doesn't exist
      IF NOT v_job_exists THEN
        INSERT INTO public.jobs (
          company_id,
          customer_id,
          service_date,
          services_performed,
          job_cost,
          recurring_job_id,
          assigned_team_id,
          status
        )
        VALUES (
          v_company_id,
          v_recurring_job.customer_id,
          v_next_date,
          COALESCE(v_recurring_job.services_performed, 'Recurring service'),
          COALESCE(v_recurring_job.job_cost, 0),
          v_recurring_job.id,
          v_recurring_job.default_team_id,
          'Pending'
        )
        RETURNING id INTO v_new_job_id;

        -- 11) Update last_generated_date
        UPDATE public.recurring_jobs
        SET last_generated_date = v_next_date
        WHERE id = v_recurring_job.id
          AND company_id = v_company_id;

        -- Return created job info
        RETURN QUERY SELECT
          v_recurring_job.id,
          v_new_job_id,
          v_next_date,
          true;
      ELSE
        -- Job already exists, return without creating
        RETURN QUERY SELECT
          v_recurring_job.id,
          NULL::uuid,
          v_next_date,
          false;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- =============================================================================
-- 4. generate_team_route_for_day() - Add billing status check
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_team_route_for_day(
  p_service_date date,
  p_team_id uuid
)
RETURNS TABLE (
  route_run_id uuid,
  service_date date,
  team_id uuid,
  total_stops integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_subscription_status text;
  v_route_run_id uuid;
  v_stop_order integer := 0;
  v_job_count integer := 0;
  v_current_job_id uuid;
  v_current_lat double precision;
  v_current_lon double precision;
  v_next_job_id uuid;
  v_next_lat double precision;
  v_next_lon double precision;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Resolve caller company
  SELECT p.company_id, p.role
  INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Role gate - only admin/manager/dispatcher can generate routes
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can generate routes';
  END IF;

  -- Billing status check: reject unpaid/canceled
  SELECT c.subscription_status INTO v_subscription_status
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_subscription_status IS NULL THEN
    -- Fail closed: unknown status treated as read-only
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = 'Workspace is in read-only mode. Please resolve billing to continue.';
  END IF;

  IF v_subscription_status IN ('unpaid', 'canceled') THEN
    RAISE EXCEPTION 'BILLING_READ_ONLY' USING
      MESSAGE = CASE
        WHEN v_subscription_status = 'unpaid' THEN
          'Workspace is in read-only mode due to unpaid billing. Please resolve billing to continue.'
        WHEN v_subscription_status = 'canceled' THEN
          'Workspace is in read-only mode due to canceled subscription. Please reactivate billing to continue.'
        ELSE
          'Workspace is in read-only mode. Please resolve billing to continue.'
      END;
  END IF;

  -- 4) Validate parameters
  IF p_service_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING
      MESSAGE = 'p_service_date is required';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING
      MESSAGE = 'p_team_id is required';
  END IF;

  -- 5) Verify team belongs to caller's company
  IF NOT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND' USING
      MESSAGE = 'Team not found or does not belong to your company';
  END IF;

  -- 6) Fetch candidate jobs with customer coordinates
  CREATE TEMP TABLE tmp_route_jobs (
    job_id uuid PRIMARY KEY,
    customer_id uuid,
    customer_name text,
    address text,
    latitude double precision,
    longitude double precision,
    route_order integer
  ) ON COMMIT DROP;

  INSERT INTO tmp_route_jobs (job_id, customer_id, customer_name, address, latitude, longitude, route_order)
  SELECT
    j.id,
    j.customer_id,
    COALESCE(c.full_name, '—') AS customer_name,
    c.address,
    c.latitude,
    c.longitude,
    COALESCE(j.route_order, 0) AS route_order
  FROM public.jobs j
  JOIN public.customers c ON c.id = j.customer_id
  WHERE j.company_id = v_company_id
    AND j.service_date = p_service_date
    AND j.assigned_team_id = p_team_id
    AND COALESCE(j.status, '') NOT IN ('Completed', 'Canceled')
    AND c.company_id = v_company_id;

  -- Count jobs for this route
  SELECT COUNT(*) INTO v_job_count FROM tmp_route_jobs;

  -- If no jobs, return empty result
  IF v_job_count = 0 THEN
    RETURN;
  END IF;

  -- 7) Create new draft route_run
  INSERT INTO public.route_runs (
    company_id,
    service_date,
    team_id,
    status,
    generation_method,
    total_stops,
    created_by
  )
  VALUES (
    v_company_id,
    p_service_date,
    p_team_id,
    'draft',
    'optimized',
    v_job_count,
    v_user_id
  )
  RETURNING id INTO v_route_run_id;

  -- 8) Order jobs using nearest-neighbor if coordinates available, otherwise fallback
  -- Check if we have coordinates for most jobs
  DECLARE
    v_jobs_with_coords integer;
    v_total_jobs integer;
  BEGIN
    SELECT COUNT(*) INTO v_total_jobs FROM tmp_route_jobs;
    SELECT COUNT(*) INTO v_jobs_with_coords
    FROM tmp_route_jobs
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

    -- If most jobs have coordinates, use nearest-neighbor optimization
    IF v_jobs_with_coords >= (v_total_jobs * 0.5) THEN
      -- Pick first job (deterministic by UUID text sort)
      SELECT
        rj.job_id,
        rj.customer_id,
        rj.customer_name,
        rj.address,
        rj.latitude,
        rj.longitude
      INTO
        v_current_job_id,
        v_current_lat,
        v_current_lon
      FROM tmp_route_jobs rj
      ORDER BY rj.job_id::text
      LIMIT 1;

      v_stop_order := 1;

      -- Insert first stop
      INSERT INTO public.route_stops (
        company_id,
        route_run_id,
        job_id,
        customer_id,
        team_id,
        stop_order,
        address_snapshot,
        latitude,
        longitude
      )
      SELECT
        v_company_id,
        v_route_run_id,
        v_current_job_id,
        customer_id,
        p_team_id,
        v_stop_order,
        address,
        latitude,
        longitude
      FROM tmp_route_jobs
      WHERE job_id = v_current_job_id;

      DELETE FROM tmp_route_jobs WHERE job_id = v_current_job_id;

      -- Repeatedly choose the closest remaining job
      WHILE EXISTS (SELECT 1 FROM tmp_route_jobs) LOOP
        v_stop_order := v_stop_order + 1;

        SELECT
          rj.job_id,
          rj.latitude,
          rj.longitude
        INTO
          v_next_job_id,
          v_next_lat,
          v_next_lon
        FROM tmp_route_jobs rj
        WHERE rj.latitude IS NOT NULL
          AND rj.longitude IS NOT NULL
        ORDER BY public.geo_distance_km(
          v_current_lat,
          v_current_lon,
          rj.latitude,
          rj.longitude
        ) ASC, rj.job_id::text ASC
        LIMIT 1;

        -- If no job with coordinates found, fall back to deterministic ordering
        IF v_next_job_id IS NULL THEN
          SELECT
            rj.job_id,
            rj.latitude,
            rj.longitude
          INTO
            v_next_job_id,
            v_next_lat,
            v_next_lon
          FROM tmp_route_jobs rj
          ORDER BY
            CASE WHEN rj.route_order IS NULL THEN 1 ELSE 0 END,
            rj.route_order ASC,
            rj.address ASC NULLS LAST,
            rj.job_id::text ASC
          LIMIT 1;
        END IF;

        -- Insert stop
        INSERT INTO public.route_stops (
          company_id,
          route_run_id,
          job_id,
          customer_id,
          team_id,
          stop_order,
          address_snapshot,
          latitude,
          longitude
        )
        SELECT
          v_company_id,
          v_route_run_id,
          v_next_job_id,
          customer_id,
          p_team_id,
          v_stop_order,
          address,
          latitude,
          longitude
        FROM tmp_route_jobs
        WHERE job_id = v_next_job_id;

        -- Update current position for next iteration
        v_current_job_id := v_next_job_id;
        v_current_lat := v_next_lat;
        v_current_lon := v_next_lon;

        DELETE FROM tmp_route_jobs WHERE job_id = v_next_job_id;
      END LOOP;
    ELSE
      -- Fallback: deterministic ordering without coordinates
      -- Order by: existing route_order (if present), then address, then job_id
      INSERT INTO public.route_stops (
        company_id,
        route_run_id,
        job_id,
        customer_id,
        team_id,
        stop_order,
        address_snapshot,
        latitude,
        longitude
      )
      SELECT
        v_company_id,
        v_route_run_id,
        job_id,
        customer_id,
        p_team_id,
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN route_order IS NULL THEN 1 ELSE 0 END,
            route_order ASC,
            address ASC NULLS LAST,
            job_id::text ASC
        ) AS stop_order,
        address,
        latitude,
        longitude
      FROM tmp_route_jobs;
    END IF;
  END;

  -- 9) Return result
  RETURN QUERY
  SELECT
    v_route_run_id,
    p_service_date,
    p_team_id,
    v_job_count;
END;
$$;

COMMIT;
