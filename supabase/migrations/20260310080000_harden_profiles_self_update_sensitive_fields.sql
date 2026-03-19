BEGIN;

-- =============================================================================
-- Harden profiles self-update for launch
-- =============================================================================
-- Goal:
-- - Keep existing self-service profile editing behavior
-- - Prevent authenticated users from self-mutating sensitive identity/tenant fields
--   through direct table UPDATEs
--
-- Sensitive fields blocked for self-updates:
-- - id
-- - email
-- - role
-- - company_id
-- - created_at
-- - updated_at
--
-- Notes:
-- - Existing RLS policy profiles_update_own remains (id = auth.uid()).
-- - This trigger adds column-level protection that RLS predicates alone do not provide.
-- - Service/definer update paths are preserved by bypassing checks for privileged DB roles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  -- Preserve trusted backend/system mutation paths (service role + definer-owned RPCs).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Enforce only for authenticated users updating their own profile row.
  IF auth.uid() IS NOT NULL AND OLD.id = auth.uid() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION 'FORBIDDEN_PROFILE_FIELD_UPDATE' USING
        MESSAGE = 'You cannot modify protected profile fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_sensitive_self_update ON public.profiles;

CREATE TRIGGER trg_guard_profiles_sensitive_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profiles_sensitive_self_update();

COMMIT;

