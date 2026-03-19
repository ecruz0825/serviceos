# Trial Expiration Mechanism Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Verify whether the app has any existing trial expiration mechanism and whether DB-native trials can be safely implemented.

---

## 1. Trial Expiry Enforcement

### Search Results for `trial_ends_at`, `subscription_status`, and Related Fields

#### Files Referencing `trial_ends_at`:

**`src/components/OnboardingGuard.jsx`** (Lines 101-109):
```jsx
const billingStatus = profile.subscription_status || "inactive";
const graceUntilRaw = profile.billing_grace_until || null;
const graceUntilDate = graceUntilRaw ? new Date(graceUntilRaw) : null;
const hasValidGrace =
  graceUntilDate && !Number.isNaN(graceUntilDate.getTime())
    ? graceUntilDate.getTime() > Date.now()
    : false;
const hasActiveBilling =
  billingStatus === "trialing" || billingStatus === "active" || hasValidGrace;
```

**Finding:** `OnboardingGuard` checks if `subscription_status === "trialing"` but **DOES NOT** check if `trial_ends_at` is in the past. It only validates `billing_grace_until` against the current date.

**`src/pages/admin/BillingAdmin.jsx`** (Lines 26, 142-143):
```jsx
const trialEndsAt = profile?.trial_ends_at || null;
// ...
<div>
  <p className="text-sm text-slate-600 mb-1">Trial Ends</p>
  <p className="text-slate-900">{formatDateTime(trialEndsAt)}</p>
</div>
```

**Finding:** `BillingAdmin` displays `trial_ends_at` but does not compare it to the current date or show warnings.

**`src/context/UserContext.jsx`** (Line 158, 173):
```jsx
.select("onboarding_step, setup_completed_at, subscription_status, plan, trial_ends_at, billing_grace_until, billing_updated_at")
// ...
trial_ends_at: company?.trial_ends_at || null,
```

**Finding:** `UserContext` fetches and stores `trial_ends_at` but does not perform any date comparisons.

**`supabase/functions/stripe-webhook/index.ts`** (Line 254):
```typescript
trial_ends_at: toIsoOrNull(subscription.trial_end),
```

**Finding:** Stripe webhook updates `trial_ends_at` from Stripe's `subscription.trial_end`, but no logic checks if this date has passed.

#### Search for Date Comparisons:

**No code found** that:
- Compares `trial_ends_at` to `Date.now()` or current date
- Checks if `trial_ends_at < new Date()`
- Validates trial expiration based on date

#### References to `subscription_status === 'trialing'`:

**`src/components/OnboardingGuard.jsx`** (Line 108):
```jsx
billingStatus === "trialing" || billingStatus === "active" || hasValidGrace;
```

**Finding:** Status check only, no date validation.

**`src/pages/admin/BillingAdmin.jsx`** (Line 29, 32):
```jsx
const canOpenPortalByStatus = ["active", "trialing", "past_due", "unpaid", "canceled"].includes(status);
// ...
if (status === "active" || status === "trialing") return "text-green-700 bg-green-100";
```

**Finding:** UI treats `trialing` as active without date checks.

#### References to `billing_grace_until`, `inactive`, `canceled`, `unpaid`, `past_due`:

**`src/components/OnboardingGuard.jsx`** (Lines 102-107):
```jsx
const graceUntilRaw = profile.billing_grace_until || null;
const graceUntilDate = graceUntilRaw ? new Date(graceUntilRaw) : null;
const hasValidGrace =
  graceUntilDate && !Number.isNaN(graceUntilDate.getTime())
    ? graceUntilDate.getTime() > Date.now()
    : false;
```

**Finding:** `billing_grace_until` **IS** validated against current date, but `trial_ends_at` is not.

**Conclusion:** The app has **NO automatic trial expiration enforcement**. If `subscription_status = 'trialing'`, access continues indefinitely regardless of `trial_ends_at` date.

---

## 2. Background/Scheduled Processing

### Search Results for Cron, Scheduler, and Scheduled Jobs

#### Found Scheduled Processing:

**`supabase/migrations/20260212000010_invoice_overdue_eval_cron_multitenant.sql`**:
```sql
CREATE OR REPLACE FUNCTION public.eval_invoices_overdue_all_companies(p_limit int DEFAULT 500)
RETURNS TABLE (updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
-- Iterates through all companies
-- Processes overdue invoices for each company
-- Returns total updated_count across all companies
-- SECURITY DEFINER, restricted to service_role for cron execution
$$;

GRANT EXECUTE ON FUNCTION public.eval_invoices_overdue_all_companies(int) TO service_role;
```

**Finding:** This migration creates a cron-safe function for invoice overdue evaluation, but **NO similar function exists for trial expiration**.

**`supabase/migrations/20260212000009_invoice_overdue_eval_ops.sql`** (Lines 23-54):
```sql
-- Scheduled Job Setup (pg_cron)
-- Option 2: Via SQL (Direct pg_cron)
--   SELECT cron.schedule(
--     'eval-invoices-overdue-daily',
--     '0 2 * * *', -- 2 AM daily
--     $$SELECT public.eval_invoices_overdue_all_companies(500);$$
--   );
```

**Finding:** Documentation shows how to schedule the invoice overdue function via `pg_cron`, but **NO scheduled job exists for trial expiration**.

**`supabase/functions/auto-generate-recurring-jobs/index.ts`**:
- Edge function that can be scheduled to generate recurring jobs
- **Not related to billing or trial expiration**

**`src/utils/jobGenerators.js`**:
- Frontend utility for generating jobs (runs on-demand, not scheduled)
- **Not related to billing or trial expiration**

#### Search for `pg_cron`, `cron`, `scheduler`:

**Found references:**
- `supabase/migrations/20260212000009_invoice_overdue_eval_ops.sql` - Invoice overdue cron setup
- `supabase/migrations/20260131125500_enable_quote_reminders_automation.sql` - Quote reminders (checks for `pg_cron` availability)
- `ARCHITECT_BRIEF.md` - Mentions cron for scheduled jobs

**No references found for:**
- Trial expiration cron jobs
- Background billing sync for trial status
- Nightly jobs that check `trial_ends_at`
- Scheduled functions that update `subscription_status` from `trialing` to `inactive`

**Conclusion:** The app has scheduled processing infrastructure (`pg_cron`) for invoice overdue evaluation, but **NO scheduled job exists for trial expiration**. Trial status is only updated via Stripe webhooks.

---

## 3. OnboardingGuard Truth

### Re-reading `src/components/OnboardingGuard.jsx`

**Key Logic (Lines 99-121):**
```jsx
// Billing enforcement (admin-only):
// allow app access when status is trialing/active OR grace window is still valid.
const billingStatus = profile.subscription_status || "inactive";
const graceUntilRaw = profile.billing_grace_until || null;
const graceUntilDate = graceUntilRaw ? new Date(graceUntilRaw) : null;
const hasValidGrace =
  graceUntilDate && !Number.isNaN(graceUntilDate.getTime())
    ? graceUntilDate.getTime() > Date.now()
    : false;
const hasActiveBilling =
  billingStatus === "trialing" || billingStatus === "active" || hasValidGrace;

// ...

if (!hasActiveBilling && !isBillingAllowedRoute) {
  return (/* Billing Access Required UI */);
}
```

### Answer to Question: "If subscription_status = 'trialing' and trial_ends_at is yesterday, does access still continue?"

**YES.** Access continues because:
1. Line 108 checks `billingStatus === "trialing"` (status check only)
2. Line 108 does **NOT** check if `trial_ends_at` is in the past
3. `trial_ends_at` is never referenced in the billing enforcement logic
4. Only `billing_grace_until` is validated against `Date.now()`

### Answer to Question: "Is there any date-based trial expiry check in the UI today?"

**NO.** There is no date-based trial expiry check anywhere in the UI. The only date validation is for `billing_grace_until`, which applies to `past_due` and `unpaid` statuses, not trials.

---

## 4. BillingAdmin Truth

### Inspecting `src/pages/admin/BillingAdmin.jsx`

**Trial Display (Lines 26, 141-144):**
```jsx
const trialEndsAt = profile?.trial_ends_at || null;
// ...
<div>
  <p className="text-sm text-slate-600 mb-1">Trial Ends</p>
  <p className="text-slate-900">{formatDateTime(trialEndsAt)}</p>
</div>
```

**Finding:** `BillingAdmin` displays `trial_ends_at` using `formatDateTime()`, which shows the date/time but does not indicate if it's expired.

**Status Display (Lines 24, 31-36, 137-139):**
```jsx
const status = profile?.subscription_status || "inactive";
// ...
const statusTone = useMemo(() => {
  if (status === "active" || status === "trialing") return "text-green-700 bg-green-100";
  if (status === "past_due" || status === "unpaid") return "text-amber-700 bg-amber-100";
  if (status === "canceled") return "text-red-700 bg-red-100";
  return "text-slate-700 bg-slate-100";
}, [status]);
// ...
<span className={`inline-block px-2 py-1 text-sm font-medium rounded ${statusTone}`}>
  {STATUS_LABELS[status] || status}
</span>
```

**Finding:** Status badge shows "Trialing" in green, but does not warn if `trial_ends_at` has passed.

### Answer to Question: "Does it show any trial countdown or expired-trial state?"

**NO.** `BillingAdmin` does not:
- Calculate days remaining until `trial_ends_at`
- Display a countdown timer
- Show a warning if `trial_ends_at` is in the past
- Change the status badge color if trial is expired

### Answer to Question: "Does it warn when trial_ends_at has passed?"

**NO.** There is no logic that compares `trial_ends_at` to the current date, so no warnings are shown for expired trials.

---

## 5. Final Section

### A) Does trial expiration currently happen automatically anywhere?

**NO.** Trial expiration does not happen automatically. The app:
- Does not check if `trial_ends_at` is in the past
- Does not update `subscription_status` from `trialing` to `inactive` when trial expires
- Relies entirely on Stripe webhooks to update trial status
- If Stripe does not send a webhook when a trial ends, the status remains `trialing` indefinitely

**Evidence:**
- `OnboardingGuard.jsx` only checks `subscription_status === "trialing"` (no date validation)
- No scheduled job exists to check `trial_ends_at`
- No RPC function exists to expire trials
- No trigger exists to automatically update status when `trial_ends_at` passes

### B) Would setting company.subscription_status = 'trialing' during bootstrap create indefinite access unless something else changes?

**YES.** Setting `subscription_status = 'trialing'` during bootstrap would create indefinite access because:
1. `OnboardingGuard.jsx` line 108 treats `trialing` as active billing without date checks
2. No code path automatically updates `trialing` to `inactive` when `trial_ends_at` passes
3. The only way status changes is via Stripe webhooks (which won't fire for DB-native trials)
4. Even if `trial_ends_at` is set to a past date, access continues as long as `subscription_status = 'trialing'`

**To create a 14-day trial safely, you would need:**
- Either: Add date-based validation in `OnboardingGuard` to check `trial_ends_at < Date.now()`
- Or: Create a scheduled job (pg_cron) that updates `subscription_status` from `trialing` to `inactive` when `trial_ends_at` passes
- Or: Both (defense in depth)

### C) What is the smallest safe architecture for 14-day trials given the current codebase?

**Recommended Minimal Architecture:**

**Option 1: UI-Based Expiration Check (Smallest Change)**
- Modify `OnboardingGuard.jsx` to check `trial_ends_at` when `subscription_status === 'trialing'`
- If `trial_ends_at` exists and is in the past, treat as `inactive`
- **Pros:** Single file change, immediate enforcement
- **Cons:** Only enforced on page load, can be bypassed if user never reloads

**Exact Change:**
```jsx
// In OnboardingGuard.jsx, replace lines 108-109:
const trialEndsAtRaw = profile.trial_ends_at || null;
const trialEndsAtDate = trialEndsAtRaw ? new Date(trialEndsAtRaw) : null;
const isTrialExpired = trialEndsAtDate && !Number.isNaN(trialEndsAtDate.getTime())
  ? trialEndsAtDate.getTime() <= Date.now()
  : false;
const isTrialingAndValid = billingStatus === "trialing" && !isTrialExpired;
const hasActiveBilling =
  isTrialingAndValid || billingStatus === "active" || hasValidGrace;
```

**Option 2: Scheduled Job + UI Check (Most Robust)**
- Create a pg_cron job that runs daily to update `subscription_status` from `trialing` to `inactive` when `trial_ends_at < now()`
- Also implement Option 1 for immediate UI enforcement
- **Pros:** Database is source of truth, works even if UI is bypassed
- **Cons:** Requires pg_cron setup, more complex

**Exact SQL Function:**
```sql
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS TABLE (updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.companies
  SET
    subscription_status = 'inactive',
    billing_updated_at = now()
  WHERE
    subscription_status = 'trialing'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN QUERY SELECT v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_trials() TO service_role;

-- Schedule via pg_cron (run daily at 2 AM):
-- SELECT cron.schedule(
--   'expire-trials-daily',
--   '0 2 * * *',
--   $$SELECT public.expire_trials();$$
-- );
```

**Option 3: Bootstrap with Future Date (Temporary Workaround)**
- Set `trial_ends_at = now() + interval '14 days'` during bootstrap
- Set `subscription_status = 'trialing'`
- Implement Option 1 or Option 2 before 14 days elapse
- **Pros:** Allows immediate rollout, gives time to implement proper expiration
- **Cons:** Not a permanent solution, requires follow-up implementation

**Recommendation:** Implement **Option 1** immediately (UI check), then add **Option 2** (scheduled job) for robustness. This provides defense in depth and ensures trials expire even if users never reload the UI.

---

## Summary

- **Trial expiration is NOT enforced** - `OnboardingGuard` only checks status, not dates
- **No scheduled jobs exist** for trial expiration (only invoice overdue processing)
- **BillingAdmin displays trial end date** but does not warn about expiration
- **DB-native trials would create indefinite access** unless date validation is added
- **Smallest safe architecture:** Add date check in `OnboardingGuard.jsx` + optional scheduled job for robustness
