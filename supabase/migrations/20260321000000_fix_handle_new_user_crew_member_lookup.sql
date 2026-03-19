-- =============================================================================
-- Fix handle_new_user() to use crew_member_id from metadata for deterministic linking
-- - When crew_member_id is in metadata, look it up directly instead of email fallback
-- - Validates crew_member belongs to same company_id
-- - Preserves existing defensive behavior and tenant safety
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_profile_exists boolean;
  v_metadata_role text;
  v_metadata_company_id text;
  v_metadata_full_name text;
  v_metadata_crew_member_id text;
  v_company_id uuid;
  v_role text;
  v_full_name text;
  v_crew_member record;
  v_email_local_part text;
BEGIN
  -- 1) Early return if profile already exists
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO v_profile_exists;
  IF v_profile_exists THEN
    RETURN NEW;
  END IF;

  -- 2) Safely extract metadata (handle NULL or missing keys)
  v_metadata_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_metadata_company_id := NULLIF(NEW.raw_user_meta_data->>'company_id', '');
  v_metadata_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name', '');
  v_metadata_crew_member_id := NULLIF(NEW.raw_user_meta_data->>'crew_member_id', '');

  -- 3) Safely parse company_id from metadata (ignore malformed UUIDs)
  IF v_metadata_company_id IS NOT NULL THEN
    BEGIN
      v_company_id := v_metadata_company_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      -- Malformed UUID - ignore and set to NULL
      v_company_id := NULL;
    END;
  ELSE
    v_company_id := NULL;
  END IF;

  -- 4) Crew member lookup: prioritize crew_member_id from metadata, then email fallback
  -- This ensures deterministic linking for crew invites
  v_crew_member := NULL;
  
  -- 4a) If crew_member_id is in metadata, look it up directly (most reliable)
  IF v_metadata_crew_member_id IS NOT NULL THEN
    BEGIN
      SELECT cm.id, cm.company_id, cm.full_name, cm.role
      INTO v_crew_member
      FROM public.crew_members cm
      WHERE cm.id = v_metadata_crew_member_id::uuid
        AND cm.user_id IS NULL  -- Only match unlinked crew members
      LIMIT 1;
      
      -- Validate crew_member belongs to same company_id if company_id is in metadata
      IF FOUND AND v_company_id IS NOT NULL AND v_crew_member.company_id <> v_company_id THEN
        -- Company mismatch - log warning and clear crew_member
        RAISE WARNING 'Crew member % does not belong to company % (belongs to %)', 
          v_crew_member.id, v_company_id, v_crew_member.company_id;
        v_crew_member := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Invalid UUID or crew_member not found - log and continue to email fallback
      RAISE WARNING 'Failed to look up crew_member_id % from metadata: %', 
        v_metadata_crew_member_id, SQLERRM;
      v_crew_member := NULL;
    END;
  END IF;
  
  -- 4b) If no crew_member found yet, try email fallback (existing logic)
  -- Only use email fallback if role/company_id are missing OR if crew_member_id lookup failed
  IF v_crew_member.id IS NULL AND (v_metadata_role IS NULL OR v_company_id IS NULL) AND NEW.email IS NOT NULL THEN
    SELECT cm.id, cm.company_id, cm.full_name, cm.role
    INTO v_crew_member
    FROM public.crew_members cm
    WHERE LOWER(cm.email) = LOWER(NEW.email)
      AND cm.user_id IS NULL  -- Only match unlinked crew members
    LIMIT 1;

    IF FOUND THEN
      -- Use crew member data as defaults
      IF v_company_id IS NULL THEN
        v_company_id := v_crew_member.company_id;
      END IF;
      IF v_metadata_role IS NULL THEN
        -- Use crew member role if present, else default to 'crew'
        v_role := COALESCE(v_crew_member.role, 'crew');
      ELSE
        v_role := v_metadata_role;
      END IF;
      IF v_metadata_full_name IS NULL THEN
        v_full_name := v_crew_member.full_name;
      ELSE
        v_full_name := v_metadata_full_name;
      END IF;
    ELSE
      -- No crew match found - use metadata or defaults
      v_role := v_metadata_role;
      v_full_name := v_metadata_full_name;
    END IF;
  ELSE
    -- Metadata has role/company_id and crew_member was found via crew_member_id
    -- OR metadata has role/company_id but no crew_member_id was provided
    IF v_crew_member.id IS NOT NULL THEN
      -- Crew member found via crew_member_id - use its data for defaults
      IF v_company_id IS NULL THEN
        v_company_id := v_crew_member.company_id;
      END IF;
      IF v_metadata_full_name IS NULL THEN
        v_full_name := v_crew_member.full_name;
      END IF;
    END IF;
    v_role := v_metadata_role;
    IF v_full_name IS NULL THEN
      v_full_name := v_metadata_full_name;
    END IF;
  END IF;

  -- 5) Final role determination (never allow 'user')
  IF v_role IN ('admin', 'crew', 'customer', 'manager', 'dispatcher', 'platform_admin') THEN
    -- Keep explicit valid role
    NULL; -- v_role already set
  ELSIF v_crew_member.id IS NOT NULL THEN
    -- Crew match found - use crew role or default to 'crew'
    v_role := COALESCE(v_crew_member.role, 'crew');
  ELSE
    -- No valid role found - default to 'customer'
    v_role := 'customer';
  END IF;

  -- 6) Final full_name fallback (email local-part if nothing else)
  IF v_full_name IS NULL OR v_full_name = '' THEN
    IF NEW.email IS NOT NULL THEN
      -- Extract local part (before @)
      v_email_local_part := SPLIT_PART(NEW.email, '@', 1);
      v_full_name := v_email_local_part;
    ELSE
      v_full_name := NULL;
    END IF;
  END IF;

  -- 7) Validate company_id exists before insert
  IF v_company_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) THEN
      -- Company doesn't exist - set to NULL
      v_company_id := NULL;
    END IF;
  END IF;

  -- 8) Insert profile with validated data - WRAP IN EXCEPTION HANDLER
  -- This prevents profile creation failures from blocking auth user creation
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, company_id)
    VALUES (
      NEW.id,
      NEW.email,
      v_full_name,
      v_role,
      v_company_id
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    -- This prevents "Database error saving new user" from blocking auth user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    -- Continue - profile creation failure shouldn't block auth user creation
    -- The edge function will handle profile creation/update after auth user is created
  END;

  -- 9) Link crew_member if match was found (defensive - do not fail auth creation)
  IF v_crew_member.id IS NOT NULL THEN
    BEGIN
      UPDATE public.crew_members
      SET user_id = NEW.id
      WHERE id = v_crew_member.id
        AND user_id IS NULL  -- Safety: only update if still unlinked
        AND company_id = COALESCE(v_company_id, v_crew_member.company_id);  -- Additional tenant safety check
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      -- Crew member linking failure should not block auth user creation
      RAISE WARNING 'Failed to link crew_member % to user %: %', v_crew_member.id, NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
