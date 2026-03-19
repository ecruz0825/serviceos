# Invite Redirect URL Fix - Analysis

## Problem Statement

The previous implementation used nested redirect URLs with query parameters:
```
/auth/callback?next=/crew
/auth/callback?next=/customer/dashboard
```

**Issue**: When Supabase processes authentication redirects, nested query parameters can be stripped or lost during the OAuth/magic link flow. This happens because:
1. Supabase adds its own authentication parameters (tokens, codes, hashes) to the URL
2. Multiple query parameter sets can conflict or be truncated
3. URL encoding/decoding during redirects can corrupt nested params
4. Some browsers or redirect handlers may sanitize URLs, removing "suspicious" nested params

**Impact**: Users clicking invite links would land on `/auth/callback` but lose the intended destination (`/crew` or `/customer/dashboard`), potentially redirecting to a default location instead of their role-specific portal.

## Solution Implemented

### 1. Clean Callback URL
Changed from nested query params to a clean callback URL:
```typescript
// Before
const redirectPath = role === "crew" 
  ? `${site}/auth/callback?next=/crew`
  : `${site}/auth/callback?next=/customer/dashboard`;

// After
const redirectPath = `${site}/auth/callback`;
```

### 2. Metadata-Based Destination Storage
Store the intended destination in user metadata instead:
```typescript
const app_next = role === "crew" ? "/crew" : "/customer/dashboard";

await supabase.auth.admin.inviteUserByEmail(
  email,
  { data: { full_name, role, app_next }, redirectTo: redirectPath }
);
```

### 3. Metadata-Aware Callback Handler
Updated `AuthCallback.jsx` to read from user metadata with fallback:
```typescript
// Determine redirect destination:
// 1. Check user metadata for app_next (from invite flows)
// 2. Fall back to next query param (for other flows)
// 3. Default to /customer/dashboard
const userMetadata = authResult.session.user.user_metadata
const appNext = userMetadata?.app_next
const redirectDestination = appNext || next
```

## How It Works

### Flow Diagram
```
1. Admin invites user
   ↓
2. invite-user function stores app_next in user metadata
   ↓
3. Supabase sends email with clean callback URL
   ↓
4. User clicks link → lands on /auth/callback
   ↓
5. AuthCallback processes auth tokens
   ↓
6. Reads app_next from user.user_metadata
   ↓
7. Redirects to intended destination
```

### Key Components

**invite-user/index.ts**:
- Stores `app_next` in user metadata during invite creation
- Uses clean callback URL without query params
- Metadata persists with the user record, not the URL

**AuthCallback.jsx**:
- Maintains backward compatibility (still checks `next` query param)
- Prioritizes `app_next` from metadata (for invite flows)
- Falls back gracefully if neither exists

## Benefits

1. **Reliability**: Metadata is stored server-side, not in URL params
2. **Security**: No sensitive routing info exposed in URLs
3. **Persistence**: Destination survives URL transformations
4. **Backward Compatibility**: Still supports `next` query param for other flows
5. **Clean URLs**: No nested query parameters that can be corrupted

## Edge Cases & Considerations

### ✅ Handled
- **Backward compatibility**: Still reads `next` query param for non-invite flows
- **Default fallback**: Defaults to `/customer/dashboard` if neither metadata nor query param exists
- **Multiple auth methods**: Works with PKCE, token hash, and implicit hash flows

### ⚠️ Potential Considerations

1. **Metadata Cleanup**: The `app_next` field remains in user metadata after redirect. Consider:
   - Option A: Leave it (harmless, may be useful for analytics)
   - Option B: Clear it after first use (requires additional logic)

2. **Role Changes**: If a user's role changes after invite but before acceptance:
   - Current: Redirects to original invite destination
   - Consider: Could add logic to check current role vs. metadata

3. **Multiple Invites**: If a user receives multiple invites:
   - Current: Uses the most recent `app_next` value
   - Consider: Could track invite history if needed

4. **Direct URL Access**: Users accessing `/auth/callback` directly without auth params:
   - Current: Redirects to login (handled in existing code)
   - Status: ✅ Already handled

## Testing Recommendations

1. **Invite Flow**:
   - Invite crew member → verify redirects to `/crew`
   - Invite customer → verify redirects to `/customer/dashboard`

2. **URL Integrity**:
   - Verify auth tokens are preserved in URL
   - Verify no query param conflicts

3. **Backward Compatibility**:
   - Test direct `/auth/callback?next=/somewhere` still works
   - Test other auth flows (password reset, etc.)

4. **Edge Cases**:
   - Test with expired invites
   - Test with invalid tokens
   - Test with users who have no metadata

## Files Modified

1. `supabase/functions/invite-user/index.ts`
   - Changed redirect URL to clean callback
   - Added `app_next` to user metadata

2. `src/pages/AuthCallback.jsx`
   - Added metadata reading logic
   - Maintained backward compatibility

## Deployment Status

✅ **Deployed**: Function `invite-user` has been deployed to Supabase
- Project: `lpcenztasoktlcvhuzug`
- Dashboard: https://supabase.com/dashboard/project/lpcenztasoktlcvhuzug/functions

## Next Steps

1. Test invite flow with both crew and customer roles
2. Monitor for any redirect issues
3. Consider metadata cleanup strategy (optional)
4. Update documentation if needed
