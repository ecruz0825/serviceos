-- =============================================================================
-- Company-scoped recurring job generation (for scheduled/edge use)
-- =============================================================================
-- Adds generate_jobs_from_recurring_for_company(p_company_id uuid) so that
-- the edge function (service role) can invoke the same canonical logic as
-- the user-scoped generate_jobs_from_recurring() without auth.uid().
--
-- Logic: same as generate_jobs_from_recurring() but company comes from
-- parameter; includes billing check; duplicate check; last_generated_date;
-- copies team, services, cost; updates last_generated_date.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_jobs_from_recurring_for_company(p_company_id uuid)
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
  v_company_id uuid;
  v_subscription_status text;
  v_today date;
  v_recurring_job record;
  v_next_date date;
  v_base_date date;
  v_job_exists boolean;
  v_new_job_id uuid;
BEGIN
  -- 1) Validate input
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING MESSAGE = 'p_company_id is required';
  END IF;

  v_company_id := p_company_id;

  -- 2) Billing status check: reject unpaid/canceled (same as user-scoped RPC)
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

  -- 3) Get today's date
  v_today := CURRENT_DATE;

  -- 4) Loop through active recurring jobs for this company (same logic as user RPC)
  FOR v_recurring_job IN
    SELECT
      rj.id,
      rj.company_id,
      rj.customer_id,
      rj.start_date,
      rj.recurrence_type,
      rj.last_generated_date,
      rj.services_performed,
      rj.job_cost,
      rj.default_team_id
    FROM public.recurring_jobs rj
    WHERE rj.company_id = v_company_id
      AND rj.is_paused = false
  LOOP
    -- 5) Calculate next due date
    IF v_recurring_job.last_generated_date IS NOT NULL THEN
      v_base_date := v_recurring_job.last_generated_date;
      IF v_recurring_job.recurrence_type = 'weekly' THEN
        v_next_date := v_base_date + INTERVAL '7 days';
      ELSIF v_recurring_job.recurrence_type = 'biweekly' THEN
        v_next_date := v_base_date + INTERVAL '14 days';
      ELSIF v_recurring_job.recurrence_type = 'monthly' THEN
        v_next_date := v_base_date + INTERVAL '1 month';
      ELSE
        CONTINUE;
      END IF;
    ELSE
      IF v_recurring_job.start_date <= v_today THEN
        v_next_date := v_recurring_job.start_date;
      ELSE
        IF v_recurring_job.recurrence_type = 'weekly' THEN
          v_next_date := v_recurring_job.start_date + INTERVAL '7 days';
        ELSIF v_recurring_job.recurrence_type = 'biweekly' THEN
          v_next_date := v_recurring_job.start_date + INTERVAL '14 days';
        ELSIF v_recurring_job.recurrence_type = 'monthly' THEN
          v_next_date := v_recurring_job.start_date + INTERVAL '1 month';
        ELSE
          CONTINUE;
        END IF;
      END IF;
    END IF;

    -- 6) Only generate if next_date is today or in the past (due)
    IF v_next_date <= v_today THEN
      -- 7) Duplicate check: (recurring_job_id, service_date, company_id)
      SELECT EXISTS(
        SELECT 1
        FROM public.jobs j
        WHERE j.recurring_job_id = v_recurring_job.id
          AND j.service_date = v_next_date
          AND j.company_id = v_company_id
      ) INTO v_job_exists;

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

        UPDATE public.recurring_jobs rj
        SET last_generated_date = v_next_date
        WHERE rj.id = v_recurring_job.id
          AND rj.company_id = v_company_id;

        RETURN QUERY SELECT
          v_recurring_job.id,
          v_new_job_id,
          v_next_date,
          true;
      ELSE
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

-- Only service_role (edge function) can call this; prevents authenticated users from generating for arbitrary companies
GRANT EXECUTE ON FUNCTION public.generate_jobs_from_recurring_for_company(uuid) TO service_role;

COMMIT;
