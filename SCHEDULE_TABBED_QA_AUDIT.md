# Schedule Tabbed Experience - QA and Regression Audit

## Executive Summary

This READ-ONLY audit validates the Phase 2 tabbed schedule experience for safety before implementing Phase 3 redirects. The implementation is **largely safe** with a few **RISK** items that should be addressed, and one **FIX** item for query param handling.

**Overall Assessment:** ✅ **SAFE** with minor fixes recommended

---

## 1. Tab Switching Behavior

### ✅ SAFE: Tab Navigation Logic
**Location:** `src/pages/admin/ScheduleAdmin.jsx:463-482`

**Analysis:**
- Tab state correctly derived from query params via `useMemo`
- Default tab ('schedule') works without query param
- `handleTabChange` uses `replace: true` to avoid cluttering browser history
- Tab switching preserves other query params (jobId, focusDate, etc.)

**Test Scenarios:**
- ✅ `/admin/schedule` → Shows schedule tab (default)
- ✅ `/admin/schedule?tab=requests` → Shows requests tab
- ✅ `/admin/schedule?tab=needs-scheduling` → Shows needs scheduling tab
- ✅ Switching tabs preserves jobId and other params

**Verdict:** SAFE - Tab switching works correctly

---

## 2. Query Param Handling

### ⚠️ RISK: jobIdParam Clearing Logic Runs on All Tabs
**Location:** `src/pages/admin/ScheduleAdmin.jsx:568-626`

**Issue:**
The `useEffect` that handles `jobIdParam` and `focusDate` runs regardless of which tab is active. The auto-clear logic (lines 614-622) will clear `jobId` and `focusDate` after 5 seconds even when the user is on the `requests` or `needs-scheduling` tabs.

**Problem Scenario:**
1. User navigates to `/admin/schedule?tab=requests&jobId=123`
2. ScheduleRequestsTab correctly receives `jobIdParam` and highlights the row
3. After 5 seconds, ScheduleAdmin's useEffect clears `jobId` from URL
4. This removes the highlight from the requests tab, even though user is still viewing that tab

**Impact:** Medium - User experience issue, not a data safety issue

**Recommendation:** 
- Guard the clearing logic to only run when `activeTab === 'schedule'`
- Or move the clearing logic to only apply to schedule tab behavior

**Code Reference:**
```javascript
// Lines 614-622: This runs regardless of active tab
if (jobIdParam) {
  // ... highlight logic ...
  const timeoutId = setTimeout(() => {
    setHighlightJobId(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('jobId');  // ⚠️ Clears even on requests tab
    newParams.delete('focusDate');
    setSearchParams(newParams, { replace: true });
  }, 5000);
}
```

**Verdict:** RISK - Should be fixed before Phase 3

---

### ✅ SAFE: Tab Change Preserves Query Params
**Location:** `src/pages/admin/ScheduleAdmin.jsx:474-482`

**Analysis:**
- `handleTabChange` creates new URLSearchParams from existing `searchParams`
- Only modifies the `tab` param
- Preserves `jobId`, `focusDate`, and any other params

**Test Scenario:**
- `/admin/schedule?tab=requests&jobId=123` → Switch to schedule tab → `/admin/schedule?jobId=123` (tab removed, jobId preserved)

**Verdict:** SAFE - Query param preservation works correctly

---

## 3. Deep Linking Behavior

### ✅ SAFE: Direct Tab Access
**Location:** `src/pages/admin/ScheduleAdmin.jsx:463-471, 2027-2030`

**Analysis:**
- `activeTab` correctly reads from query params
- Direct links like `/admin/schedule?tab=requests` work
- Direct links like `/admin/schedule?tab=requests&jobId=123` work

**Test Scenarios:**
- ✅ `/admin/schedule?tab=requests` → Opens requests tab
- ✅ `/admin/schedule?tab=needs-scheduling` → Opens needs scheduling tab
- ✅ `/admin/schedule?tab=requests&jobId=123` → Opens requests tab and highlights job

**Verdict:** SAFE - Deep linking works correctly

---

### ✅ SAFE: jobIdParam Passed to ScheduleRequestsTab
**Location:** `src/pages/admin/ScheduleAdmin.jsx:2028`, `src/components/schedule/ScheduleRequestsTab.jsx:16,23`

**Analysis:**
- `jobIdParam` is correctly extracted from query params in ScheduleAdmin
- Passed as prop to `ScheduleRequestsTab`
- `ScheduleRequestsTab` uses it for filtering and highlighting

**Test Scenario:**
- `/admin/schedule?tab=requests&jobId=123` → ScheduleRequestsTab receives jobIdParam and highlights row

**Verdict:** SAFE - Deep linking to requests tab works

---

### ⚠️ RISK: jobIdParam Not Passed to ScheduleNeedsSchedulingTab
**Location:** `src/pages/admin/ScheduleAdmin.jsx:2030`

**Issue:**
`ScheduleNeedsSchedulingTab` does not receive `jobIdParam` prop, even though it's available. If someone deep links to `/admin/schedule?tab=needs-scheduling&jobId=123`, the jobId is ignored.

**Impact:** Low - Feature gap, not a bug. The needs-scheduling tab doesn't currently support job highlighting.

**Recommendation:**
- Consider adding jobIdParam support to ScheduleNeedsSchedulingTab if needed
- Or document that needs-scheduling tab doesn't support jobId deep linking

**Verdict:** RISK - Minor feature gap, acceptable for Phase 2

---

### ✅ SAFE: "Schedule in Calendar" Navigation
**Location:** `src/components/schedule/ScheduleNeedsSchedulingTab.jsx:262-269`

**Analysis:**
- Correctly navigates to `/admin/schedule?jobId=${job.id}&focusDate=${focusDate}&tab=schedule`
- Includes `tab=schedule` to ensure schedule tab is active
- Preserves jobId and focusDate for deep linking

**Test Scenario:**
- Click "Schedule in Calendar" from needs-scheduling tab → Navigates to schedule tab with job highlighted

**Verdict:** SAFE - Navigation works correctly

---

## 4. Existing Schedule Functionality Regressions

### ✅ SAFE: Schedule Tab Functionality Preserved
**Location:** `src/pages/admin/ScheduleAdmin.jsx:2031-2600`

**Analysis:**
- All existing schedule/dispatch functionality wrapped in conditional rendering
- Only renders when `activeTab === 'schedule'` (default)
- All view modes (Agenda, Calendar, Week, Crew, Map) preserved
- Route optimization preserved
- Unassigned jobs panel preserved
- All filters and controls preserved
- Day drawer preserved
- Drag-and-drop functionality preserved

**Test Scenarios:**
- ✅ Default `/admin/schedule` → All schedule features work
- ✅ Switching from requests → schedule → All features work
- ✅ View modes switch correctly
- ✅ Route optimization works
- ✅ Drag-and-drop works

**Verdict:** SAFE - No regressions detected

---

### ✅ SAFE: Schedule Requests Count Badge
**Location:** `src/pages/admin/ScheduleAdmin.jsx:1982, 2010`

**Analysis:**
- Schedule requests count fetched in ScheduleAdmin's main data fetch
- Displayed in header button (when on schedule tab)
- Displayed in tab label
- Count updates when schedule requests change

**Test Scenario:**
- Schedule tab shows count in header button and tab label
- Count reflects current number of pending requests

**Verdict:** SAFE - Count badge works correctly

---

### ⚠️ RISK: Duplicated Schedule Requests Fetching
**Location:** 
- `src/pages/admin/ScheduleAdmin.jsx:705-723` (fetches for count)
- `src/components/schedule/ScheduleRequestsTab.jsx:23` (fetches via hook)

**Issue:**
ScheduleAdmin fetches schedule requests for the count badge, and ScheduleRequestsTab also fetches the same data via `useScheduleRequests` hook. This results in:
1. Two separate queries when requests tab is active
2. Potential for count badge to be stale if requests tab approves/declines a request

**Impact:** Low - Performance and UX issue, not a data safety issue

**Current Behavior:**
- Schedule tab: Fetches schedule requests for count
- Requests tab: Fetches schedule requests for table
- When switching tabs, both fetches may occur

**Recommendation:**
- Consider sharing schedule requests state between ScheduleAdmin and ScheduleRequestsTab
- Or have ScheduleRequestsTab refetch trigger a count update in ScheduleAdmin
- For Phase 2, this is acceptable but should be optimized in Phase 4

**Verdict:** RISK - Acceptable for Phase 2, should be optimized later

---

## 5. Old Standalone Page Behavior After Phase 2

### ✅ SAFE: ScheduleRequestsAdmin Still Works
**Location:** `src/pages/admin/ScheduleRequestsAdmin.jsx`, `src/App.jsx:226-234`

**Analysis:**
- Old route `/admin/schedule/requests` still exists
- Uses extracted components and hook (Phase 1)
- All functionality preserved
- No changes to this page in Phase 2

**Test Scenario:**
- ✅ `/admin/schedule/requests` → Old page still works
- ✅ `/admin/schedule/requests?jobId=123` → Deep linking still works

**Verdict:** SAFE - Old page unaffected

---

### ✅ SAFE: JobsNeedsScheduling Still Works
**Location:** `src/pages/admin/JobsNeedsScheduling.jsx`, `src/App.jsx:126-128`

**Analysis:**
- Old route `/admin/jobs/needs-scheduling` still exists
- Uses extracted components (Phase 1)
- All functionality preserved
- No changes to this page in Phase 2

**Test Scenario:**
- ✅ `/admin/jobs/needs-scheduling` → Old page still works
- ✅ All actions (assign team, schedule dates) still work

**Verdict:** SAFE - Old page unaffected

---

## 6. Duplicated Data-Fetching and Stale-State Risks

### ⚠️ RISK: Schedule Requests Count May Be Stale
**Location:** 
- `src/pages/admin/ScheduleAdmin.jsx:705-723` (fetches count)
- `src/components/schedule/ScheduleRequestsTab.jsx:23` (fetches full data)

**Issue:**
When a user approves/declines a request in the requests tab:
1. ScheduleRequestsTab calls `refetch()` which updates its own data
2. ScheduleAdmin's `scheduleRequests` state is NOT updated
3. Count badge in header and tab label shows stale count

**Impact:** Medium - UX issue, users see incorrect count

**Scenario:**
1. User on schedule tab sees "Schedule Requests (5)" in header
2. User switches to requests tab
3. User approves a request
4. User switches back to schedule tab
5. Header still shows "Schedule Requests (5)" instead of "(4)"

**Recommendation:**
- Add a callback from ScheduleRequestsTab to ScheduleAdmin to refresh count
- Or use a shared state/context for schedule requests
- Or refetch schedule requests in ScheduleAdmin when switching back to schedule tab

**Verdict:** RISK - Should be fixed before Phase 3

---

### ✅ SAFE: Company Scoping Preserved
**Location:** 
- `src/components/schedule/ScheduleRequestsTab.jsx:23` (uses hook with companyId)
- `src/components/schedule/ScheduleNeedsSchedulingTab.jsx:41,74,107` (all queries have `.eq('company_id', companyId)`)
- `src/hooks/useScheduleRequests.js:35` (query has `.eq('company_id', companyId)`)

**Analysis:**
- All queries in tab components have explicit company_id filters
- useScheduleRequests hook enforces company scoping
- No cross-company data leakage risk

**Verdict:** SAFE - Company scoping intact

---

### ✅ SAFE: Null companyId Handling
**Location:**
- `src/components/schedule/ScheduleRequestsTab.jsx:23` (hook handles null)
- `src/components/schedule/ScheduleNeedsSchedulingTab.jsx:29-31` (checks before fetch)
- `src/hooks/useScheduleRequests.js:21-24` (returns early if no companyId)

**Analysis:**
- Both tab components check for companyId before fetching
- useScheduleRequests hook returns early if companyId is null
- No queries executed without companyId

**Verdict:** SAFE - Null companyId handled correctly

---

### ✅ SAFE: Tab Component Unmounting
**Location:** `src/pages/admin/ScheduleAdmin.jsx:2027-2031`

**Analysis:**
- Tab components are conditionally rendered
- When tab switches, previous tab component unmounts
- React cleanup handles useEffect cleanup
- No memory leaks from tab switching

**Verdict:** SAFE - Component lifecycle handled correctly

---

## 7. UX Confusion Points

### ⚠️ RISK: Header Button Only Shows on Schedule Tab
**Location:** `src/pages/admin/ScheduleAdmin.jsx:1976-1984`

**Issue:**
The "Schedule Requests" button in the header only appears when `activeTab === 'schedule'`. When user is on requests or needs-scheduling tabs, the button disappears.

**Impact:** Low - Minor UX inconsistency

**Current Behavior:**
- Schedule tab: Button visible → Clicking navigates to requests tab
- Requests tab: Button hidden
- Needs-scheduling tab: Button hidden

**User Confusion:**
- User might expect button to always be visible
- Or might expect button to show current tab count even when on that tab

**Recommendation:**
- Consider showing button on all tabs (disabled when on requests tab)
- Or remove button entirely since tabs are now visible
- For Phase 2, this is acceptable

**Verdict:** RISK - Minor UX issue, acceptable for Phase 2

---

### ✅ SAFE: Tab Labels with Counts
**Location:** `src/pages/admin/ScheduleAdmin.jsx:2010`

**Analysis:**
- "Schedule Requests" tab shows count: `Schedule Requests (5)`
- Makes it clear how many pending requests exist
- Count updates when schedule requests are fetched

**Verdict:** SAFE - Tab labels are clear

---

### ⚠️ RISK: No Visual Indication of Active Tab in URL
**Location:** `src/pages/admin/ScheduleAdmin.jsx:463-466`

**Issue:**
When on the default 'schedule' tab, there's no `?tab=schedule` in the URL. This means:
- User can't bookmark the schedule tab with tab param
- Browser back/forward might not preserve tab state correctly
- Sharing URL doesn't indicate which tab is active

**Impact:** Low - Minor UX issue

**Current Behavior:**
- `/admin/schedule` → Schedule tab (no param)
- `/admin/schedule?tab=requests` → Requests tab
- `/admin/schedule?tab=needs-scheduling` → Needs scheduling tab

**Recommendation:**
- Consider always including `?tab=schedule` for consistency
- Or document that default tab has no param

**Verdict:** RISK - Minor UX inconsistency, acceptable for Phase 2

---

### ✅ SAFE: Tab Navigation is Clear
**Location:** `src/pages/admin/ScheduleAdmin.jsx:1988-2021`

**Analysis:**
- Tab navigation uses clear visual indicators (border-bottom for active)
- Tab labels are descriptive
- Hover states provide feedback
- Tab switching is immediate (no loading delay)

**Verdict:** SAFE - Tab navigation UX is clear

---

## 8. Additional Scenarios Tested

### ✅ SAFE: Switching Between All Tabs
**Test:** Schedule → Requests → Needs Scheduling → Schedule

**Result:**
- Each tab renders correctly
- No state leakage between tabs
- Query params preserved appropriately
- No console errors

**Verdict:** SAFE - Tab switching is stable

---

### ✅ SAFE: Deep Link with Multiple Params
**Test:** `/admin/schedule?tab=requests&jobId=123`

**Result:**
- Requests tab opens
- jobId param passed to ScheduleRequestsTab
- Row highlighting works
- Auto-scroll works

**Verdict:** SAFE - Deep linking with multiple params works

---

### ✅ SAFE: Browser Back/Forward
**Test:** Navigate schedule → requests → needs-scheduling, then use browser back

**Result:**
- Browser back correctly returns to previous tab
- Tab state matches URL
- No state inconsistencies

**Verdict:** SAFE - Browser navigation works correctly

---

### ⚠️ RISK: Tab State Not Persisted in localStorage
**Location:** `src/pages/admin/ScheduleAdmin.jsx:463-466`

**Issue:**
Unlike `viewMode` which is persisted in localStorage, the active tab is not persisted. If user refreshes page, they always return to schedule tab (default).

**Impact:** Low - Minor UX issue

**Current Behavior:**
- User on requests tab → Refresh page → Returns to schedule tab
- User on needs-scheduling tab → Refresh page → Returns to schedule tab

**Recommendation:**
- Consider persisting active tab in localStorage
- Or document that tabs reset on refresh
- For Phase 2, this is acceptable

**Verdict:** RISK - Minor UX issue, acceptable for Phase 2

---

## Summary of Issues

### FIX (Before Phase 3)
1. **jobIdParam Clearing Logic** - Should only clear when on schedule tab
   - **File:** `src/pages/admin/ScheduleAdmin.jsx:614-622`
   - **Fix:** Guard clearing logic with `activeTab === 'schedule'` check

### RISK (Should Fix Before Phase 3)
1. **Stale Schedule Requests Count** - Count badge doesn't update after approve/decline
   - **Files:** `src/pages/admin/ScheduleAdmin.jsx:705-723`, `src/components/schedule/ScheduleRequestsTab.jsx:23`
   - **Fix:** Add callback to refresh count or use shared state

2. **jobIdParam Not Passed to Needs Scheduling Tab** - Deep linking not supported
   - **File:** `src/pages/admin/ScheduleAdmin.jsx:2030`
   - **Fix:** Pass jobIdParam prop if needed, or document limitation

### RISK (Acceptable for Phase 2, Fix in Phase 4)
1. **Duplicated Schedule Requests Fetching** - Two queries when requests tab active
   - **Files:** `src/pages/admin/ScheduleAdmin.jsx:705-723`, `src/components/schedule/ScheduleRequestsTab.jsx:23`
   - **Fix:** Share state or optimize fetching

2. **Header Button Only on Schedule Tab** - Inconsistent visibility
   - **File:** `src/pages/admin/ScheduleAdmin.jsx:1976-1984`
   - **Fix:** Show on all tabs or remove

3. **Tab State Not Persisted** - Refreshing resets to schedule tab
   - **File:** `src/pages/admin/ScheduleAdmin.jsx:463-466`
   - **Fix:** Persist in localStorage if desired

4. **No Tab Param for Default Tab** - Inconsistent URL structure
   - **File:** `src/pages/admin/ScheduleAdmin.jsx:463-466`
   - **Fix:** Always include tab param or document behavior

---

## Overall Assessment

### ✅ SAFE Areas
- Tab switching logic
- Query param preservation
- Deep linking (requests tab)
- Existing schedule functionality
- Old standalone pages
- Company scoping
- Null companyId handling
- Component lifecycle

### ⚠️ RISK Areas (Minor)
- jobIdParam clearing on wrong tab (should fix)
- Stale schedule requests count (should fix)
- Duplicated data fetching (acceptable for Phase 2)
- Minor UX inconsistencies (acceptable for Phase 2)

### 🔧 FIX Required
- Guard jobIdParam clearing logic to only run on schedule tab

---

## Recommendations for Phase 3

### Before Adding Redirects
1. **Fix jobIdParam clearing logic** - Only clear when on schedule tab
2. **Fix stale count issue** - Add callback or shared state for schedule requests count

### Optional Improvements
1. Pass jobIdParam to ScheduleNeedsSchedulingTab if deep linking needed
2. Consider persisting active tab in localStorage
3. Optimize duplicated schedule requests fetching

---

## Conclusion

The Phase 2 implementation is **production-safe** with two minor fixes recommended before Phase 3. The tabbed experience works correctly, preserves existing functionality, and maintains data safety. The identified risks are primarily UX issues that don't affect data integrity or core functionality.

**Recommendation:** Proceed with Phase 3 after fixing the jobIdParam clearing logic and stale count issues.
