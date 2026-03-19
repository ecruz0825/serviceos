# Plan Limits and Usage Tracking Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Search for any existing plan limit or usage tracking logic in the repository and Supabase migrations.

---

## 1. Database Tables Related to Plans or Limits

### Found Tables:

**`public.companies` table** (from `supabase/migrations/20260309133000_add_companies_billing_fields.sql`):
```sql
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
```

**Finding:** The `plan` column exists in the `companies` table with:
- Type: `text`
- Default: `'starter'`
- NOT NULL constraint
- No CHECK constraint on allowed values
- No foreign key to a plans/plan_limits table

### Not Found:
- ❌ No `plan_limits` table
- ❌ No `plan_features` table
- ❌ No `usage_events` table
- ❌ No `usage_tracking` table
- ❌ No `subscription_limits` table
- ❌ No `quota` table
- ❌ No junction tables linking companies to plan definitions

**Conclusion:** The `plan` field is a simple text column with no associated metadata tables or limit definitions.

---

## 2. Code That Checks `company.plan`

### Found References:

**`src/pages/admin/BillingAdmin.jsx`** (Line 25):
```jsx
const plan = profile?.plan || "starter";
// ...
<div>
  <p className="text-sm text-slate-600 mb-1">Current Plan</p>
  <p className="text-xl font-semibold text-slate-900 capitalize">{plan}</p>
</div>
```

**Finding:** `BillingAdmin` displays the plan value but does not check it for any logic or restrictions.

**`src/context/UserContext.jsx`** (Lines 172, 226):
```jsx
plan: company?.plan || "starter",
// ...
plan: profile?.plan || "starter",
```

**Finding:** `UserContext` fetches and stores the plan value but does not use it for any conditional logic.

### Not Found:
- ❌ No code that checks `if (plan === 'starter')` or similar
- ❌ No code that checks `if (plan !== 'pro')` to block features
- ❌ No code that compares plan values
- ❌ No code that uses plan to determine access or limits

**Conclusion:** The `plan` field is read and displayed but never used in conditional logic or enforcement.

---

## 3. UI Logic That Enforces Limits

### Search Results:

**No UI logic found** that:
- Blocks features based on plan
- Shows upgrade prompts when limits are reached
- Disables buttons/forms based on plan tier
- Displays plan-specific feature lists
- Enforces job/customer/crew count limits

**Found UI Components:**
- `BillingAdmin.jsx` - Only displays plan name (cosmetic)
- No upgrade prompts
- No feature gates
- No limit warnings

**Conclusion:** No UI enforcement of plan limits exists.

---

## 4. Existing Usage Tracking Logic

### Search Results:

**No usage tracking found** for:
- ❌ Job count tracking
- ❌ Customer count tracking
- ❌ Crew member count tracking
- ❌ Feature usage events
- ❌ API call quotas
- ❌ Storage quotas

**Found Related Patterns:**
- `auto_generate_recurring_jobs` flag in `companies` table (feature flag, not usage tracking)
- Rate limiting in public RPCs (security, not plan-based)
- Audit logging (compliance, not usage tracking)

**Conclusion:** No usage tracking infrastructure exists.

---

## 5. Final Answer

### A) Does the app currently enforce any plan limits?

**NO.** The app does not enforce any plan limits. Evidence:

1. **No limit definitions:** No database tables or constants define limits per plan tier
2. **No enforcement code:** No RPC functions, triggers, or UI logic check plan values before allowing operations
3. **No usage tracking:** No counting of jobs, customers, crew members, or other resources
4. **No blocking logic:** No code paths that prevent actions based on plan tier
5. **No upgrade prompts:** No UI that suggests upgrading when approaching or exceeding limits

**Example:** A company with `plan = 'starter'` can create unlimited jobs, customers, and crew members with no restrictions.

### B) Are plan tiers purely cosmetic right now?

**YES.** Plan tiers are purely cosmetic. Evidence:

1. **Display only:** The `plan` field is only used in `BillingAdmin.jsx` to display the plan name (line 133: `capitalize({plan})`)
2. **No functional impact:** Changing a company's `plan` value has no effect on:
   - Feature availability
   - Resource limits
   - Access control
   - UI behavior
   - API capabilities
3. **Default value:** All companies default to `'starter'` but this has no functional meaning
4. **No plan validation:** The database allows any text value (no CHECK constraint on allowed plan names)

**Current State:**
- `plan` is stored in the database
- `plan` is displayed in the billing UI
- `plan` is passed through `UserContext` to components
- `plan` has **zero functional impact** on the application

**To add plan limits, you would need to:**
1. Create a `plan_limits` table or constants defining limits per tier
2. Add usage tracking (count jobs, customers, crew per company)
3. Add enforcement logic in RPCs/triggers to check limits before inserts
4. Add UI warnings/upgrade prompts when approaching limits
5. Add feature gates that check plan tier before enabling features

---

## Summary

- **Database:** Only `companies.plan` text column exists (default: 'starter')
- **Code:** Plan is read and displayed but never checked for logic
- **UI:** No limit enforcement, upgrade prompts, or feature gates
- **Usage Tracking:** None exists
- **Enforcement:** None exists
- **Conclusion:** Plan tiers are purely cosmetic with zero functional impact
