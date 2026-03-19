# Crew Plan Limit UX Wording Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Inspect current crew plan-limit UX wording and identify improvement opportunities.

---

## 1. Current Displayed Error Flow for Crew Limit Reached

### Database Function

**File:** `supabase/migrations/20260310080005_enforce_crew_plan_limit.sql` (Lines 48-54)

**Exception Raised:**
```sql
RAISE EXCEPTION 'CREW_LIMIT_REACHED' USING
  MESSAGE = format(
    'CREW_LIMIT_REACHED: %s plan allows up to %s crew members. Upgrade to Pro to add more crew members.',
    v_usage.plan_code,
    v_usage.max_crew
  );
```

**Example Error Message:**
```
CREW_LIMIT_REACHED: starter plan allows up to 3 crew members. Upgrade to Pro to add more crew members.
```

---

### Frontend Error Handling

**File:** `src/pages/admin/CrewAdmin.jsx` (Lines 80-83)

**Error Handling Path:**
```jsx
if (error) {
  if (!handlePlanLimitError(error, navigate)) {
    toast.error(error.message);
  }
}
```

**Flow:**
1. Supabase insert fails → returns error object
2. `handlePlanLimitError(error, navigate)` is called
3. If helper handles it (returns true), stops there
4. Otherwise falls back to `toast.error(error.message)`

---

### Helper Function

**File:** `src/utils/handlePlanLimitError.jsx` (Lines 11-55)

**Detection Logic (Lines 19-23):**
```jsx
const isLimitError = 
  errorMessage.includes('CUSTOMER_LIMIT_REACHED') ||
  errorMessage.includes('CREW_LIMIT_REACHED') ||
  errorMessage.includes('JOB_LIMIT_REACHED');
```

**Display Logic (Line 32):**
```jsx
<span className="text-amber-800 flex-1">{errorMessage}</span>
```

**Finding:**
- Helper detects `CREW_LIMIT_REACHED` prefix in error message
- Displays the **entire raw error message** from database
- No text transformation or cleanup applied

---

## 2. Whether Helper Shows Raw Database Error Text

**Answer: ✅ YES**

**Evidence:**
- Line 17: `const errorMessage = error.message;` - Direct assignment
- Line 32: `{errorMessage}` - Direct display in JSX
- No string manipulation, parsing, or formatting applied

**Example Display:**
```
CREW_LIMIT_REACHED: starter plan allows up to 3 crew members. Upgrade to Pro to add more crew members.
```

**Finding:** The helper displays the **exact database error message** as-is, including the `CREW_LIMIT_REACHED:` prefix.

---

## 3. Whether Any Text Cleanup/Parsing is Already Applied

**Answer: ❌ NO**

**Evidence:**
- No string replacement (e.g., `.replace('CREW_LIMIT_REACHED:', '')`)
- No message parsing (e.g., extracting plan_code, max_crew separately)
- No formatting functions applied
- Helper only checks for prefix presence for detection, but doesn't modify the message

**Code Flow:**
1. `error.message` → `errorMessage` (line 17)
2. Check if `errorMessage.includes('CREW_LIMIT_REACHED')` (line 22)
3. Display `{errorMessage}` directly (line 32)

**Finding:** No text cleanup or parsing is currently applied. The database message is displayed verbatim.

---

## 4. Smallest Safe Place to Improve Message Wording

### Option A: Database Function Only

**File:** `supabase/migrations/20260310080005_enforce_crew_plan_limit.sql`

**Change:**
```sql
-- Remove prefix from message
MESSAGE = format(
  '%s plan allows up to %s crew members. Upgrade to Pro to add more crew members.',
  v_usage.plan_code,
  v_usage.max_crew
);
```

**Pros:**
- ✅ Single source of truth
- ✅ All consumers get clean message
- ✅ No frontend changes needed

**Cons:**
- ⚠️ Helper detection relies on prefix - would need to change detection logic
- ⚠️ Requires new migration to update existing function

---

### Option B: Frontend Helper Only

**File:** `src/utils/handlePlanLimitError.jsx`

**Change:**
```jsx
// Strip prefix before displaying
const displayMessage = errorMessage.replace(/^(CUSTOMER|CREW|JOB)_LIMIT_REACHED:\s*/i, '');
```

**Pros:**
- ✅ No database changes needed
- ✅ Works for all three limit types (customer, crew, job)
- ✅ Keeps detection logic intact (still checks for prefix)
- ✅ Smallest change - single line addition

**Cons:**
- ⚠️ Database still returns prefixed message (but that's fine for detection)

---

### Option C: Both (Database + Frontend)

**Database:** Remove prefix from message  
**Frontend:** Update detection to check error code or different pattern

**Pros:**
- ✅ Clean message at source
- ✅ Clean display in UI

**Cons:**
- ❌ Requires changes in two places
- ❌ Requires updating detection logic
- ❌ More complex than needed

---

### Recommendation: **Option B (Frontend Helper Only)**

**Rationale:**
1. **Smallest change** - Single line addition in helper function
2. **No database migration needed** - Existing function works fine
3. **Detection logic unchanged** - Still checks for prefix in error message
4. **Applies to all limit types** - Customer, crew, and job limits all benefit
5. **Safe and reversible** - Easy to test and rollback

**Exact Change Location:**
- **File:** `src/utils/handlePlanLimitError.jsx`
- **Line:** After line 17 (after `const errorMessage = error.message;`)
- **Change:** Add message cleanup before detection/display

**Example Implementation:**
```jsx
const errorMessage = error.message;

// Clean up message for display (strip technical prefix)
const displayMessage = errorMessage.replace(/^(CUSTOMER|CREW|JOB)_LIMIT_REACHED:\s*/i, '');

// Use cleaned message for display, original for detection
const isLimitError = 
  errorMessage.includes('CUSTOMER_LIMIT_REACHED') ||
  errorMessage.includes('CREW_LIMIT_REACHED') ||
  errorMessage.includes('JOB_LIMIT_REACHED');

// ... later in toast:
<span className="text-amber-800 flex-1">{displayMessage}</span>
```

**Result:**
- **Before:** `CREW_LIMIT_REACHED: starter plan allows up to 3 crew members. Upgrade to Pro to add more crew members.`
- **After:** `starter plan allows up to 3 crew members. Upgrade to Pro to add more crew members.`

---

## Summary

1. **Current Error Flow:** Database exception → Supabase error → `handlePlanLimitError` → Toast display
2. **Raw Text Display:** ✅ Yes - Helper shows exact database message including prefix
3. **Text Cleanup:** ❌ No - No parsing or formatting applied
4. **Smallest Safe Improvement:** **Frontend helper** - Strip prefix before display (single line change)

**Recommended Change:**
- **Location:** `src/utils/handlePlanLimitError.jsx`
- **Action:** Strip `CREW_LIMIT_REACHED:` (and other limit prefixes) from message before displaying
- **Benefit:** Cleaner UX without technical prefix, no database changes needed
