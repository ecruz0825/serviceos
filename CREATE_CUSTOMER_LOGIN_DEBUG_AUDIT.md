# create-customer-login Edge Function Debug Audit
**Date:** 2026-02-21  
**Issue:** Frontend receiving "Edge Function returned a non-2xx status code"

---

## 1. Expected Request Payload

### Required Fields (all must be present and non-empty):

1. **`customer_id`** (string, required)
   - Must be a valid UUID string
   - Validated at line 75-77: `if (!customer_id)`

2. **`email`** (string, required)
   - Must be non-empty after trim
   - Validated at line 71-73: `if (!email || !email.trim())`

3. **`company_id`** (string, required)
   - Must be a valid UUID string
   - Validated at line 79-81: `if (!company_id)`

4. **`temp_password`** (string, required)
   - Must be at least 8 characters after trim
   - Validated at line 83-85: `if (!temp_password || temp_password.trim().length < 8)`

### Optional Fields:

1. **`full_name`** (string, optional)
   - Can be null, undefined, or empty string
   - Used at line 130: `full_name || customerData.full_name || null`
   - Used at line 213: `full_name || customerData.full_name || null`

### Exact Field Names Expected:
- `customer_id` (snake_case)
- `email` (lowercase)
- `full_name` (snake_case)
- `company_id` (snake_case)
- `temp_password` (snake_case)

---

## 2. Current Frontend Payload

**Location:** `src/pages/admin/CustomersAdmin.jsx` lines 1327-1335

**Exact payload sent:**
```javascript
{
  customer_id: selectedCustomer.id,           // ✅ Matches
  email: selectedCustomer.email,              // ✅ Matches
  full_name: selectedCustomer.full_name || null,  // ✅ Matches (optional)
  company_id: selectedCustomer.company_id || companyId,  // ✅ Matches
  temp_password: passwordToSet,                // ✅ Matches
}
```

### Field Name Analysis:
- ✅ **All field names match exactly** - No naming mismatches
- ✅ **All required fields are present** - customer_id, email, company_id, temp_password
- ✅ **Optional field handled correctly** - full_name with null fallback

### Potential Issues:

1. **`selectedCustomer.company_id` might be null/undefined**
   - Frontend uses: `selectedCustomer.company_id || companyId`
   - If both are null/undefined, `company_id` will be `null` or `undefined`
   - Edge function validates: `if (!company_id)` - this will fail if falsy

2. **`selectedCustomer.id` might be null/undefined**
   - If customer object is malformed, `customer_id` could be missing
   - Edge function validates: `if (!customer_id)` - this will fail

3. **`selectedCustomer.email` might be null/undefined/empty**
   - Frontend validates: `if (!selectedCustomer?.email)` (line 1297)
   - But if email is empty string, it passes frontend check
   - Edge function validates: `if (!email || !email.trim())` - empty string will fail

4. **`passwordToSet` might be less than 8 characters**
   - Frontend validates: `if (!tempPassword || tempPassword.trim().length < 8)` (line 1309)
   - But if validation is bypassed, edge function will catch it

---

## 3. All Non-2xx Return Paths in the Function

### HTTP 400 (Bad Request) - Validation Errors:

1. **Status:** 400  
   **Code:** `VALIDATION_ERROR`  
   **Message:** `"email is required"`  
   **Trigger:** Line 71-73  
   **Condition:** `!email || !email.trim()`

2. **Status:** 400  
   **Code:** `VALIDATION_ERROR`  
   **Message:** `"customer_id is required"`  
   **Trigger:** Line 75-77  
   **Condition:** `!customer_id` (falsy check)

3. **Status:** 400  
   **Code:** `VALIDATION_ERROR`  
   **Message:** `"company_id is required"`  
   **Trigger:** Line 79-81  
   **Condition:** `!company_id` (falsy check)

4. **Status:** 400  
   **Code:** `VALIDATION_ERROR`  
   **Message:** `"temp_password is required and must be at least 8 characters"`  
   **Trigger:** Line 83-85  
   **Condition:** `!temp_password || temp_password.trim().length < 8`

### HTTP 404 (Not Found):

5. **Status:** 404  
   **Code:** `CUSTOMER_NOT_FOUND`  
   **Message:** `"Failed to fetch customer record"`  
   **Trigger:** Line 113-115  
   **Condition:** `customerError` is truthy (database query error)

6. **Status:** 404  
   **Code:** `CUSTOMER_NOT_FOUND`  
   **Message:** `"Customer not found or does not belong to this company"`  
   **Trigger:** Line 117-119  
   **Condition:** `!customerData` (customer not found OR customer.company_id !== provided company_id)

### HTTP 405 (Method Not Allowed):

7. **Status:** 405  
   **Code:** `METHOD_NOT_ALLOWED`  
   **Message:** `"Method not allowed"`  
   **Trigger:** Line 17-25  
   **Condition:** `req.method !== "POST"`

### HTTP 409 (Conflict):

8. **Status:** 409  
   **Code:** `CUSTOMER_ALREADY_LINKED`  
   **Message:** `"Customer already has a linked auth user. Use set-customer-password to update password."`  
   **Trigger:** Line 122-124  
   **Condition:** `customerData.user_id` is truthy (customer already has auth account)

### HTTP 500 (Internal Server Error):

9. **Status:** 500  
   **Code:** `SERVER_CONFIG_ERROR`  
   **Message:** `"Missing PROJECT_URL / SERVICE_ROLE_KEY"`  
   **Trigger:** Line 96-101  
   **Condition:** `!projectUrl || !serviceRoleKey`

10. **Status:** 500  
    **Code:** `AUTH_CREATE_FAILED`  
    **Message:** `createError?.message || "Failed to create auth user"`  
    **Trigger:** Line 200  
    **Condition:** `createError` exists AND error is NOT email-already-exists

11. **Status:** 500  
    **Code:** `EMAIL_EXISTS_BUT_NOT_FOUND`  
    **Message:** `"Email exists but failed to find existing user"` or `"Email exists but user not found in system"`  
    **Trigger:** Line 165-167, 174-176  
    **Condition:** Email exists in auth but `listUsers()` fails OR user not found in list

12. **Status:** 500  
    **Code:** `AUTH_UPDATE_FAILED`  
    **Message:** `updateError?.message || "Failed to update existing auth user"`  
    **Trigger:** Line 188-190  
    **Condition:** `updateError || !updatedUser?.user` (failed to update existing user)

13. **Status:** 500  
    **Code:** `LINK_FAILED`  
    **Message:** `"Auth user created but failed to link to customer record"`  
    **Trigger:** Line 230-233  
    **Condition:** `linkError` is truthy (failed to update customers.user_id)

14. **Status:** 500  
    **Code:** `INTERNAL_ERROR`  
    **Message:** Error message from caught exception  
    **Trigger:** Line 255-272  
    **Condition:** Any unhandled exception (JSON parse error, network error, etc.)

---

## 4. Required Environment Variables

### Environment Variables Used:

1. **`PROJECT_URL`** (primary) or **`SUPABASE_URL`** (fallback)
   - Used at lines 87-90
   - Required for creating Supabase admin client
   - **Hard-fails if missing:** Yes (line 96-101 returns 500)

2. **`SERVICE_ROLE_KEY`** (primary) or **`SUPABASE_SERVICE_ROLE_KEY`** (fallback)
   - Used at lines 91-94
   - Required for creating Supabase admin client
   - **Hard-fails if missing:** Yes (line 96-101 returns 500)

### Environment Variable Check Logic:

```typescript
const projectUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!projectUrl || !serviceRoleKey) {
  return fail("SERVER_CONFIG_ERROR", "Missing PROJECT_URL / SERVICE_ROLE_KEY", {
    hasProjectUrl: !!projectUrl,
    hasServiceRoleKey: !!serviceRoleKey,
  });
}
```

**Failure Behavior:**
- Returns HTTP 500
- Code: `SERVER_CONFIG_ERROR`
- Includes diagnostic info about which env var is missing

**Note:** Function does NOT require authentication from the caller. It uses service role key to bypass all RLS.

---

## 5. Auth and Authorization Assumptions

### Authentication Requirements:

**NONE** - The function does NOT check for authenticated user context.

- No `Authorization` header validation
- No JWT token extraction
- No user session verification
- No `auth.uid()` checks

### Authorization Requirements:

**NONE** - The function does NOT verify caller permissions.

- No role checks
- No company membership verification
- No admin-only enforcement
- Uses service role key to bypass all RLS

### Company Scope Determination:

**Explicitly provided** - The function relies on `company_id` from the request body.

1. **Line 79-81:** Validates `company_id` is provided
2. **Line 106-111:** Queries customer with BOTH `customer_id` AND `company_id`:
   ```typescript
   .eq("id", customer_id)
   .eq("company_id", company_id)
   ```
3. **Line 117-119:** If customer not found OR `customer.company_id !== provided company_id`, returns 404

**Security Implication:**
- Function trusts the caller to provide correct `company_id`
- If wrong `company_id` provided, function will fail with 404 (customer not found)
- No verification that caller has permission to create logins for that company

### Could Current Admin Session Fail Authorization?

**NO** - Because there is no authorization check.

However, the function could fail if:
1. **Wrong `company_id` provided:** Returns 404 (customer not found)
2. **Customer belongs to different company:** Returns 404 (customer not found)
3. **Customer doesn't exist:** Returns 404 (customer not found)

**Most Likely Scenario:**
- Admin's `companyId` state might be wrong
- `selectedCustomer.company_id` might be null and fallback to wrong `companyId`
- Customer might belong to different company than admin's session

---

## 6. Most Likely Root Cause for Current Test Failure

### Rank 1: Company ID Mismatch (HIGHEST PROBABILITY)

**Issue:** Customer's `company_id` doesn't match the `company_id` sent in request.

**Evidence:**
- Frontend uses: `selectedCustomer.company_id || companyId`
- If `selectedCustomer.company_id` is null, uses admin's `companyId`
- Edge function validates: `customer.company_id === provided company_id` (line 110)
- Returns 404 if mismatch: `"Customer not found or does not belong to this company"`

**How to verify:**
- Check if `selectedCustomer.company_id` is null/undefined
- Check if admin's `companyId` matches customer's actual `company_id`
- Check edge function logs for 404 with `CUSTOMER_NOT_FOUND`

**Likelihood:** 70%

---

### Rank 2: Missing Environment Variables (MEDIUM PROBABILITY)

**Issue:** `PROJECT_URL` or `SERVICE_ROLE_KEY` not set in Supabase edge function environment.

**Evidence:**
- Function checks env vars at line 96-101
- Returns 500 with `SERVER_CONFIG_ERROR` if missing
- Other edge functions use same pattern (invite-user, set-customer-password)

**How to verify:**
- Check Supabase dashboard → Edge Functions → create-customer-login → Settings → Environment Variables
- Verify `PROJECT_URL` and `SERVICE_ROLE_KEY` are set
- Check edge function logs for 500 with `SERVER_CONFIG_ERROR`

**Likelihood:** 20%

---

### Rank 3: Customer Already Has user_id (MEDIUM PROBABILITY)

**Issue:** Customer record already has `user_id` set, but frontend check didn't catch it.

**Evidence:**
- Frontend checks: `if (selectedCustomer?.user_id)` (line 1303)
- Edge function checks: `if (customerData.user_id)` (line 122)
- Returns 409 if already linked: `"Customer already has a linked auth user"`
- Race condition possible if customer was linked between frontend check and edge function call

**How to verify:**
- Check customer record in database: `SELECT id, user_id FROM customers WHERE id = <customer_id>`
- Check if `user_id` is NOT NULL
- Check edge function logs for 409 with `CUSTOMER_ALREADY_LINKED`

**Likelihood:** 10%

---

## 7. Exact Next Validation Step

### **Check Supabase Edge Function Logs**

**Action:** Go to Supabase Dashboard → Edge Functions → `create-customer-login` → Logs

**What to look for:**

1. **Find the most recent failed invocation** (non-2xx status)

2. **Check the error code in the log:**
   - If `CUSTOMER_NOT_FOUND` (404) → Customer/company mismatch (Rank 1)
   - If `SERVER_CONFIG_ERROR` (500) → Missing env vars (Rank 2)
   - If `CUSTOMER_ALREADY_LINKED` (409) → Customer already has account (Rank 3)
   - If `VALIDATION_ERROR` (400) → Missing/invalid field (check payload)

3. **Check the diagnostic detail object:**
   - For `SERVER_CONFIG_ERROR`: Check `hasProjectUrl` and `hasServiceRoleKey` booleans
   - For `CUSTOMER_NOT_FOUND`: Check `customer_id` and `email` values

4. **Check the request payload logged:**
   - Verify `customer_id`, `email`, `company_id`, `temp_password` are all present
   - Verify `company_id` matches customer's actual `company_id` in database

**Alternative if logs not available:**

Run this SQL query to verify customer/company relationship:
```sql
SELECT 
  c.id as customer_id,
  c.email,
  c.company_id as customer_company_id,
  c.user_id,
  p.company_id as admin_company_id
FROM customers c
LEFT JOIN profiles p ON p.id = auth.uid()
WHERE c.id = '<customer_id_from_request>';
```

Compare `customer_company_id` with the `company_id` sent in the request.

---

## Summary

**Most Likely Issue:** Company ID mismatch (70% probability)
- Customer's `company_id` doesn't match the `company_id` in the request
- Could be due to `selectedCustomer.company_id` being null and using wrong fallback

**Quick Fix to Test:**
1. Add console.log in frontend before invoke:
   ```javascript
   console.log('Payload:', {
     customer_id: selectedCustomer.id,
     email: selectedCustomer.email,
     company_id: selectedCustomer.company_id || companyId,
     customer_company_id: selectedCustomer.company_id,
     admin_company_id: companyId,
   });
   ```
2. Verify `company_id` in payload matches customer's actual `company_id` in database
3. If mismatch, fix frontend to use correct `company_id`
