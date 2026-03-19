# Proactive Plan Limit Detection - Implementation Summary

**Goal**: Implement proactive plan-limit detection and friendly UX before database triggers fire.

---

## Files Created

### 1. `src/hooks/usePlanLimits.js`
Reusable hook that:
- Calls existing RPC `get_company_plan_usage()`
- Exposes:
  - `plan` - Current plan code
  - `limits` - `{ max_crew, max_customers, max_jobs_per_month }`
  - `usage` - `{ current_crew, current_customers, current_jobs_this_month }`
  - `isLoading` - Loading state
  - `canAddCrew` - Boolean (usage < limit or limit is null)
  - `canAddCustomer` - Boolean (usage < limit or limit is null)
  - `canCreateJob` - Boolean (usage < limit or limit is null)

### 2. `src/components/ui/UpgradeLimitModal.jsx`
Modal component for displaying plan limit warnings:
- Shows friendly message based on limit type (crew/customers/jobs)
- Includes upgrade CTA button
- Logs `limit_warning_shown` event when displayed
- Logs `upgrade_cta_clicked` event when upgrade button clicked
- Routes to `/admin/billing` on upgrade click

---

## Files Modified

### 3. `src/pages/admin/CrewAdmin.jsx`
- Added `usePlanLimits()` hook
- Added `UpgradeLimitModal` component
- Added proactive check in `saveCrew()` before insert (only for new crew, not edits)
- Shows modal if `!canAddCrew` before attempting insert

### 4. `src/pages/admin/CustomersAdmin.jsx`
- Added `usePlanLimits()` hook
- Added `UpgradeLimitModal` component
- Added proactive check in `handleSubmit()` before insert (only for new customers, not edits)
- Shows modal if `!canAddCustomer` before attempting insert

### 5. `src/pages/admin/JobsAdmin.jsx`
- Added `usePlanLimits()` hook
- Added `UpgradeLimitModal` component
- Added proactive check in `saveJob()` before insert (only for new jobs, not edits)
- Shows modal if `!canCreateJob` before attempting insert

---

## Implementation Details

### Proactive Checks
- **When**: Before mutation (insert only, not updates)
- **Condition**: `!editingId && !limitsLoading && !canAddX`
- **Action**: Show upgrade modal, prevent mutation
- **Fallback**: Database triggers still enforce limits (defense in depth)

### Telemetry Events

1. **`limit_warning_shown`**
   - Logged when modal is displayed
   - Context:
     ```json
     {
       "limit_type": "crew" | "customers" | "jobs",
       "current_usage": number,
       "limit": number,
       "plan": string
     }
     ```

2. **`upgrade_cta_clicked`**
   - Logged when upgrade button is clicked
   - Context:
     ```json
     {
       "limit_type": "crew" | "customers" | "jobs",
       "current_usage": number,
       "limit": number,
       "plan": string
     }
     ```

### User Flow
1. User attempts to create crew/customer/job
2. Hook checks if limit would be exceeded
3. If limit exceeded:
   - Modal displays friendly message
   - `limit_warning_shown` event logged
   - User can click "Upgrade Plan" or "Cancel"
4. If "Upgrade Plan" clicked:
   - `upgrade_cta_clicked` event logged
   - User navigated to `/admin/billing`
5. If limit not exceeded:
   - Mutation proceeds normally
   - Database trigger still enforces (defense in depth)

---

## Safety & Constraints

✅ **Database triggers remain** - No changes to existing enforcement
✅ **Multi-tenant safe** - Uses `effectiveCompanyId` from UserContext
✅ **Minimal changes** - Only added checks before mutations, no refactoring
✅ **Edit-safe** - Only checks limits for new records, not updates
✅ **Loading-aware** - Waits for limits to load before checking
✅ **Defense in depth** - Database triggers still enforce if UI check is bypassed

---

## Testing Checklist

- [ ] Create crew member when at limit → modal shows
- [ ] Create customer when at limit → modal shows
- [ ] Create job when at monthly limit → modal shows
- [ ] Edit existing crew/customer/job → no limit check (should work)
- [ ] Click "Upgrade Plan" → navigates to billing page
- [ ] Click "Cancel" → modal closes, no mutation
- [ ] Verify `limit_warning_shown` event logged
- [ ] Verify `upgrade_cta_clicked` event logged
- [ ] Verify database trigger still enforces if UI check bypassed

---

## Notes

- Hook uses existing `get_company_plan_usage()` RPC (no new database changes)
- Modal follows existing UI patterns (similar to `ConfirmModal`)
- Telemetry uses existing `logProductEvent()` utility
- All changes are surgical and follow repo patterns
- No large component rewrites

---

**Status**: ✅ Complete
**Next Steps**: Test in staging, verify telemetry events are logged correctly
