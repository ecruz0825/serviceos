# Invite User True Root Cause Followup
**Service Ops SaaS - Onboarding Crew Invite 400 Error - True Root Cause Analysis**

**Date**: 2024-03-20  
**Status**: Diagnostic logging added, awaiting reproduction  
**Context**: Previous fix assumed `full_name: null vs "Crew Member"` was the issue, but QA case had real full_name, so root cause remains unknown

---

## All 400 Return Paths in invite-user Edge Function

### 1. **VALIDATION_ERROR: "email is required"** (Line 35)
- **Condition**: `!email` (email is missing, empty, null, or undefined)
- **Code**: `VALIDATION_ERROR`
- **Message**: "email is required"

### 2. **VALIDATION_ERROR: "role must be one of..."** (Line 41)
- **Condition**: `normalizedRole` not in `["customer", "crew", "admin", "manager", "dispatcher", "platform_admin"]`
- **Code**: `VALIDATION_ERROR`
- **Message**: "role must be one of customer, crew, admin, manager, dispatcher, platform_admin"
- **Note**: Role is normalized to lowercase and trimmed

### 3. **VALIDATION_ERROR: "customer_id is required for customer invites"** (Line 109)
- **Condition**: `normalizedRole === "customer" && !customer_id`
- **Code**: `VALIDATION_ERROR`
- **Message**: "customer_id is required for customer invites"
- **Note**: Only applies to customer role, not crew

### 4. **INVITE_FAILED** (Line 202)
- **Condition**: `inviteError` from `supabase.auth.admin.inviteUserByEmail()` exists AND error message does NOT contain "already" + ("registered" OR "exists")
- **Code**: `INVITE_FAILED`
- **Message**: The actual error message from Supabase auth API
- **Common causes**:
  - Invalid email format
  - Email already exists (but not caught by "already registered" check)
  - Supabase auth API rejection
  - Rate limiting
  - Configuration issues

### 5. **INVITE_MISSING_USER_ID** (Line 207)
- **Condition**: `inviteUserByEmail()` succeeds (no error) BUT `inviteData?.user?.id` is missing
- **Code**: `INVITE_MISSING_USER_ID`
- **Message**: "Invite sent, but missing user id"
- **Note**: Rare but possible if Supabase auth API returns success without user object

### 6. **INVALID_JSON** (Line 259)
- **Condition**: `SyntaxError` or error message contains "JSON" (from `await req.json()`)
- **Code**: `INVALID_JSON`
- **Message**: "Invalid request body. Expected JSON."
- **Note**: Catches JSON parse errors in catch block

---

## Diagnostic Logging Added

### Request Logging (Line 33-45)
Logs sanitized request payload shape:
- `hasEmail`: Boolean
- `emailLength`: Number (not the actual email)
- `hasFullName`: Boolean
- `fullNameLength`: Number (not the actual name)
- `role`: String
- `hasCrewMemberId`: Boolean
- `crewMemberIdLength`: Number (not the actual UUID)
- `hasCustomerId`: Boolean
- `hasAppNext`: Boolean
- `appNext`: String (safe to log)

### Validation Branch Logging
Each 400 return path now logs:
- `[invite-user] 400: <reason>` with relevant context
- Helps identify which validation branch failed

### Crew Member Validation Logging (Line 127-141)
- Logs before crew_member lookup
- Logs lookup errors
- Logs company_id mismatch
- Logs successful validation

### Invite API Call Logging (Line 174-202)
- Logs before calling `inviteUserByEmail()`
- Logs email, redirectPath, metadata keys
- Logs invite errors with full context
- Logs "already registered" detection
- Logs 400 return with error message

### Success Logging
- Logs successful invite with `newUserId` and `email`

### Exception Logging
- Logs unhandled exceptions with full error context
- Distinguishes JSON parse errors (400) from other errors (500)

---

## Most Likely Root Causes for QA Case

Given that:
- Crew member row is created successfully
- Real full_name value was provided
- Email was provided
- crew_member_id was present
- role was "crew"
- app_next was "/crew"

**Most likely causes:**

### 1. **INVITE_FAILED (Line 202)** - Most Likely
**Possible reasons:**
- Email already exists in Supabase auth but error message doesn't match "already registered" pattern
- Invalid email format (though should be caught earlier)
- Supabase auth API rate limiting
- Supabase auth API configuration issue
- Email normalization issue (case sensitivity, whitespace)

**How to diagnose:**
- Check edge function logs for `[invite-user] inviteUserByEmail error:` entry
- Look for the actual error message from Supabase auth API
- Check if email already exists in `auth.users` table

### 2. **CREW_MEMBER_NOT_FOUND (Line 135)** - Possible
**Possible reasons:**
- Race condition: crew_member created but not yet visible to edge function
- Transaction isolation: crew_member insert not yet committed
- UUID format issue: crew_member_id not a valid UUID
- Database connection issue during lookup

**How to diagnose:**
- Check edge function logs for `[invite-user] Crew member lookup error:` entry
- Verify crew_member_id matches the actual UUID in database
- Check if crew_member exists at time of invite call

### 3. **INVALID_JSON (Line 259)** - Unlikely but possible
**Possible reasons:**
- Request body not properly JSON stringified
- Content-Type header missing or incorrect
- Malformed JSON in request body

**How to diagnose:**
- Check edge function logs for `[invite-user] 400: INVALID_JSON` entry
- Verify request headers in network tab
- Check request body format

---

## Files Changed

### 1. `supabase/functions/invite-user/index.ts`
- Added comprehensive diagnostic logging at every validation branch
- Added request payload shape logging (sanitized)
- Added crew_member validation logging
- Added invite API call logging
- Added error context logging
- All logs prefixed with `[invite-user]` for easy filtering

### 2. `src/pages/admin/OnboardingWizard.jsx` (Already fixed)
- Improved error handling to extract error message from response body
- Already aligned with CrewAdmin payload pattern

---

## Verification: Frontend Error Message Surfacing

### Onboarding Flow
The onboarding flow now:
1. Catches `inviteError` from `supabase.functions.invoke()`
2. Extracts error message from `inviteError.message`
3. Attempts to parse error response body if available
4. Shows specific error message in toast
5. Logs detailed error context to console

**Error message flow:**
- Edge function returns: `{ ok: false, code: "INVITE_FAILED", message: "Actual error from Supabase" }`
- Supabase client wraps in: `FunctionsHttpError` with `message` and `context.body`
- Onboarding extracts: `inviteError.message` or `errorBody.message`
- User sees: Actual error message in toast

### CrewAdmin Flow
CrewAdmin already has basic error handling:
```javascript
if (error) {
  toast.error(error.message || 'Failed to send invite');
  return;
}
```

**Recommendation:** CrewAdmin could benefit from the same improved error extraction, but it's not blocking for this issue.

---

## Reproduction Steps

### To Reproduce the QA Failure:

1. **Start fresh onboarding**
   - Create new company
   - Complete company info step
   - Complete services step
   - Complete customer step (create customer)
   - Complete quote step (create quote)

2. **On crew step:**
   - Fill in:
     - Full Name: "Test Worker" (real value)
     - Email: "testworker@example.com" (real email)
     - Phone: "555-1234" (optional)
   - Click "Send Invite"

3. **Observe:**
   - Check browser console for error logs
   - Check network tab for request/response
   - Check edge function logs for diagnostic output
   - Note the exact error message shown to user

### Expected Diagnostic Output

**In edge function logs, you should see:**
```
[invite-user] Request received: { hasEmail: true, emailLength: 23, hasFullName: true, fullNameLength: 11, role: 'crew', hasCrewMemberId: true, crewMemberIdLength: 36, ... }
[invite-user] Validating crew_member_id: { crew_member_id: '...', callerCompanyId: '...' }
[invite-user] Crew member validated successfully
[invite-user] Calling inviteUserByEmail: { email: '...', redirectPath: '...', ... }
[invite-user] inviteUserByEmail error: { message: '...', code: '...', ... }
[invite-user] 400: INVITE_FAILED { message: '...' }
```

**The last log entry will show the actual failing branch and reason.**

---

## Real Root Cause (To Be Determined)

**After reproduction, the diagnostic logs will reveal:**

1. **Which validation branch failed**
   - Check for `[invite-user] 400:` log entries
   - Note the exact code and message

2. **What the actual error was**
   - If `INVITE_FAILED`: Check the Supabase auth API error message
   - If `CREW_MEMBER_NOT_FOUND`: Check crew_member lookup error
   - If `VALIDATION_ERROR`: Check which field failed

3. **Request payload shape**
   - Verify all expected fields are present
   - Verify field types are correct
   - Verify no unexpected values

---

## Next Steps

1. **Deploy diagnostic logging** to edge function
2. **Reproduce the failure** using QA steps
3. **Check edge function logs** for diagnostic output
4. **Identify the failing branch** from logs
5. **Fix the root cause** based on actual failure
6. **Remove or reduce logging** after fix is confirmed

---

## Keep / Risk Note

### ✅ Safe Changes
- **Diagnostic logging**: Low risk, only adds visibility
- **No behavior changes**: All logging is additive
- **Sanitized logging**: No secrets logged

### ⚠️ Temporary Diagnostic Code
- **Logging should be reduced** after root cause is found
- **Consider log levels** (info vs debug) for production
- **Monitor log volume** to avoid excessive logging costs

### 🔒 Risk Assessment: **Very Low**
- Changes are purely diagnostic
- No functional changes
- No breaking changes
- Only improves observability

---

## Summary

**Status**: Diagnostic logging added, awaiting reproduction to identify true root cause

**All 400 paths identified**: 6 possible return paths documented

**Diagnostic logging added**: Comprehensive logging at every validation branch

**Next action**: Reproduce failure and check edge function logs to identify the actual failing branch

**Expected outcome**: Logs will reveal the exact validation failure or Supabase auth API error that causes the 400
