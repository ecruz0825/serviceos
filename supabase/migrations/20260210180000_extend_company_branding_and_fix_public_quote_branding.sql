BEGIN;

-- =============================================================================
-- Extend Company Branding + Fix get_quote_public primary_color Regression
-- =============================================================================
-- This migration:
-- 1. Adds white-label branding columns to public.companies
-- 2. Adds validation constraints for colors, domain, and email
-- 3. Fixes get_quote_public regression by re-adding primary_color
-- 4. Extends get_company_branding_public with new branding fields
-- =============================================================================

-- =============================================================================
-- PART A: Add Branding Columns to public.companies
-- =============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS email_from_address text,
  ADD COLUMN IF NOT EXISTS favicon_path text,
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS whitelabel_enabled boolean NOT NULL DEFAULT false;

-- =============================================================================
-- PART B: Add Validation Constraints
-- =============================================================================

-- Helper function to validate hex color format (#RRGGBB or #RGB)
CREATE OR REPLACE FUNCTION public.is_valid_hex_color(color text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT color IS NULL OR color ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$'
$$;

-- Helper function to validate basic email format
CREATE OR REPLACE FUNCTION public.is_valid_email_format(email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT email IS NULL OR email ~ '^[^@]+@[^@]+\.[^@]+$'
$$;

-- Helper function to validate domain format (basic check)
CREATE OR REPLACE FUNCTION public.is_valid_domain_format(domain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT domain IS NULL OR domain ~ '^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
$$;

-- Drop existing constraints if they exist (idempotent)
DO $$
BEGIN
  -- Drop secondary_color constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_secondary_color_hex_check' 
    AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT companies_secondary_color_hex_check;
  END IF;

  -- Drop accent_color constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_accent_color_hex_check' 
    AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT companies_accent_color_hex_check;
  END IF;

  -- Drop custom_domain constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_custom_domain_format_check' 
    AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT companies_custom_domain_format_check;
  END IF;

  -- Drop email_from_address constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_email_from_address_format_check' 
    AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT companies_email_from_address_format_check;
  END IF;
END $$;

-- Add constraints
ALTER TABLE public.companies
  ADD CONSTRAINT companies_secondary_color_hex_check 
    CHECK (public.is_valid_hex_color(secondary_color)),
  ADD CONSTRAINT companies_accent_color_hex_check 
    CHECK (public.is_valid_hex_color(accent_color)),
  ADD CONSTRAINT companies_custom_domain_format_check 
    CHECK (public.is_valid_domain_format(custom_domain)),
  ADD CONSTRAINT companies_email_from_address_format_check 
    CHECK (public.is_valid_email_format(email_from_address));

-- =============================================================================
-- PART C: Fix get_quote_public - Re-add primary_color
-- =============================================================================
-- Based on latest version from 20260208000000_harden_audit_rate_limit_monitoring.sql
-- Fixes regression where primary_color was removed

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
      'customer_full_name', v_quote.customer_full_name,
      'customer_email', v_quote.customer_email,
      
      -- Company info (for branding) - flat fields for backward compatibility
      'company_display_name', v_quote.company_display_name,
      'company_name', v_quote.company_name,
      'company_address', v_quote.company_address,
      'company_support_phone', v_quote.company_support_phone,
      'company_support_email', v_quote.company_support_email,
      'company_logo_path', v_quote.company_logo_path,
      'company_logo_url', v_quote.company_logo_url,
      'company_primary_color', v_quote.company_primary_color,
      
      -- Company info (nested object for BrandProvider compatibility)
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

-- =============================================================================
-- PART D: Extend get_company_branding_public with New Branding Fields
-- =============================================================================
-- Based on version from 20260206000014_add_company_branding_to_public_rpc.sql
-- Adds new branding fields to return payload

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
  SELECT 
    display_name,
    name,
    logo_path,
    logo_url,
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
  RETURN jsonb_build_object(
    'ok', true,
    'display_name', v_company.display_name,
    'name', v_company.name,
    'logo_path', v_company.logo_path,
    'logo_url', v_company.logo_url,
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
-- PART E: Ensure Grants Remain
-- =============================================================================

-- Grant execute to anon and authenticated (idempotent)
GRANT EXECUTE ON FUNCTION public.get_quote_public(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_branding_public(text) TO anon, authenticated;

COMMIT;
