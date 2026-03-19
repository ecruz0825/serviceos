-- =============================================================================
-- Fix Ambiguous Column References in generate_jobs_from_recurring()
-- =============================================================================
-- Fixes "column reference 'recurring_job_id' is ambiguous" error by fully
-- qualifying all table column references in SQL statements.
-- =============================================================================

BEGIN;

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

  -- 4) Get today's date
  v_today := CURRENT_DATE;

  -- 5) Loop through active recurring jobs for this company
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
        FROM public.jobs j
        WHERE j.recurring_job_id = v_recurring_job.id
          AND j.service_date = v_next_date
          AND j.company_id = v_company_id
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
        UPDATE public.recurring_jobs rj
        SET last_generated_date = v_next_date
        WHERE rj.id = v_recurring_job.id
          AND rj.company_id = v_company_id;

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

GRANT EXECUTE ON FUNCTION public.generate_jobs_from_recurring() TO authenticated;

COMMIT;
