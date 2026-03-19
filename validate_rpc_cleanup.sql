-- =============================================================================
-- Validation Queries for logo_url RPC Cleanup
-- =============================================================================
-- Run these in Supabase SQL Editor after applying migration
-- 20260211000000_remove_logo_url_from_public_rpcs.sql
-- =============================================================================

-- Step 1: Get a valid public_token for testing
-- (Replace <TOKEN> below with an actual token from this query)
SELECT public_token 
FROM public.quotes 
WHERE public_token IS NOT NULL 
  AND status IN ('sent', 'accepted', 'rejected', 'expired')
LIMIT 1;

-- Step 2: Validate get_company_branding_public RPC
-- Replace <TOKEN> with a token from Step 1
SELECT public.get_company_branding_public('<TOKEN>') as brand;

-- Step 3: Validate get_quote_public RPC  
-- Replace <TOKEN> with a token from Step 1 (must be UUID format)
SELECT public.get_quote_public('<TOKEN>'::uuid) as quote;

-- Step 4: Check for logo_url in response (should return 0 rows)
-- This query checks if logo_url appears anywhere in the JSON response
-- Run this after getting a response from Step 2 or 3
-- (Manual inspection: search the JSON output for "logo_url" or "company_logo_url")

-- Alternative: Validate structure programmatically
-- For get_company_branding_public:
SELECT 
  jsonb_typeof(public.get_company_branding_public('<TOKEN>')) as response_type,
  public.get_company_branding_public('<TOKEN>') ? 'logo_url' as has_logo_url,
  public.get_company_branding_public('<TOKEN>') ? 'logo_path' as has_logo_path;

-- For get_quote_public:
SELECT 
  jsonb_typeof(public.get_quote_public('<TOKEN>'::uuid)) as response_type,
  public.get_quote_public('<TOKEN>'::uuid) ? 'logo_url' as has_logo_url,
  public.get_quote_public('<TOKEN>'::uuid)->'quote'->'company' ? 'logo_url' as nested_has_logo_url,
  public.get_quote_public('<TOKEN>'::uuid)->'quote'->'company' ? 'logo_path' as nested_has_logo_path;
