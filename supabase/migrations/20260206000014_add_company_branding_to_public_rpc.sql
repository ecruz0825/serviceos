BEGIN;

-- =============================================================================
-- Add Company Branding to Public RPCs
-- Enhances get_quote_public to include primary_color and creates get_company_branding_public
-- =============================================================================

-- 1) Update get_quote_public to include primary_color
CREATE OR REPLACE FUNCTION public.get_quote_public(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_result jsonb;
BEGIN
  -- Look up quote by public_token with customer and company info
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
    co.logo_url AS company_logo_url,
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
      'customer', jsonb_build_object(
        'full_name', v_quote.customer_full_name,
        'email', v_quote.customer_email
      ),
      
      -- Company info (for branding)
      'company', jsonb_build_object(
        'display_name', v_quote.company_display_name,
        'name', v_quote.company_name,
        'address', v_quote.company_address,
        'support_phone', v_quote.company_support_phone,
        'support_email', v_quote.company_support_email,
        'logo_path', v_quote.company_logo_path,
        'logo_url', v_quote.company_logo_url,
        'primary_color', v_quote.company_primary_color
      )
    )
  );
END;
$$;

-- 2) Create get_company_branding_public RPC for public pages
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

  -- Load company branding
  SELECT 
    display_name,
    name,
    logo_path,
    logo_url,
    primary_color
  INTO v_company
  FROM public.companies
  WHERE id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'company_not_found'
    );
  END IF;

  -- Return company branding
  RETURN jsonb_build_object(
    'ok', true,
    'display_name', v_company.display_name,
    'name', v_company.name,
    'logo_path', v_company.logo_path,
    'logo_url', v_company.logo_url,
    'primary_color', v_company.primary_color
  );
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_quote_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_branding_public(text) TO anon, authenticated;

COMMIT;
