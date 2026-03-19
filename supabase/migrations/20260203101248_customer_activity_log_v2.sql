BEGIN;

-- =============================================================================
-- Customer Activity Log v2: Extend with categories, related entities, severity
-- - Adds event_category, related_type, related_id, severity columns
-- - Adds indexes for performance
-- - Updates RPC function with backward compatibility
-- =============================================================================

-- 1) Add new columns to customer_activity_log (IF NOT EXISTS pattern)
DO $$
BEGIN
  -- Add event_category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customer_activity_log' 
      AND column_name = 'event_category'
  ) THEN
    ALTER TABLE public.customer_activity_log
      ADD COLUMN event_category text NULL;
  END IF;

  -- Add related_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customer_activity_log' 
      AND column_name = 'related_type'
  ) THEN
    ALTER TABLE public.customer_activity_log
      ADD COLUMN related_type text NULL;
  END IF;

  -- Add related_id (reuse existing if present, otherwise add)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customer_activity_log' 
      AND column_name = 'related_id'
  ) THEN
    ALTER TABLE public.customer_activity_log
      ADD COLUMN related_id uuid NULL;
  END IF;

  -- Add severity
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customer_activity_log' 
      AND column_name = 'severity'
  ) THEN
    ALTER TABLE public.customer_activity_log
      ADD COLUMN severity text NULL DEFAULT 'info';
  END IF;
END $$;

-- 2) Add indexes for performance (IF NOT EXISTS pattern)
CREATE INDEX IF NOT EXISTS customer_activity_log_company_customer_created_idx 
  ON public.customer_activity_log(company_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_activity_log_company_customer_category_idx 
  ON public.customer_activity_log(company_id, customer_id, event_category);

CREATE INDEX IF NOT EXISTS customer_activity_log_company_related_idx 
  ON public.customer_activity_log(company_id, related_type, related_id)
  WHERE related_type IS NOT NULL AND related_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_activity_log_company_event_type_idx 
  ON public.customer_activity_log(company_id, event_type);

-- 3) Update RPC function: log_customer_activity with new optional params
-- Backward compatible: old calls still work with default NULL values
CREATE OR REPLACE FUNCTION public.log_customer_activity(
  p_customer_id uuid,
  p_event_type text,
  p_event_title text,
  p_event_description text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_event_data jsonb DEFAULT '{}'::jsonb,
  -- New v2 parameters
  p_event_category text DEFAULT NULL,
  p_related_type text DEFAULT NULL,
  p_severity text DEFAULT 'info'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_log_id uuid;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get company_id and role from current user's profile
  SELECT company_id, role INTO v_company_id, v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User must be associated with a company';
  END IF;

  -- Only admins can log activity
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can log customer activity';
  END IF;

  -- Verify customer belongs to same company
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE id = p_customer_id
      AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Customer not found or access denied';
  END IF;

  -- Insert activity log with new columns
  INSERT INTO public.customer_activity_log (
    company_id,
    customer_id,
    event_type,
    event_title,
    event_description,
    related_id,
    event_data,
    event_category,
    related_type,
    severity,
    created_by
  )
  VALUES (
    v_company_id,
    p_customer_id,
    p_event_type,
    p_event_title,
    p_event_description,
    p_related_id,
    p_event_data,
    p_event_category,
    p_related_type,
    COALESCE(p_severity, 'info'),
    auth.uid()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMIT;
