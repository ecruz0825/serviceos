# logo_url Cleanup Report

## 1. logo_url Usage Report

### Runtime Code (src/) - Files that SELECT logo_url but may not use it:

1. **src/pages/admin/QuotesAdmin.jsx:895**
   - Line 895: `.select('id, name, display_name, address, support_phone, support_email, logo_path, logo_url')`
   - **Status**: SELECTs `logo_url` but passes `companyData` to `generateQuotePDF()` which only uses `logo_path`
   - **Action**: Remove `logo_url` from SELECT

2. **src/pages/admin/QuoteBuilder.jsx:981**
   - Line 981: `.select('id, name, display_name, address, support_phone, support_email, logo_path, logo_url')`
   - **Status**: SELECTs `logo_url` but passes `companyData` to `generateQuotePDF()` which only uses `logo_path`
   - **Action**: Remove `logo_url` from SELECT

3. **src/pages/admin/JobsAdmin.jsx:900**
   - Line 900: `logo: settings?.logo_url || ""`
   - **Status**: Uses `logo_url` from settings (but `useCompanySettings` doesn't return `logo_url`)
   - **Action**: Change to use `logo_path` with signed URL generation (or remove if not needed)

### Database RPCs (supabase/migrations/) - Files that OUTPUT logo_url:

1. **supabase/migrations/20260210180000_extend_company_branding_and_fix_public_quote_branding.sql**
   - Line 194: `co.logo_url AS company_logo_url` (SELECT)
   - Line 265: `'company_logo_url', v_quote.company_logo_url` (JSON output)
   - Line 276: `'logo_url', v_quote.company_logo_url` (nested company object)
   - Line 321: `logo_url` (SELECT from companies)
   - Line 345: `'logo_url', v_company.logo_url` (JSON output)
   - **RPC**: `get_quote_public()` and `get_company_branding_public()`
   - **Action**: Remove from SELECTs and JSON outputs

2. **supabase/migrations/20260208000000_harden_audit_rate_limit_monitoring.sql**
   - Line 470: `co.logo_url AS company_logo_url` (SELECT)
   - Line 540: `'company_logo_url', v_quote.company_logo_url` (JSON output)
   - **RPC**: `get_quote_public()` (older version, superseded by 20260210180000)
   - **Action**: Already superseded, but verify latest migration removes it

3. **supabase/migrations/20260206000014_add_company_branding_to_public_rpc.sql**
   - Line 50: `co.logo_url AS company_logo_url` (SELECT)
   - Line 124: `'logo_url', v_quote.company_logo_url` (JSON output)
   - Line 164: `logo_url` (SELECT from companies)
   - Line 183: `'logo_url', v_company.logo_url` (JSON output)
   - **RPC**: `get_quote_public()` and `get_company_branding_public()`
   - **Action**: Already superseded, but verify latest migration removes it

4. **supabase/migrations/20260206000011_add_rate_limits_to_public_rpcs.sql**
   - Line 85: `co.logo_url AS company_logo_url` (SELECT)
   - Line 155: `'company_logo_url', v_quote.company_logo_url` (JSON output)
   - **RPC**: `get_quote_public()` (older version)
   - **Action**: Already superseded

5. **supabase/migrations/20260131124917_update_get_quote_public_add_last_viewed_at.sql**
   - Line 48: `co.logo_url AS company_logo_url` (SELECT)
   - Line 118: `'company_logo_url', v_quote.company_logo_url` (JSON output)
   - **RPC**: `get_quote_public()` (older version)
   - **Action**: Already superseded

6. **supabase/migrations/20260131123459_upgrade_get_quote_public.sql**
   - Line 52: `co.logo_url AS company_logo_url` (SELECT)
   - Line 122: `'company_logo_url', v_quote.company_logo_url` (JSON output)
   - **RPC**: `get_quote_public()` (older version)
   - **Action**: Already superseded

7. **supabase/migrations/20260130000001_quotes_public_accept_reject.sql**
   - Line 53: `company_logo_url text` (RETURNS TABLE column)
   - Line 66: `co.support_phone, co.support_email, co.logo_path, co.logo_url` (SELECT)
   - Line 119: `v_quote.logo_url` (RETURN QUERY output)
   - **RPC**: `get_quote_public(uuid)` - OLD TABLE-returning version (superseded by JSONB version)
   - **Status**: This is an older version that returns TABLE instead of JSONB. The latest version (20260210180000) uses JSONB and is the active one.
   - **Action**: Verify this old version is not used, but it's likely superseded. The migration file should be noted but the active RPC is the JSONB version.

## 2. SQL Query to Check Database State

Run this in Supabase SQL Editor to check the current state:

```sql
-- Check if companies.logo_url column exists
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'companies'
  AND column_name = 'logo_url';

-- Count rows with non-null logo_url
SELECT 
  COUNT(*) as total_companies,
  COUNT(logo_url) as companies_with_logo_url,
  COUNT(logo_path) as companies_with_logo_path
FROM public.companies;

-- Show sample rows with logo_url (if any)
SELECT 
  id,
  name,
  display_name,
  logo_url,
  logo_path
FROM public.companies
WHERE logo_url IS NOT NULL
LIMIT 10;
```

## 3. Summary

### Runtime Code:
- **3 files** SELECT `logo_url` but don't actually use it (only `logo_path` is used)
- **1 file** (JobsAdmin.jsx) references `settings?.logo_url` which doesn't exist in `useCompanySettings`

### Database RPCs:
- **Latest migration** (20260210180000) still outputs `logo_url` in:
  - `get_quote_public()` - returns `company_logo_url` and nested `logo_url`
  - `get_company_branding_public()` - returns `logo_url`
- **Older migrations** also had `logo_url` but are superseded

### Action Required:
1. Remove `logo_url` from RPC outputs (safe - idempotent)
2. Remove `logo_url` from source code SELECTs (safe - not used)
3. Fix JobsAdmin.jsx to use `logo_path` instead
4. Optionally drop `companies.logo_url` column (after verifying no data)
