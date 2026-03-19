-- =============================================================================
-- Optimized Route RPC (Scheduling Foundation)
-- =============================================================================
-- Returns same-day jobs ordered by nearest-neighbor geographic proximity.
-- Uses customer latitude/longitude and public.geo_distance_km().
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_optimized_route_for_day(
  p_service_date date
)
RETURNS TABLE (
  job_id uuid,
  customer_name text,
  latitude double precision,
  longitude double precision,
  route_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_current_job_id uuid;
  v_current_customer_name text;
  v_current_lat double precision;
  v_current_lon double precision;
  v_route_order integer := 1;
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

  -- 3) Role gate
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view optimized routes';
  END IF;

  -- 4) Validate parameters
  IF p_service_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING
      MESSAGE = 'p_service_date is required';
  END IF;

  -- 5) Candidate jobs with valid customer coordinates
  CREATE TEMP TABLE tmp_route_jobs (
    job_id uuid PRIMARY KEY,
    customer_name text,
    latitude double precision,
    longitude double precision
  ) ON COMMIT DROP;

  INSERT INTO tmp_route_jobs (job_id, customer_name, latitude, longitude)
  SELECT
    j.id,
    COALESCE(c.name, '—') AS customer_name,
    c.latitude,
    c.longitude
  FROM public.jobs j
  JOIN public.customers c
    ON c.id = j.customer_id
  WHERE j.company_id = v_company_id
    AND j.service_date = p_service_date
    AND COALESCE(j.status, '') NOT IN ('Canceled')
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL;

  -- No routeable jobs for this day
  IF NOT EXISTS (SELECT 1 FROM tmp_route_jobs) THEN
    RETURN;
  END IF;

  -- 6) Accumulate ordered results
  CREATE TEMP TABLE tmp_route_result (
    job_id uuid,
    customer_name text,
    latitude double precision,
    longitude double precision,
    route_order integer
  ) ON COMMIT DROP;

  -- 7) Pick first job arbitrarily (deterministic by UUID text sort)
  SELECT
    rj.job_id,
    rj.customer_name,
    rj.latitude,
    rj.longitude
  INTO
    v_current_job_id,
    v_current_customer_name,
    v_current_lat,
    v_current_lon
  FROM tmp_route_jobs rj
  ORDER BY rj.job_id::text
  LIMIT 1;

  INSERT INTO tmp_route_result (job_id, customer_name, latitude, longitude, route_order)
  VALUES (v_current_job_id, v_current_customer_name, v_current_lat, v_current_lon, v_route_order);

  DELETE FROM tmp_route_jobs WHERE job_id = v_current_job_id;

  -- 8) Repeatedly choose the closest remaining job
  WHILE EXISTS (SELECT 1 FROM tmp_route_jobs) LOOP
    v_route_order := v_route_order + 1;

    SELECT
      rj.job_id,
      rj.customer_name,
      rj.latitude,
      rj.longitude
    INTO
      v_current_job_id,
      v_current_customer_name,
      v_current_lat,
      v_current_lon
    FROM tmp_route_jobs rj
    ORDER BY public.geo_distance_km(
      v_current_lat,
      v_current_lon,
      rj.latitude,
      rj.longitude
    ) ASC, rj.job_id::text ASC
    LIMIT 1;

    INSERT INTO tmp_route_result (job_id, customer_name, latitude, longitude, route_order)
    VALUES (v_current_job_id, v_current_customer_name, v_current_lat, v_current_lon, v_route_order);

    DELETE FROM tmp_route_jobs WHERE job_id = v_current_job_id;
  END LOOP;

  -- 9) Return ordered route
  RETURN QUERY
  SELECT
    rr.job_id,
    rr.customer_name,
    rr.latitude,
    rr.longitude,
    rr.route_order
  FROM tmp_route_result rr
  ORDER BY rr.route_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_optimized_route_for_day(date) TO authenticated;

COMMIT;
