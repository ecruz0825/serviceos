# Customer Portal Invite / Token Debug Map

## Executive Summary

This document maps the complete "admin sends customer invite → customer clicks link → token is validated → customer gets into portal" flow and identifies potential root causes for token expiration/invalidation issues.

---

## 1. HIGH-LEVEL FLOW

### Step-by-Step Flow:

1. **Admin Triggers Invite**
   - Admin clicks "Invite to Portal" in CustomersAdmin.jsx
   - Function: `handleInviteToPortal(customer)`

2. **Invite Email Sent**
   - Method: `supabase.auth.signInWithOtp()` (for customers)
   - OR: `supabase.functions.invoke('invite-user')` → `admin.inviteUserByEmail()` (for crew/customers via edge function)
   - Email contains magic link with token

3. **Customer Clicks Link**
   - Link format: `{SITE_URL}/auth/callback?token_hash=...&type=magiclink` (or PKCE/implicit format)
   - Redirects to: `/auth/callback`

4. **AuthCallback Processes Token**
   - Extracts token from URL (PKCE code, token_hash, or implicit hash)
   - Calls `supabase.auth.exchangeCodeForSession()` or `verifyOtp()` or `setSession()`
   - Checks for `otp_expired` error in hash

5. **Session Established**
   - If successful, session is created
   - Reads `app_next` from `user_metadata` or `next` query param
   - Redirects to destination (default: `/customer/dashboard`)

6. **Customer Portal Entry**
   - ProtectedRoute checks `session` and `role === 'customer'`
   - UserContext auto-links customer record by email
   - Customer accesses portal

---

## 2. TOKEN DETAILS

### Token Generation Methods

#### Method 1: Direct `signInWithOtp` (Customer Invites)
**Location:** `src/pages/admin/CustomersAdmin.jsx` (line ~1260)

```javascript
supabase.auth.signInWithOtp({
  email: customer.email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback?next=/customer/dashboard`,
    shouldCreateUser: true
  }
})
```

**Characteristics:**
- Uses Supabase auth magic links
- `emailRedirectTo` includes `next` query param
- `shouldCreateUser: true` creates user on first click
- **No explicit TTL/expiry set** → Uses Supabase default (typically 1 hour for OTP)

#### Method 2: Edge Function `invite-user` (Crew/Customer via Function)
**Location:** `supabase/functions/invite-user/index.ts` (line ~39)

```typescript
supabase.auth.admin.inviteUserByEmail(
  email,
  { 
    data: { full_name, role, app_next }, 
    redirectTo: `${site}/auth/callback` 
  }
)
```

**Characteristics:**
- Uses `admin.inviteUserByEmail` (service role)
- `redirectTo` is clean callback URL (no query params)
- `app_next` stored in `user_metadata` (not URL)
- **No explicit TTL/expiry set** → Uses Supabase default (typically 24 hours for invites)

#### Method 3: Crew Invites (Legacy Pattern)
**Location:** `src/pages/admin/CrewAdmin.jsx` (line ~112)

```javascript
supabase.auth.signInWithOtp({
  email: row.email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback?next=/crew`,
    shouldCreateUser: true
  }
})
```

**Characteristics:**
- Same as Method 1 but for crew
- Redirects to `/crew` instead of `/customer/dashboard`

### Token Expiry Ownership

**Supabase-Managed:**
- All tokens are managed by Supabase Auth
- **No custom token table** found in migrations
- **No explicit TTL configuration** in code
- Default expiry:
  - OTP/magic links: **1 hour** (Supabase default)
  - Invite links: **24 hours** (Supabase default for `admin.inviteUserByEmail`)

**Key Finding:** Customer invites use `signInWithOtp` which has **1-hour expiry**, while edge function uses `admin.inviteUserByEmail` which has **24-hour expiry**. This inconsistency may cause confusion.

### Redirect/App_Next Fields

**Fields Used:**
1. **`emailRedirectTo`** (signInWithOtp): Full URL with query params
   - Format: `${origin}/auth/callback?next=/customer/dashboard`
   - Passed in email link

2. **`redirectTo`** (admin.inviteUserByEmail): Clean callback URL
   - Format: `${site}/auth/callback`
   - No query params (intentional to avoid nested params)

3. **`app_next`** (user metadata): Intended destination
   - Stored in `user.user_metadata.app_next`
   - Read by AuthCallback after session established
   - Values: `/crew` or `/customer/dashboard`

4. **`next`** (query param): Fallback destination
   - Read from URL: `searchParams.get('next')`
   - Default: `/customer/dashboard`
   - Used if `app_next` not in metadata

---

## 3. AUTH CALLBACK HANDLER

### File: `src/pages/AuthCallback.jsx`

**Location:** Route `/auth/callback`

**Token Reading Methods:**

1. **PKCE Format:** `?code=...`
   - Calls: `supabase.auth.exchangeCodeForSession(fullUrl)`

2. **Token Hash Format:** `?token_hash=...&type=magiclink|recovery|invite`
   - Calls: `supabase.auth.verifyOtp({ type, token_hash, email? })`

3. **Implicit Hash Format:** `#access_token=...&refresh_token=...`
   - Calls: `supabase.auth.setSession({ access_token, refresh_token })`

**Token Validation Logic:**

```javascript
// Check for Supabase error fragments FIRST
const hashError = hashParams.get("error");
const hashErrorCode = hashParams.get("error_code");

if (hashErrorCode === 'otp_expired') {
  errorMessage = "This link has expired. Please request a new one.";
  // Redirects to login
}
```

**Redirect Decision Logic:**

```javascript
// Priority order:
// 1. user_metadata.app_next (from invite flows)
// 2. next query param (from direct signInWithOtp)
// 3. Default: /customer/dashboard

const userMetadata = authResult.session.user.user_metadata
const appNext = userMetadata?.app_next
const redirectDestination = appNext || next
```

**Key Issues:**
- Only checks for `otp_expired` in hash (line ~70)
- Doesn't check for other expiry-related error codes
- 100ms delay after session creation (line ~196) - may be too short
- No retry logic for transient session establishment issues

---

## 4. CUSTOMER PORTAL ENTRY POINTS

### Portal Routes

**All routes protected by:** `ProtectedRoute allowedRoles={['customer']}`

**Routes:**
- `/customer` → DashboardPage
- `/customer/dashboard` → DashboardPage
- `/customer/jobs` → JobsListPage
- `/customer/jobs/:id` → JobDetailPage
- `/customer/quotes` → QuotesListPage
- `/customer/quotes/:id` → QuoteDetailPage
- `/customer/invoices` → InvoicesListPage
- `/customer/invoices/:id` → InvoiceDetailPage
- `/customer/schedule` → SchedulePage
- `/customer/profile` → ProfilePage

**Location:** `src/App.jsx` (lines ~277-376)

### Authentication Check

**File:** `src/ProtectedRoute.jsx`

**Logic:**
1. Checks `session?.user?.id` (from UserContext)
2. Checks `role === 'customer'` (from profiles table)
3. If no session or wrong role → redirects to `/customer/login`

**File:** `src/context/UserContext.jsx`

**Session Loading:**
- Calls `supabase.auth.getSession()` on mount
- Subscribes to `onAuthStateChange` for updates
- Auto-links customer record by email (lines ~14-118)

**Role Determination:**
- Reads from `profiles.role` table
- Auto-creates profile if missing (for customers)
- Never overwrites admin/crew roles

**Customer vs Admin Detection:**
- `role === 'customer'` → Customer portal
- `role === 'admin'` → Admin portal
- `role === 'crew'` → Crew portal
- No role → Error/redirect

---

## 5. ERRORS / EDGE CASES

### Error Handling Locations

#### 1. AuthCallback.jsx

**Error Detection:**
- Line ~60-88: Checks hash for `error` and `error_code`
- Line ~70: Specifically handles `otp_expired`
- Line ~129-136: PKCE exchange errors
- Line ~156-163: OTP verification errors
- Line ~175-182: Session setting errors

**Error Messages:**
- `otp_expired` → "This link has expired. Please request a new one."
- Generic → "Authentication failed. Please try again."
- No session → "Authentication failed. Please try again."

#### 2. AcceptInvite.jsx

**Error Detection:**
- Line ~16-28: Polls for session (immediate + 600ms delay)
- If no session after polling → "Invite link invalid or expired. Please request a new invite."

**Note:** This component appears to be for crew password setup, not customer portal.

#### 3. UserContext.jsx

**Error Handling:**
- Line ~128-130: Session error logged but not surfaced
- Line ~151-154: Profile error logged but not surfaced
- Auto-linking errors are logged but don't block login

### Known Error Modes

#### Mode 1: Token Expired
**Symptoms:**
- Customer clicks link → sees "This link has expired"
- Error code: `otp_expired` in URL hash

**Root Causes:**
- **1-hour expiry for `signInWithOtp`** - Customer may not check email immediately
- Link clicked after Supabase default TTL expires
- No explicit expiry extension in code

**Location:** AuthCallback.jsx line ~70

#### Mode 2: Invalid Token
**Symptoms:**
- Customer clicks link → sees "Authentication failed"
- No specific error code, just generic failure

**Root Causes:**
- Token already used (one-time use)
- Token corrupted in email client
- URL encoding issues
- Token format mismatch (PKCE vs token_hash vs implicit)

**Location:** AuthCallback.jsx line ~129, 156, 175

#### Mode 3: Session Not Found
**Symptoms:**
- Customer clicks link → AuthCallback succeeds but no session
- Redirects to login page

**Root Causes:**
- Race condition: session not established before redirect
- 100ms delay (line ~196) may be insufficient
- Browser storage issues (localStorage blocked)
- Session cleared before redirect

**Location:** AuthCallback.jsx line ~188-214

#### Mode 4: Missing Metadata
**Symptoms:**
- Customer clicks link → AuthCallback succeeds but wrong redirect
- May redirect to default `/customer/dashboard` instead of intended path

**Root Causes:**
- `app_next` not set in user_metadata (if using direct signInWithOtp)
- `next` query param missing or incorrect
- Metadata lost during user creation

**Location:** AuthCallback.jsx line ~202-207

---

## 6. LIKELY ROOT CAUSES

### Root Cause 1: 1-Hour Expiry Too Short

**Problem:**
- Customer invites use `signInWithOtp` which has **1-hour default expiry**
- Customers may not check email within 1 hour
- Edge function uses `admin.inviteUserByEmail` with **24-hour expiry** (inconsistent)

**Evidence:**
- `CustomersAdmin.jsx` line ~1260: Uses `signInWithOtp` (1-hour default)
- `invite-user/index.ts` line ~39: Uses `admin.inviteUserByEmail` (24-hour default)
- No explicit expiry configuration in either location

**Impact:**
- High likelihood of "token expired" errors
- Inconsistent behavior between invite methods

### Root Cause 2: No Explicit Expiry Configuration

**Problem:**
- No code sets `expiresIn` or similar TTL parameters
- Relies entirely on Supabase defaults
- Defaults may not match business requirements

**Evidence:**
- No `expiresIn` parameter in `signInWithOtp` calls
- No `expiresIn` parameter in `admin.inviteUserByEmail` calls
- No configuration in Supabase config.toml

**Impact:**
- Cannot control token lifetime
- Cannot extend expiry for specific use cases

### Root Cause 3: Race Condition in Session Establishment

**Problem:**
- AuthCallback waits only 100ms after session creation
- Session may not be fully established in localStorage
- Redirect happens before session is readable

**Evidence:**
- AuthCallback.jsx line ~196: `await new Promise(resolve => setTimeout(resolve, 100))`
- No verification that session is actually readable before redirect
- ProtectedRoute may check session before it's available

**Impact:**
- Intermittent "session not found" errors
- Customer redirected to login even though auth succeeded

### Root Cause 4: Inconsistent Redirect Handling

**Problem:**
- Two different patterns:
  1. Direct `signInWithOtp`: Uses `next` query param in `emailRedirectTo`
  2. Edge function: Uses `app_next` in user_metadata
- AuthCallback prioritizes `app_next` over `next`, but direct invites don't set `app_next`

**Evidence:**
- CustomersAdmin.jsx: Sets `next` in URL but not `app_next` in metadata
- invite-user function: Sets `app_next` in metadata but not `next` in URL
- AuthCallback.jsx line ~202-204: Reads `app_next` first, then `next`

**Impact:**
- Direct customer invites may not respect intended redirect
- Fallback to default `/customer/dashboard` may be incorrect

### Root Cause 5: Error Detection Gaps

**Problem:**
- Only checks for `otp_expired` explicitly
- Other expiry-related errors may be generic
- No retry logic for transient failures

**Evidence:**
- AuthCallback.jsx line ~70: Only `otp_expired` has specific message
- Other errors get generic "Authentication failed" message
- No distinction between expired vs invalid vs network errors

**Impact:**
- Poor error messages for customers
- Difficult to debug actual failure modes

---

## 7. TOUCHPOINTS FOR FIXES

### A) Invite Send Functions

**File:** `src/pages/admin/CustomersAdmin.jsx`
- **Function:** `handleInviteToPortal` (line ~1253)
- **Change:** Add explicit expiry or switch to edge function pattern
- **Options:**
  1. Add `expiresIn` to `signInWithOtp` options (if supported)
  2. Switch to calling `invite-user` edge function instead
  3. Use `admin.inviteUserByEmail` directly (requires service role)

**File:** `supabase/functions/invite-user/index.ts`
- **Function:** `serve` handler (line ~10)
- **Change:** Add explicit expiry to `admin.inviteUserByEmail` if possible
- **Note:** Check Supabase docs for expiry options

**File:** `src/pages/admin/CrewAdmin.jsx`
- **Function:** `inviteCrew` (line ~110)
- **Change:** Same as CustomersAdmin (for consistency)

**File:** `src/pages/admin/OnboardingWizard.jsx`
- **Function:** Crew invite (line ~465)
- **Change:** Same as above

### B) Callback Handler

**File:** `src/pages/AuthCallback.jsx`
- **Function:** `handleAuthCallback` (line ~27)
- **Changes Needed:**
  1. Increase session establishment delay (line ~196) or add verification
  2. Add retry logic for session reading
  3. Better error detection for all expiry-related errors
  4. Verify session exists before redirect (line ~188)
  5. Add logging for debugging token issues

### C) Portal Entry

**File:** `src/ProtectedRoute.jsx`
- **Function:** `ProtectedRoute` component
- **Changes Needed:**
  1. Add retry logic for session loading
  2. Better error messages for expired tokens
  3. Consider redirecting to invite resend page instead of login

**File:** `src/context/UserContext.jsx`
- **Function:** `loadUser` (line ~121)
- **Changes Needed:**
  1. Add retry logic for session establishment
  2. Better error handling for profile loading
  3. Consider caching session state

### D) Error Handling

**File:** `src/pages/AuthCallback.jsx`
- **Changes Needed:**
  1. Expand error code detection (not just `otp_expired`)
  2. Add specific messages for each error type
  3. Add "Resend Invite" button on expiry errors
  4. Log all error codes for debugging

---

## 8. FILES SUMMARY

### Core Invite Flow Files

1. **`src/pages/admin/CustomersAdmin.jsx`**
   - `handleInviteToPortal` (line ~1253)
   - Uses `signInWithOtp` with 1-hour default expiry

2. **`supabase/functions/invite-user/index.ts`**
   - Edge function for invites
   - Uses `admin.inviteUserByEmail` with 24-hour default expiry
   - Sets `app_next` in user_metadata

3. **`src/pages/AuthCallback.jsx`**
   - Handles all auth callback formats
   - Validates tokens and establishes sessions
   - Redirects based on `app_next` or `next` param

4. **`src/ProtectedRoute.jsx`**
   - Protects customer portal routes
   - Checks session and role

5. **`src/context/UserContext.jsx`**
   - Manages session and profile state
   - Auto-links customers by email

### Supporting Files

6. **`src/pages/customer/CustomerLogin.jsx`**
   - Customer login page
   - Redirects if already logged in

7. **`src/layouts/customer/CustomerAppShell.jsx`**
   - Customer portal layout
   - Navigation and branding

8. **`src/App.jsx`**
   - Route definitions
   - ProtectedRoute wrappers for customer routes

9. **`src/AcceptInvite.jsx`**
   - Crew password setup (not used for customer portal)
   - Has session polling logic

### Configuration Files

10. **`supabase/config.toml`**
    - Edge function configuration
    - No auth expiry settings found

11. **`src/supabaseClient.js`**
    - Supabase client initialization
    - Auth config: `detectSessionInUrl: true`, `autoRefreshToken: true`

---

## 9. RECOMMENDATIONS

### Immediate Fixes

1. **Standardize Invite Method:**
   - Use edge function `invite-user` for all invites (customers and crew)
   - Provides consistent 24-hour expiry
   - Centralizes invite logic

2. **Add Explicit Expiry:**
   - If Supabase supports it, add `expiresIn` parameter
   - Set to 24-48 hours for customer invites
   - Document the expiry time in UI

3. **Improve Session Verification:**
   - Increase delay or add verification loop in AuthCallback
   - Verify session exists before redirect
   - Add retry logic for transient failures

4. **Better Error Handling:**
   - Detect all expiry-related error codes
   - Show specific messages for each error type
   - Add "Resend Invite" action on expiry

5. **Consistent Redirect Pattern:**
   - Always use `app_next` in user_metadata
   - Remove `next` query param from URLs
   - Update all invite functions to use same pattern

### Long-Term Improvements

1. **Add Invite Resend Functionality:**
   - Allow admin to resend expired invites
   - Track invite status in database
   - Show invite status in customer list

2. **Add Invite Tracking:**
   - Create `invites` table to track sent invites
   - Store expiry time, status, resend count
   - Enable invite management UI

3. **Improve Error Messages:**
   - Customer-friendly error pages
   - Clear instructions on what to do next
   - Contact support links

4. **Add Token Refresh:**
   - If token is close to expiry, auto-refresh
   - Extend session if user is actively using portal
   - Prevent mid-session expirations

---

## 10. DEBUGGING CHECKLIST

When investigating token expiration issues:

- [ ] Check which invite method was used (`signInWithOtp` vs `admin.inviteUserByEmail`)
- [ ] Check time between invite send and link click
- [ ] Check Supabase auth logs for error codes
- [ ] Verify `SITE_URL` environment variable is correct
- [ ] Check if `emailRedirectTo` URL matches actual callback route
- [ ] Verify session is established before redirect
- [ ] Check browser console for auth errors
- [ ] Verify `app_next` or `next` param is set correctly
- [ ] Check if customer profile exists and has correct role
- [ ] Verify auto-linking worked (customer.user_id set)

---

**Document Generated:** 2025-01-16
**Status:** Complete - Ready for debugging and fixes
