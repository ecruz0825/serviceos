-- =============================================================================
-- Add 14-Day Trial to Bootstrap RPC
-- =============================================================================
-- Updates bootstrap_tenant_for_current_user to automatically start a 14-day
-- trial for newly created companies.
--
-- This migration adds trial billing fields:
-- - subscription_status = 'trialing'
-- - trial_ends_at = now() + interval '14 days'
-- - billing_updated_at = now()
--
-- Safety properties preserved:
-- - Conditional column checks (defensive pattern)
-- - Idempotency behavior
-- - All existing function behavior
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_tenant_for_current_user(
  p_company_name text,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_existing_company_id uuid;
  v_existing_role text;
  v_existing_full_name text;
  v_company_id uuid;
  v_company_name text;
  v_display_name text;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Validate company name
  v_company_name := NULLIF(btrim(COALESCE(p_company_name, '')), '');
  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'COMPANY_NAME_REQUIRED';
  END IF;

  v_display_name := NULLIF(btrim(COALESCE(p_display_name, '')), '');
  IF v_display_name IS NULL THEN
    v_display_name := v_company_name;
  END IF;

  -- 3) Load + lock caller profile row
  SELECT
    p.id,
    p.company_id,
    p.role,
    p.full_name
  INTO
    v_profile_id,
    v_existing_company_id,
    v_existing_role,
    v_existing_full_name
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- 4) Idempotency: if already linked, return existing company id
  IF v_existing_company_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_linked',
      'company_id', v_existing_company_id
    );
  END IF;

  -- 5) Create company with required base field
  INSERT INTO public.companies (
    name
  ) VALUES (
    v_company_name
  )
  RETURNING id INTO v_company_id;

  -- 6) Set optional company fields only when those columns exist
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'display_name'
  ) THEN
    UPDATE public.companies
    SET display_name = v_display_name
    WHERE id = v_company_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'onboarding_step'
  ) THEN
    UPDATE public.companies
    SET onboarding_step = 'company'
    WHERE id = v_company_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'setup_completed_at'
  ) THEN
    UPDATE public.companies
    SET setup_completed_at = NULL
    WHERE id = v_company_id;
  END IF;

  -- 7) Start 14-day trial for new companies
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'subscription_status'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'trial_ends_at'
  )
  THEN
    UPDATE public.companies
    SET
      subscription_status = 'trialing',
      trial_ends_at = now() + interval '14 days',
      billing_updated_at = now()
    WHERE id = v_company_id;
  END IF;

  -- 8) Link caller profile to company and promote to admin
  UPDATE public.profiles
  SET
    company_id = v_company_id,
    role = 'admin',
    full_name = CASE
      WHEN NULLIF(btrim(COALESCE(full_name, '')), '') IS NULL
           AND NULLIF(btrim(COALESCE(p_display_name, '')), '') IS NOT NULL
      THEN btrim(p_display_name)
      ELSE full_name
    END
  WHERE id = v_profile_id;

  -- 9) Created response
  RETURN jsonb_build_object(
    'ok', true,
    'status', 'created',
    'company_id', v_company_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_tenant_for_current_user(text, text) TO authenticated;

COMMIT;
