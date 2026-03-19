-- =============================================================================
-- Geo Distance Function (Scheduling / Routing Foundation)
-- =============================================================================
-- Adds a reusable Haversine-based function to compute distance in kilometers
-- between two latitude/longitude points.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.geo_distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT
    6371.0 * 2.0 * atan2(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2.0), 2) +
        cos(radians(lat1)) *
        cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2.0), 2)
      ),
      sqrt(
        1.0 - (
          power(sin(radians(lat2 - lat1) / 2.0), 2) +
          cos(radians(lat1)) *
          cos(radians(lat2)) *
          power(sin(radians(lon2 - lon1) / 2.0), 2)
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.geo_distance_km(double precision, double precision, double precision, double precision) TO authenticated;

COMMIT;
