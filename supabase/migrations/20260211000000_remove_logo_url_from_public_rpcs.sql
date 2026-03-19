BEGIN;

-- =============================================================================
-- Remove logo_url from Public RPCs
-- =============================================================================
-- This migration removes logo_url from get_quote_public() and get_company_branding_public()
-- The logo_path column is the source of truth for logos (stored in Supabase Storage)
-- logo_url was a legacy field that is no longer used
-- =============================================================================

-- =============================================================================
-- PART A: Update get_quote_public() - Remove logo_url
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_quote_public(
  p_token uuid,
  p_ip_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_result jsonb;
  v_rate_limit_key text;
BEGIN
  -- Rate limiting: quote viewed
  -- Build stable key from token
  v_rate_limit_key := 'quote_token:' || p_token::text;
  
  -- Check burst limit: 30 per minute (per token+ip)
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 30, 60, p_ip_address);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a moment and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;
  
  -- Check hourly limit: 120 per hour
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 120, 3600, p_ip_address);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a bit and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;

  -- Look up quote by public_token with customer and company info
  -- REMOVED: co.logo_url AS company_logo_url
  SELECT 
    q.id,
    q.public_token,
    q.quote_number,
    q.services,
    q.subtotal,
    q.tax,
    q.total,
    q.status,
    q.valid_until,
    q.expires_at,
    q.notes,
    q.created_at,
    q.updated_at,
    q.sent_at,
    q.accepted_at,
    q.rejected_at,
    q.accepted_by_name,
    q.rejected_by_name,
    q.customer_comment,
    q.converted_job_id,
    q.last_viewed_at,
    c.full_name AS customer_full_name,
    c.email AS customer_email,
    co.display_name AS company_display_name,
    co.name AS company_name,
    co.address AS company_address,
    co.support_phone AS company_support_phone,
    co.support_email AS company_support_email,
    co.logo_path AS company_logo_path,
    co.primary_color AS company_primary_color
  INTO v_quote
  FROM public.quotes q
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = q.company_id
  WHERE q.public_token = p_token
  LIMIT 1;

  -- If not found, return error response
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Only allow viewing if status is in ('sent','accepted','rejected','expired')
  IF v_quote.status NOT IN ('sent','accepted','rejected','expired') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Build and return success response with all quote data
  -- REMOVED: company_logo_url and nested logo_url
  RETURN jsonb_build_object(
    'ok', true,
    'quote', jsonb_build_object(
      -- Core quote fields
      'id', v_quote.id,
      'public_token', v_quote.public_token,
      'quote_number', v_quote.quote_number,
      'status', v_quote.status::text,
      'services', v_quote.services,
      'subtotal', v_quote.subtotal,
      'tax', v_quote.tax,
      'total', v_quote.total,
      'notes', v_quote.notes,
      
      -- Timestamps
      'created_at', v_quote.created_at,
      'updated_at', v_quote.updated_at,
      'sent_at', v_quote.sent_at,
      'accepted_at', v_quote.accepted_at,
      'rejected_at', v_quote.rejected_at,
      'last_viewed_at', v_quote.last_viewed_at,
      
      -- Expiration fields
      'valid_until', v_quote.valid_until,
      'expires_at', v_quote.expires_at,
      
      -- Response fields
      'accepted_by_name', v_quote.accepted_by_name,
      'rejected_by_name', v_quote.rejected_by_name,
      'customer_comment', v_quote.customer_comment,
      
      -- Job linkage
      'converted_job_id', v_quote.converted_job_id,
      
      -- Customer info
      'customer_full_name', v_quote.customer_full_name,
      'customer_email', v_quote.customer_email,
      
      -- Company info (for branding) - flat fields for backward compatibility
      'company_display_name', v_quote.company_display_name,
      'company_name', v_quote.company_name,
      'company_address', v_quote.company_address,
      'company_support_phone', v_quote.company_support_phone,
      'company_support_email', v_quote.company_support_email,
      'company_logo_path', v_quote.company_logo_path,
      'company_primary_color', v_quote.company_primary_color,
      
      -- Company info (nested object for BrandProvider compatibility)
      'company', jsonb_build_object(
        'display_name', v_quote.company_display_name,
        'name', v_quote.company_name,
        'address', v_quote.company_address,
        'support_phone', v_quote.company_support_phone,
        'support_email', v_quote.company_support_email,
        'logo_path', v_quote.company_logo_path,
        'primary_color', v_quote.company_primary_color
      )
    )
  );
END;
$$;

-- =============================================================================
-- PART B: Update get_company_branding_public() - Remove logo_url
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_company_branding_public(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote_id uuid;
  v_company_id uuid;
  v_company record;
BEGIN
  -- Try to find quote by token (supports both UUID and text tokens)
  SELECT q.id, q.company_id
  INTO v_quote_id, v_company_id
  FROM public.quotes q
  WHERE q.public_token::text = p_token
  LIMIT 1;

  -- If quote not found, return error
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Load company branding (including new fields)
  -- REMOVED: logo_url
  SELECT 
    display_name,
    name,
    logo_path,
    primary_color,
    secondary_color,
    accent_color,
    favicon_path,
    custom_domain,
    whitelabel_enabled
  INTO v_company
  FROM public.companies
  WHERE id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'company_not_found'
    );
  END IF;

  -- Return company branding (including new fields)
  -- REMOVED: logo_url
  RETURN jsonb_build_object(
    'ok', true,
    'display_name', v_company.display_name,
    'name', v_company.name,
    'logo_path', v_company.logo_path,
    'primary_color', v_company.primary_color,
    'secondary_color', v_company.secondary_color,
    'accent_color', v_company.accent_color,
    'favicon_path', v_company.favicon_path,
    'custom_domain', v_company.custom_domain,
    'whitelabel_enabled', v_company.whitelabel_enabled
  );
END;
$$;

-- =============================================================================
-- PART C: Ensure Grants Remain
-- =============================================================================

-- Grant execute to anon and authenticated (idempotent)
GRANT EXECUTE ON FUNCTION public.get_quote_public(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_branding_public(text) TO anon, authenticated;

COMMIT;
