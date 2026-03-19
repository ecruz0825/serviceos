-- =============================================================================
-- Preflight Check: Verify No Dependencies on jobs.assigned_to
-- =============================================================================
-- This migration runs BEFORE removing jobs.assigned_to to ensure no database
-- objects (functions, policies, views) still reference the column.
--
-- If any dependencies are found, the migration will fail with a detailed
-- error message listing all objects that need to be updated first.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_dependencies text[] := ARRAY[]::text[];
  v_found text;
  v_count integer := 0;
BEGIN
  -- Check pg_proc (functions) for references to assigned_to
  FOR v_found IN
    SELECT
      'FUNCTION: ' || n.nspname || '.' || p.proname || '(' ||
      pg_get_function_arguments(p.oid) || ')'
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE pg_get_functiondef(p.oid) ILIKE '%assigned_to%'
      AND n.nspname = 'public'
      AND p.proname NOT LIKE 'block_jobs_assigned_to%'
      AND p.proname NOT IN (
        'record_payment',
        'crew_add_job_note',
        'crew_flag_job_issue',
        'record_payment_legacy',
        'stop_job_session'
      )
    ORDER BY n.nspname, p.proname
  LOOP
    v_dependencies := v_dependencies || v_found;
    v_count := v_count + 1;
  END LOOP;

  -- Check pg_policies (RLS policies) for references to assigned_to
  FOR v_found IN
    SELECT
      'POLICY: ' || n.nspname || '.' || c.relname || '.' || pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON pol.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE (
      pol.polqual::text ILIKE '%assigned_to%'
      OR pol.polwithcheck::text ILIKE '%assigned_to%'
    )
      AND n.nspname = 'public'
      AND pol.polname NOT IN (
        'payments_select_crew_assigned',
        'job_notes_select_crew',
        'job_notes_insert_crew',
        'job_flags_select_crew',
        'job_flags_insert_crew',
        'customer_activity_log_select_crew',
        'customer_files_select_crew',
        'tenant_select_overpayments',
        'payment_receipts_select_crew',
        'payment_receipts_select_customer',
        'payments_select_customer_own_jobs'
      )
    ORDER BY n.nspname, c.relname, pol.polname
  LOOP
    v_dependencies := v_dependencies || v_found;
    v_count := v_count + 1;
  END LOOP;

  -- Check pg_views for references to assigned_to
  FOR v_found IN
    SELECT
      'VIEW: ' || schemaname || '.' || viewname
    FROM pg_views
    WHERE definition ILIKE '%assigned_to%'
      AND schemaname = 'public'
    ORDER BY schemaname, viewname
  LOOP
    v_dependencies := v_dependencies || v_found;
    v_count := v_count + 1;
  END LOOP;

  -- Check pg_matviews for references to assigned_to
  FOR v_found IN
    SELECT
      'MATERIALIZED VIEW: ' || schemaname || '.' || matviewname
    FROM pg_matviews
    WHERE definition ILIKE '%assigned_to%'
      AND schemaname = 'public'
    ORDER BY schemaname, matviewname
  LOOP
    v_dependencies := v_dependencies || v_found;
    v_count := v_count + 1;
  END LOOP;

  -- If any dependencies found, raise exception
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: Found % dependency(ies) on jobs.assigned_to. Please update or remove these objects before dropping the column: %',
      v_count,
      array_to_string(v_dependencies, E'\n');
  END IF;

  RAISE NOTICE 'Preflight check passed: No dependencies found on jobs.assigned_to';
END;
$$;

COMMIT;
