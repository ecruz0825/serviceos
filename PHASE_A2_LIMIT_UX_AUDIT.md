# Phase A.2 Limit UX Audit
## Plan Limit Enforcement and User Experience Review

**Date**: 2024-03-22  
**Scope**: Crew, Customer, and Monthly Job Plan Limits  
**Status**: ✅ **AUDIT COMPLETE** - Implementation-ready

---

## Executive Summary

This audit identifies all plan limit enforcement points, UX patterns, and inconsistencies across the Service Ops SaaS codebase. The system has solid backend enforcement via database triggers, but frontend UX is inconsistent: some creation flows have proactive warnings, others only show errors after submit. Recurring job generation paths lack limit checks entirely.

**Overall Status**: ⚠️ **NEEDS UX IMPROVEMENT** - Backend enforcement is solid, but proactive UX is incomplete

**Top 5 UX Gaps**:
1. **Recurring job generation** (RPC and edge function) bypasses monthly job limit checks
2. **Jobs created from customer detail page** (`handleCreateJob` in CustomersAdmin) lacks preflight limit check
3. **No usage visibility** on creation pages (no limit cards or progress indicators)
4. **No warning banners** when approaching limits (only modal on exact limit hit)
5. **Auto-generate edge function** creates jobs without limit validation

---

## A. Enforcement Map

### A.1 Backend Enforcement (Database Triggers)

| File | Component/Function | Resource | Type | Message/Behavior |
|------|-------------------|----------|------|-------------------|
| `supabase/migrations/20260310080004_enforce_customer_plan_limit.sql` | `enforce_customer_plan_limit()` trigger function | customers | Backend-only block | `CUSTOMER_LIMIT_REACHED: {plan} plan allows up to {limit} customers. Upgrade to Pro to add more customers.` |
| `supabase/migrations/20260310080005_enforce_crew_plan_limit.sql` | `enforce_crew_plan_limit()` trigger function | crew | Backend-only block | `CREW_LIMIT_REACHED: {plan} plan allows up to {limit} crew members. Upgrade to Pro to add more crew members.` |
| `supabase/migrations/20260310080006_enforce_monthly_job_plan_limit.sql` | `enforce_monthly_job_plan_limit()` trigger function | jobs/month | Backend-only block | `JOB_LIMIT_REACHED: {plan} plan allows up to {limit} jobs per month. Upgrade to Pro to create more jobs.` |

**Notes**:
- All triggers fire `BEFORE INSERT` and use `SECURITY DEFINER` to access `plan_limits` table
- Triggers call `get_company_plan_usage()` for current usage snapshot
- Error messages are consistent and include upgrade CTA
- Enforcement is fail-safe: NULL limits (unlimited) are allowed

### A.2 Frontend Preflight Checks (Proactive Warnings)

| File | Component/Function | Resource | Type | Message/Behavior |
|------|-------------------|----------|------|-------------------|
| `src/pages/admin/CrewAdmin.jsx` | `saveCrew()` handler (line 88-92) | crew | Proactive warning | Shows `UpgradeLimitModal` before submit if `!canAddCrew` |
| `src/pages/admin/CustomersAdmin.jsx` | `handleSaveCustomer()` handler (line 1126-1130) | customers | Proactive warning | Shows `UpgradeLimitModal` before submit if `!canAddCustomer` |
| `src/pages/admin/JobsAdmin.jsx` | `saveJob()` handler (line 839-844) | jobs/month | Proactive warning | Shows `UpgradeLimitModal` before submit if `!canCreateJob` (only for new jobs, not edits) |

**Notes**:
- All use `usePlanLimits()` hook to get `canAddCrew`, `canAddCustomer`, `canCreateJob`
- Checks occur in handler before database insert
- Modal shows current usage, limit, and upgrade CTA
- Modal navigates to `/admin/billing` on upgrade click

### A.3 Frontend Submit-Time Error Handling (Reactive)

| File | Component/Function | Resource | Type | Message/Behavior |
|------|-------------------|----------|------|-------------------|
| `src/pages/admin/CrewAdmin.jsx` | `saveCrew()` handler (line 119) | crew | Submit-time block | Calls `handlePlanLimitError()` if backend trigger raises exception |
| `src/pages/admin/CustomersAdmin.jsx` | `handleSaveCustomer()` handler (line 1191) | customers | Submit-time block | Calls `handlePlanLimitError()` if backend trigger raises exception |
| `src/pages/admin/JobsAdmin.jsx` | `saveJob()` handler (line 996) | jobs/month | Submit-time block | Calls `handlePlanLimitError()` if backend trigger raises exception |
| `src/utils/handlePlanLimitError.jsx` | `handlePlanLimitError()` utility | all | Submit-time block | Shows toast with cleaned error message and "Upgrade" button (navigates to `/admin/billing`) |

**Notes**:
- `handlePlanLimitError()` detects `CUSTOMER_LIMIT_REACHED`, `CREW_LIMIT_REACHED`, `JOB_LIMIT_REACHED` in error message
- Toast includes upgrade CTA button
- Logs product event `limit_hit` for analytics
- Returns `true` if handled, `false` otherwise (allows fallback error handling)

### A.4 Backend RPC Enforcement

| File | Component/Function | Resource | Type | Message/Behavior |
|------|-------------------|----------|------|-------------------|
| `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql` | `generate_jobs_from_recurring()` RPC | jobs/month | **⚠️ MISSING** | **No limit check** - Creates jobs directly, relies on trigger only |

**Notes**:
- RPC is called from `SchedulingCenterAdmin.jsx` (line 325)
- RPC does NOT check monthly job limit before generating jobs
- If limit is reached, trigger will block individual job inserts, but user gets partial success (some jobs created, some failed)
- Error handling in frontend (line 330-348) shows generic error, not limit-specific message

### A.5 Edge Function Enforcement

| File | Component/Function | Resource | Type | Message/Behavior |
|------|-------------------|----------|------|-------------------|
| `supabase/functions/auto-generate-recurring-jobs/index.ts` | `serve()` handler | jobs/month | **⚠️ MISSING** | **No limit check** - Creates jobs directly, relies on trigger only |

**Notes**:
- Edge function runs on schedule (cron) to auto-generate recurring jobs
- Does NOT check monthly job limit before creating jobs
- If limit is reached, trigger will block inserts, but function logs error and continues
- No user-facing error (runs in background)

### A.6 Informational Display

| File | Component/Function | Resource | Type | Message/Behavior |
|------|-------------------|----------|------|-------------------|
| `src/pages/admin/BillingAdmin.jsx` | Usage & Limits card (line 264-286) | all | Informational display | Shows `current_crew / max_crew`, `current_customers / max_customers`, `current_jobs_this_month / max_jobs_per_month` |

**Notes**:
- Displays usage fetched from `get_company_plan_usage()` RPC
- Shows "Unlimited" if limit is NULL
- No visual indicators for approaching limits (no progress bars, warning colors)
- No upgrade CTAs on this page (only in Stripe Actions section)

---

## B. Resource-by-Resource UX Review

### B.1 Crew Limits

**Current Preflight UX**: ✅ **GOOD**
- `CrewAdmin.jsx` checks `canAddCrew` before submit
- Shows `UpgradeLimitModal` if limit reached
- Modal displays current usage, limit, and upgrade CTA

**Current Submit UX**: ✅ **GOOD**
- Handler calls `handlePlanLimitError()` if backend trigger raises exception
- Toast shows cleaned error message with upgrade button

**Current Backend Failure UX**: ✅ **GOOD**
- Trigger blocks insert with clear error message
- Error message includes plan name, limit, and upgrade CTA

**Upgrade Path Visibility**: ⚠️ **PARTIAL**
- Modal shows upgrade CTA (navigates to `/admin/billing`)
- Toast shows upgrade button (navigates to `/admin/billing`)
- No usage display on CrewAdmin page itself
- No warning when approaching limit (only on exact limit hit)

**Experience Coherence**: ⚠️ **INCONSISTENT**
- Preflight check works well
- No usage visibility on page
- No approaching-limit warnings
- Upgrade path is clear when limit is hit

### B.2 Customer Limits

**Current Preflight UX**: ✅ **GOOD**
- `CustomersAdmin.jsx` checks `canAddCustomer` before submit
- Shows `UpgradeLimitModal` if limit reached
- Modal displays current usage, limit, and upgrade CTA

**Current Submit UX**: ✅ **GOOD**
- Handler calls `handlePlanLimitError()` if backend trigger raises exception
- Toast shows cleaned error message with upgrade button

**Current Backend Failure UX**: ✅ **GOOD**
- Trigger blocks insert with clear error message
- Error message includes plan name, limit, and upgrade CTA

**Upgrade Path Visibility**: ⚠️ **PARTIAL**
- Modal shows upgrade CTA (navigates to `/admin/billing`)
- Toast shows upgrade button (navigates to `/admin/billing`)
- No usage display on CustomersAdmin page itself
- No warning when approaching limit (only on exact limit hit)

**Experience Coherence**: ⚠️ **INCONSISTENT**
- Preflight check works well
- No usage visibility on page
- No approaching-limit warnings
- Upgrade path is clear when limit is hit

### B.3 Monthly Job Limits

**Current Preflight UX**: ⚠️ **PARTIAL**
- `JobsAdmin.jsx` checks `canCreateJob` before submit (only for new jobs, not edits)
- Shows `UpgradeLimitModal` if limit reached
- Modal displays current usage, limit, and upgrade CTA
- **Gap**: `handleCreateJob()` in `CustomersAdmin.jsx` (line 1723) does NOT check limit before creating job

**Current Submit UX**: ✅ **GOOD**
- Handler calls `handlePlanLimitError()` if backend trigger raises exception
- Toast shows cleaned error message with upgrade button

**Current Backend Failure UX**: ✅ **GOOD**
- Trigger blocks insert with clear error message
- Error message includes plan name, limit, and upgrade CTA

**Upgrade Path Visibility**: ⚠️ **PARTIAL**
- Modal shows upgrade CTA (navigates to `/admin/billing`)
- Toast shows upgrade button (navigates to `/admin/billing`)
- No usage display on JobsAdmin page itself
- No warning when approaching limit (only on exact limit hit)

**Recurring Job Generation UX**: ❌ **POOR**
- `generate_jobs_from_recurring()` RPC does NOT check limit before generating jobs
- `auto-generate-recurring-jobs` edge function does NOT check limit
- If limit is reached, some jobs may be created, some may fail (partial success)
- Error handling is generic, not limit-specific
- No user-facing warning before generation

**Experience Coherence**: ❌ **INCONSISTENT**
- Preflight check works for manual job creation in JobsAdmin
- Missing preflight check for jobs created from customer detail page
- Recurring job generation lacks limit checks entirely
- No usage visibility on pages
- No approaching-limit warnings
- Upgrade path is clear when limit is hit (but too late for recurring jobs)

---

## C. Inconsistency Inventory

### C.1 Limit Enforced Only in Backend

**Issue**: Some creation paths rely solely on backend triggers, with no frontend preflight checks.

**Affected Paths**:
1. **Jobs created from customer detail page** (`CustomersAdmin.jsx` `handleCreateJob`, line 1723)
   - Creates job directly via `supabase.from('jobs').insert()`
   - No `canCreateJob` check before submit
   - User only sees error after submit if limit is reached

2. **Recurring job generation via RPC** (`generate_jobs_from_recurring()`)
   - Called from `SchedulingCenterAdmin.jsx` (line 325)
   - RPC does not check limit before generating jobs
   - If limit is reached, partial success (some jobs created, some failed)
   - Error handling is generic, not limit-specific

3. **Auto-generate recurring jobs** (edge function)
   - Runs on schedule to auto-generate jobs
   - Does not check limit before creating jobs
   - If limit is reached, jobs fail silently (no user-facing error)

**Severity**: **HIGH** - Users can waste time filling forms only to hit limit on submit, or experience partial failures in recurring generation.

### C.2 Missing Warning Before Submit

**Issue**: No proactive warnings when approaching limits (only on exact limit hit).

**Affected Resources**: All (crew, customers, jobs)

**Current Behavior**:
- `UpgradeLimitModal` only shows when limit is exactly reached (`!canAddCrew`, `!canAddCustomer`, `!canCreateJob`)
- No warning at 80%, 90%, or other thresholds
- No usage display on creation pages

**Severity**: **MEDIUM** - Users are surprised when they hit limits, rather than being warned in advance.

### C.3 Unclear or Inconsistent Error Text

**Issue**: Error messages are consistent, but some paths show generic errors instead of limit-specific messages.

**Affected Paths**:
1. **Recurring job generation** (`SchedulingCenterAdmin.jsx`, line 330-348)
   - Shows generic error: "Could not generate jobs from recurring schedules."
   - Does not detect `JOB_LIMIT_REACHED` in error message
   - Does not call `handlePlanLimitError()` to show upgrade CTA

**Severity**: **MEDIUM** - Users don't know why generation failed or how to fix it.

### C.4 Missing Upgrade CTA

**Issue**: Some error paths don't show upgrade CTAs.

**Affected Paths**:
1. **Recurring job generation** (`SchedulingCenterAdmin.jsx`)
   - Generic error message, no upgrade CTA
   - Does not use `handlePlanLimitError()` utility

**Severity**: **MEDIUM** - Users don't know how to resolve limit issues.

### C.5 Different Behavior Across Pages for Same Resource

**Issue**: Jobs can be created from multiple places, but limit checks are inconsistent.

**Affected Paths**:
1. **JobsAdmin.jsx** - Has preflight check (`canCreateJob`)
2. **CustomersAdmin.jsx** `handleCreateJob` - No preflight check
3. **Recurring job generation** - No limit check

**Severity**: **HIGH** - Inconsistent UX confuses users and creates bypass paths.

### C.6 Plan Usage Shown in Some Places But Not Others

**Issue**: Usage is only shown on BillingAdmin page, not on creation pages.

**Affected Pages**:
- ✅ `BillingAdmin.jsx` - Shows usage/limits
- ❌ `CrewAdmin.jsx` - No usage display
- ❌ `CustomersAdmin.jsx` - No usage display
- ❌ `JobsAdmin.jsx` - No usage display
- ❌ `SchedulingCenterAdmin.jsx` - No usage display

**Severity**: **MEDIUM** - Users don't know their current usage until they visit billing page.

---

## D. Recommended Implementation Plan

### D.1 Shared Sources of Truth

**Existing (Keep)**:
- ✅ `src/hooks/usePlanLimits.js` - Single source of truth for plan limits and usage
- ✅ `src/components/ui/UpgradeLimitModal.jsx` - Reusable modal for limit warnings
- ✅ `src/utils/handlePlanLimitError.jsx` - Reusable error handler for submit-time errors
- ✅ `supabase/migrations/20260310080003_get_company_plan_usage.sql` - Backend RPC for usage snapshot

**New (Create)**:
- 🔨 `src/components/ui/LimitCard.jsx` - Reusable card component showing usage/limit with progress indicator
- 🔨 `src/components/ui/LimitWarningBanner.jsx` - Reusable banner component for approaching-limit warnings (e.g., 80%, 90%)

### D.2 Exact Pages/Components to Modify First (Priority 1)

**1. JobsAdmin.jsx**
- ✅ Already has preflight check - **KEEP**
- 🔨 Add `LimitCard` component showing monthly job usage/limit
- 🔨 Add `LimitWarningBanner` when approaching limit (e.g., 80% of monthly limit)
- 🔨 Ensure `handleCreateJob` in customer detail drawer also checks limit (if it exists in this file)

**2. CustomersAdmin.jsx**
- ✅ Already has preflight check - **KEEP**
- 🔨 Add `LimitCard` component showing customer usage/limit
- 🔨 Add `LimitWarningBanner` when approaching limit (e.g., 80% of customer limit)
- 🔨 **FIX**: Add preflight check to `handleCreateJob()` (line 1723) before creating job

**3. CrewAdmin.jsx**
- ✅ Already has preflight check - **KEEP**
- 🔨 Add `LimitCard` component showing crew usage/limit
- 🔨 Add `LimitWarningBanner` when approaching limit (e.g., 80% of crew limit)

**4. SchedulingCenterAdmin.jsx**
- 🔨 **FIX**: Add preflight check before calling `generate_jobs_from_recurring()` RPC
- 🔨 **FIX**: Update error handling to use `handlePlanLimitError()` for limit-specific errors
- 🔨 Add `LimitCard` component showing monthly job usage/limit
- 🔨 Add `LimitWarningBanner` when approaching limit

**5. RecurringJobsAdmin.jsx** (if still used)
- 🔨 **FIX**: Add preflight check before generating jobs from recurring templates
- 🔨 Add `LimitCard` component showing monthly job usage/limit

### D.3 What Should Be Standardized

**1. Preflight Check Pattern**
- All creation handlers should check `canAddCrew`, `canAddCustomer`, or `canCreateJob` before submit
- Show `UpgradeLimitModal` if limit is reached
- Pattern: Check in handler, show modal, return early if limit reached

**2. Submit-Time Error Handling**
- All creation handlers should call `handlePlanLimitError()` after database insert
- Pattern: `if (!handlePlanLimitError(error, navigate)) { toast.error(error.message); }`

**3. Usage Display**
- All creation pages should show `LimitCard` component with current usage/limit
- Pattern: Use `usePlanLimits()` hook, pass `usage` and `limits` to `LimitCard`

**4. Approaching-Limit Warnings**
- All creation pages should show `LimitWarningBanner` when usage >= 80% of limit
- Pattern: Calculate percentage, show banner if >= threshold

**5. Recurring Job Generation**
- All recurring job generation paths should check monthly job limit before generating
- Pattern: Check `canCreateJob` and estimated jobs to generate, show warning if would exceed limit

### D.4 Priority 1 Surfaces for UX Pass

**Must Fix (P0)**:
1. ✅ Add preflight check to `handleCreateJob()` in CustomersAdmin
2. ✅ Add preflight check to `generate_jobs_from_recurring()` RPC call in SchedulingCenterAdmin
3. ✅ Update error handling in SchedulingCenterAdmin to use `handlePlanLimitError()`
4. ✅ Add limit check to `auto-generate-recurring-jobs` edge function (or document as known limitation)

**Should Fix (P1)**:
1. ✅ Add `LimitCard` to JobsAdmin, CustomersAdmin, CrewAdmin, SchedulingCenterAdmin
2. ✅ Add `LimitWarningBanner` to all creation pages when approaching limits
3. ✅ Standardize error handling across all creation paths

**Nice to Have (P2)**:
1. ✅ Add usage display to RecurringJobsAdmin (if still used)
2. ✅ Add progress indicators to LimitCard (visual progress bar)
3. ✅ Add "Upgrade" quick link in LimitCard when approaching limit

---

## E. Acceptance Checklist

### E.1 Preflight Checks

- [ ] All crew creation paths check `canAddCrew` before submit
- [ ] All customer creation paths check `canAddCustomer` before submit
- [ ] All job creation paths check `canCreateJob` before submit (including `handleCreateJob` in CustomersAdmin)
- [ ] Recurring job generation checks monthly job limit before generating jobs
- [ ] All preflight checks show `UpgradeLimitModal` when limit is reached

### E.2 Submit-Time Error Handling

- [ ] All creation handlers call `handlePlanLimitError()` after database insert
- [ ] Recurring job generation error handling uses `handlePlanLimitError()` for limit-specific errors
- [ ] All error messages include upgrade CTA when limit is reached

### E.3 Usage Visibility

- [ ] JobsAdmin page shows monthly job usage/limit
- [ ] CustomersAdmin page shows customer usage/limit
- [ ] CrewAdmin page shows crew usage/limit
- [ ] SchedulingCenterAdmin page shows monthly job usage/limit
- [ ] All usage displays use consistent `LimitCard` component

### E.4 Approaching-Limit Warnings

- [ ] Warning banner appears when crew usage >= 80% of limit
- [ ] Warning banner appears when customer usage >= 80% of limit
- [ ] Warning banner appears when monthly job usage >= 80% of limit
- [ ] All warning banners use consistent `LimitWarningBanner` component
- [ ] Warning banners include upgrade CTA

### E.5 Recurring Job Generation

- [ ] `generate_jobs_from_recurring()` RPC call checks limit before generating
- [ ] Error handling in SchedulingCenterAdmin detects limit errors and shows upgrade CTA
- [ ] Auto-generate edge function either checks limit or documents limitation

### E.6 Consistency

- [ ] All creation pages use same preflight check pattern
- [ ] All creation pages use same error handling pattern
- [ ] All creation pages use same usage display pattern
- [ ] All creation pages use same warning banner pattern
- [ ] All upgrade CTAs navigate to `/admin/billing`

---

## F. Implementation Readiness

**Status**: ✅ **READY FOR IMPLEMENTATION**

**Prerequisites Met**:
- ✅ Backend enforcement is solid (triggers work correctly)
- ✅ Frontend hooks and utilities exist (`usePlanLimits`, `handlePlanLimitError`, `UpgradeLimitModal`)
- ✅ Existing patterns are clear and can be extended
- ✅ No database schema changes needed

**Recommended First Implementation Prompt**:

```
EXECUTION MODE — PHASE A.2 / STEP 1
Task: Create shared limit UX components and fix highest-priority gaps.

Scope:
1. Create src/components/ui/LimitCard.jsx - Reusable card showing usage/limit with progress
2. Create src/components/ui/LimitWarningBanner.jsx - Reusable banner for approaching-limit warnings
3. Fix handleCreateJob() in CustomersAdmin.jsx to check canCreateJob before creating job
4. Fix generate_jobs_from_recurring() call in SchedulingCenterAdmin.jsx to check limit before generating
5. Update error handling in SchedulingCenterAdmin.jsx to use handlePlanLimitError()

Do NOT modify backend triggers.
Do NOT modify RPCs yet.
Do NOT add features outside scope.
```

---

*End of Audit Report*
