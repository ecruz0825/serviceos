BEGIN;

-- =============================================================================
-- CFO Cockpit Phase C9: Auto Case Creation from Escalations
-- =============================================================================
-- Automatically opens collections cases for critical/high escalation rows.
-- This function can be called manually or scheduled via cron.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_collections_cases_from_escalations(
  p_as_of timestamptz DEFAULT now(),
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  cases_created_count integer,
  cases_existing_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_escalation record;
  v_case_result record;
  v_cases_created int := 0;
  v_cases_existing int := 0;
  v_limit_clamped int;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only roles allowed: admin, manager, dispatcher
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can sync cases from escalations';
  END IF;

  -- 4) Clamp limit to reasonable range
  v_limit_clamped := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));

  -- 5) Loop over critical/high escalations
  FOR v_escalation IN
    SELECT *
    FROM public.get_collections_escalations_for_company(v_limit_clamped, p_as_of)
    WHERE escalation_level IN ('critical', 'high')
  LOOP
    -- 6) Check if case already exists for this customer (non-closed) BEFORE calling open_or_get
    DECLARE
      v_existing_case_id uuid;
      v_case_existed_before boolean := false;
    BEGIN
      SELECT id INTO v_existing_case_id
      FROM public.collections_cases
      WHERE customer_id = v_escalation.customer_id
        AND company_id = v_company_id
        AND status != 'closed'
      LIMIT 1;

      IF v_existing_case_id IS NOT NULL THEN
        v_case_existed_before := true;
      END IF;

      -- 7) Call open_or_get_collections_case for each row (as required)
      BEGIN
        SELECT * INTO v_case_result
        FROM public.open_or_get_collections_case(
          p_customer_id := v_escalation.customer_id,
          p_reason := v_escalation.reason
        )
        LIMIT 1;

        -- 8) Track based on whether case existed before the call
        IF v_case_existed_before THEN
          v_cases_existing := v_cases_existing + 1;
        ELSE
          v_cases_created := v_cases_created + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Log error but continue processing other escalations
        RAISE WARNING 'Error creating case for customer %: %', v_escalation.customer_id, SQLERRM;
      END;
    END;
  END LOOP;

  -- 8) Return counts
  cases_created_count := v_cases_created;
  cases_existing_count := v_cases_existing;
  RETURN NEXT;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.sync_collections_cases_from_escalations(timestamptz, integer) TO authenticated;

COMMIT;
