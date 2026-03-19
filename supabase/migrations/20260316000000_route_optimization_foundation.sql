-- =============================================================================
-- Route Optimization Foundation (Phase 1)
-- =============================================================================
-- Creates database foundation for v1 team-scoped route optimization:
-- 1. route_runs table (one route per team per service date)
-- 2. route_stops table (ordered stops within a route)
-- 3. RLS policies for multi-tenant safety
-- 4. Indexes for performance
-- 5. RPCs for generating and reading routes
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: route_runs table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.route_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  generation_method text NOT NULL DEFAULT 'optimized',
  total_stops integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT route_runs_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT route_runs_generation_method_check CHECK (generation_method IN ('optimized', 'manual')),
  CONSTRAINT route_runs_total_stops_non_negative CHECK (total_stops >= 0)
);

-- =============================================================================
-- PART 2: route_stops table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  route_run_id uuid NOT NULL REFERENCES public.route_runs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stop_order integer NOT NULL,
  address_snapshot text,
  latitude double precision,
  longitude double precision,
  estimated_travel_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT route_stops_stop_order_positive CHECK (stop_order > 0),
  CONSTRAINT route_stops_unique_route_order UNIQUE (route_run_id, stop_order),
  CONSTRAINT route_stops_unique_job_per_route UNIQUE (route_run_id, job_id)
);

-- =============================================================================
-- PART 3: Indexes
-- =============================================================================

-- route_runs indexes
CREATE INDEX IF NOT EXISTS idx_route_runs_company_service_team
  ON public.route_runs (company_id, service_date, team_id);

CREATE INDEX IF NOT EXISTS idx_route_runs_team_service
  ON public.route_runs (team_id, service_date);

CREATE INDEX IF NOT EXISTS idx_route_runs_status
  ON public.route_runs (status) WHERE status IN ('draft', 'published');

-- route_stops indexes
CREATE INDEX IF NOT EXISTS idx_route_stops_route_order
  ON public.route_stops (route_run_id, stop_order);

CREATE INDEX IF NOT EXISTS idx_route_stops_company_team
  ON public.route_stops (company_id, team_id);

CREATE INDEX IF NOT EXISTS idx_route_stops_job
  ON public.route_stops (job_id);

-- =============================================================================
-- PART 4: updated_at triggers
-- =============================================================================

-- Note: public.set_updated_at() function already exists in prior migrations
-- (e.g., 20260216000020_cfo_collections_cases.sql, 20260128000000_quotes_module.sql)
-- Reusing existing helper function.

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS trg_route_runs_updated_at ON public.route_runs;
CREATE TRIGGER trg_route_runs_updated_at
  BEFORE UPDATE ON public.route_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_route_stops_updated_at ON public.route_stops;
CREATE TRIGGER trg_route_stops_updated_at
  BEFORE UPDATE ON public.route_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PART 5: Row Level Security (RLS)
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE public.route_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS route_runs_select_admin ON public.route_runs;
DROP POLICY IF EXISTS route_runs_select_crew ON public.route_runs;
DROP POLICY IF EXISTS route_runs_insert_admin ON public.route_runs;
DROP POLICY IF EXISTS route_runs_update_admin ON public.route_runs;
DROP POLICY IF EXISTS route_runs_delete_admin ON public.route_runs;

DROP POLICY IF EXISTS route_stops_select_admin ON public.route_stops;
DROP POLICY IF EXISTS route_stops_select_crew ON public.route_stops;
DROP POLICY IF EXISTS route_stops_insert_admin ON public.route_stops;
DROP POLICY IF EXISTS route_stops_update_admin ON public.route_stops;
DROP POLICY IF EXISTS route_stops_delete_admin ON public.route_stops;

-- route_runs RLS Policies

-- SELECT: Admin/manager/dispatcher can see all routes in their company
CREATE POLICY route_runs_select_admin
ON public.route_runs
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- SELECT: Crew can see routes for their assigned teams
CREATE POLICY route_runs_select_crew
ON public.route_runs
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    JOIN public.crew_members cm ON cm.id = tm.crew_member_id
    WHERE t.id = route_runs.team_id
      AND t.company_id = route_runs.company_id
      AND cm.user_id = auth.uid()
  )
);

-- INSERT: Admin/manager/dispatcher can create routes
CREATE POLICY route_runs_insert_admin
ON public.route_runs
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- UPDATE: Admin/manager/dispatcher can update routes
CREATE POLICY route_runs_update_admin
ON public.route_runs
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- DELETE: Admin/manager/dispatcher can delete routes
CREATE POLICY route_runs_delete_admin
ON public.route_runs
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- route_stops RLS Policies

-- SELECT: Admin/manager/dispatcher can see all stops in their company
CREATE POLICY route_stops_select_admin
ON public.route_stops
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- SELECT: Crew can see stops for routes assigned to their teams
CREATE POLICY route_stops_select_crew
ON public.route_stops
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.route_runs rr
    JOIN public.teams t ON t.id = rr.team_id
    JOIN public.team_members tm ON tm.team_id = t.id
    JOIN public.crew_members cm ON cm.id = tm.crew_member_id
    WHERE rr.id = route_stops.route_run_id
      AND rr.company_id = route_stops.company_id
      AND cm.user_id = auth.uid()
  )
);

-- INSERT: Admin/manager/dispatcher can create stops
CREATE POLICY route_stops_insert_admin
ON public.route_stops
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- UPDATE: Admin/manager/dispatcher can update stops
CREATE POLICY route_stops_update_admin
ON public.route_stops
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- DELETE: Admin/manager/dispatcher can delete stops
CREATE POLICY route_stops_delete_admin
ON public.route_stops
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- =============================================================================
-- PART 6: RPC - generate_team_route_for_day
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

GRANT EXECUTE ON FUNCTION public.generate_team_route_for_day(date, uuid) TO authenticated;

-- =============================================================================
-- PART 7: RPC - get_team_route_for_day
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_team_route_for_day(
  p_service_date date,
  p_team_id uuid
)
RETURNS TABLE (
  route_run_id uuid,
  service_date date,
  team_id uuid,
  status text,
  generation_method text,
  total_stops integer,
  created_at timestamptz,
  stop_order integer,
  job_id uuid,
  customer_id uuid,
  customer_name text,
  address text,
  latitude double precision,
  longitude double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_route_run_id uuid;
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

  -- 3) Validate parameters
  IF p_service_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING
      MESSAGE = 'p_service_date is required';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING
      MESSAGE = 'p_team_id is required';
  END IF;

  -- 4) Verify team belongs to caller's company
  IF NOT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND' USING
      MESSAGE = 'Team not found or does not belong to your company';
  END IF;

  -- 5) Find most relevant route (prefer published, otherwise latest draft)
  SELECT rr.id
  INTO v_route_run_id
  FROM public.route_runs rr
  WHERE rr.company_id = v_company_id
    AND rr.service_date = p_service_date
    AND rr.team_id = p_team_id
    AND (
      -- Role-based access check
      (v_role IN ('admin', 'manager', 'dispatcher'))
      OR (
        v_role = 'crew'
        AND EXISTS (
          SELECT 1
          FROM public.teams t
          JOIN public.team_members tm ON tm.team_id = t.id
          JOIN public.crew_members cm ON cm.id = tm.crew_member_id
          WHERE t.id = rr.team_id
            AND t.company_id = rr.company_id
            AND cm.user_id = v_user_id
        )
      )
    )
  ORDER BY
    CASE WHEN rr.status = 'published' THEN 1 ELSE 2 END,
    rr.created_at DESC
  LIMIT 1;

  -- If no route found, return empty result
  IF v_route_run_id IS NULL THEN
    RETURN;
  END IF;

  -- 6) Return route header and stops
  RETURN QUERY
  SELECT
    rr.id AS route_run_id,
    rr.service_date,
    rr.team_id,
    rr.status,
    rr.generation_method,
    rr.total_stops,
    rr.created_at,
    rs.stop_order,
    rs.job_id,
    rs.customer_id,
    COALESCE(c.full_name, '—') AS customer_name,
    COALESCE(rs.address_snapshot, c.address, '') AS address,
    COALESCE(rs.latitude, c.latitude) AS latitude,
    COALESCE(rs.longitude, c.longitude) AS longitude
  FROM public.route_runs rr
  JOIN public.route_stops rs ON rs.route_run_id = rr.id
  LEFT JOIN public.customers c ON c.id = rs.customer_id
  WHERE rr.id = v_route_run_id
  ORDER BY rs.stop_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_route_for_day(date, uuid) TO authenticated;

COMMIT;
