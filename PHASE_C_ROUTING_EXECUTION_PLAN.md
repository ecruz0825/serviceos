# Phase C: Routing Execution Plan (Launch-Safe Batch)

## Executive Summary

This plan refines the routing polish into a **launch-safe execution batch** that improves clarity without introducing a full draft→publish lifecycle. The focus is on **operator UX improvements** that are low-risk and high-value.

**Key Decision:** **Defer publish-route workflow** for now. The current system works (routes are generated, stored, and visible to crew). Adding a publish step would require:
- New RPC or status update logic
- Potential crew route access rule changes
- Workflow redesign

**Instead:** Focus on clarity improvements that work with existing route status system.

**Revised Approach:**
- Show route status clearly (draft/published) with explanations
- Add pre-generation validation (prevent issues before they happen)
- Add route mismatch quick fix (one-click resolution)
- Add generation path guidance (reduce confusion)
- Improve error messages (better failure handling)

**Result:** Routing becomes clearer and more confident without lifecycle changes.

---

## Revised Batch 1: Must-Do Before Launch (Launch-Safe)

### 1. Route Status Clarity (No Publish Required)
**Priority:** P1 - High-value clarity
**Effort:** 1 hour
**Risk:** Low (read-only display improvements)

**What to Do:**
- Enhance route status badge in `RoutePlanningAdmin.jsx`:
  - Show status (draft/published/archived) with tooltip
  - Tooltip explains: "Draft routes can be regenerated. Published routes are finalized."
  - Add visual distinction (draft = blue, published = green)
- In `DispatchCenterAdmin.jsx` Route Status panel:
  - Show route status alongside "route exists" badge
  - Add tooltip: "Draft routes may change. Published routes are final."

**Why This Works Without Publish:**
- Just displays existing status clearly
- No mutation required
- Crew already sees routes (via `get_team_route_for_day()` which prefers published)
- Admins understand what status means

**Files:**
- `src/pages/admin/RoutePlanningAdmin.jsx` (status badge enhancement)
- `src/pages/admin/DispatchCenterAdmin.jsx` (route status panel enhancement)

---

### 2. Pre-Generation Validation
**Priority:** P1 - High-value prevention
**Effort:** 2-3 hours
**Risk:** Low (read-only checks before generation)

**What to Do:**
- Before calling `generate_team_route_for_day()`, query jobs for team/date
- Count and display:
  - Total jobs assigned to team for date
  - Jobs with addresses (and count missing)
  - Jobs with coordinates (and count missing)
  - Jobs with valid status (not Completed/Canceled)
- Show validation summary:
  - "5 jobs ready for routing"
  - "2 jobs missing addresses (will use fallback ordering)"
  - "0 jobs missing coordinates"
- Add "Generate Route" button that shows validation first (or inline validation)
- Allow "Generate Anyway" if validation shows issues

**Why This Works:**
- Read-only validation before generation
- No route lifecycle changes
- Prevents suboptimal routes
- Clear feedback to admin

**Files:**
- `src/pages/admin/RoutePlanningAdmin.jsx` (validation before generation)
- `src/pages/admin/SchedulingCenterAdmin.jsx` (validation before bulk generation)

---

### 3. Route Mismatch Quick Fix
**Priority:** P1 - High-value quick win
**Effort:** 1 hour
**Risk:** Low (calls existing RPC)

**What to Do:**
- In `DispatchCenterAdmin.jsx` route mismatch warnings:
  - Add "Regenerate Route" button next to warning
  - Button calls `generate_team_route_for_day(today, teamId)`
  - Show loading state during generation
  - Refresh route status after generation
  - Show success/error toast

**Why This Works:**
- Uses existing RPC (no new logic)
- One-click fix for common issue
- Low risk (same RPC used elsewhere)

**Files:**
- `src/pages/admin/DispatchCenterAdmin.jsx` (add button to mismatch warnings)

---

### 4. Generation Path Guidance
**Priority:** P2 - UX clarity
**Effort:** 30 minutes
**Risk:** Very Low (help text only)

**What to Do:**
- Add tooltip/help text to Route Planning:
  - "Generate routes for specific teams and dates. Use this for planning ahead or regenerating specific routes."
- Add tooltip/help text to Scheduling Center:
  - "Bulk generate routes for all teams with assigned jobs today. Use this for daily route preparation."
- Or add inline guidance cards explaining when to use each

**Why This Works:**
- Just adds help text
- No code logic changes
- Reduces confusion

**Files:**
- `src/pages/admin/RoutePlanningAdmin.jsx` (add help text)
- `src/pages/admin/SchedulingCenterAdmin.jsx` (add help text)

---

### 5. Better Generation Failure Messages
**Priority:** P2 - UX polish
**Effort:** 1 hour
**Risk:** Very Low (error handling only)

**What to Do:**
- Map RPC errors to user-friendly messages:
  - "No routable jobs" → "No jobs with valid addresses found for this team and date. Add addresses to jobs to enable route optimization."
  - "Team not found" → "Team selection invalid. Please refresh and try again."
  - "No jobs assigned" → "No jobs are assigned to this team for the selected date."
- Add actionable guidance in error states
- Show "What to do next" suggestions

**Why This Works:**
- Just improves error messages
- No route logic changes
- Better user experience

**Files:**
- `src/pages/admin/RoutePlanningAdmin.jsx` (error message mapping)
- `src/pages/admin/SchedulingCenterAdmin.jsx` (error message mapping)

---

## Revised Batch 2: Nice-to-Have (Post-Launch Optional)

### 6. Route Readiness Indicator (Simplified)
**Priority:** P2 - Nice-to-have
**Effort:** 1 hour
**Risk:** Low (read-only indicator)

**What to Do:**
- In `DispatchCenterAdmin.jsx`:
  - Show "Route Ready" indicator when:
    - Route exists (status = published OR draft)
    - Route has stops > 0
    - No route mismatches detected
  - Visual indicator: green badge "Route Ready" or checkmark
  - Tooltip: "Route exists and matches assigned jobs"

**Why This Works:**
- Just displays computed state
- No route lifecycle changes
- Gives dispatch confidence

**Files:**
- `src/pages/admin/DispatchCenterAdmin.jsx` (add readiness indicator)

---

### 7. Crew Route Context
**Priority:** P2 - Nice-to-have
**Effort:** 1 hour
**Risk:** Low (read-only display)

**What to Do:**
- In `CrewDashboard.jsx` "Today's Route" section:
  - Add route metadata:
    - "Route generated at [time]" (from route_run.created_at)
    - "Optimized route" badge if generation_method = 'optimized'
    - Route stop count: "8 stops"
  - Add route progress: "Stop 3 of 8" (if possible to compute)

**Why This Works:**
- Just displays existing route data
- No route logic changes
- Better crew context

**Files:**
- `src/pages/admin/CrewDashboard.jsx` (add route metadata display)

---

## Deferred Items (Not in Launch Batch)

### Deferred: Publish Route Workflow
**Reason:** Requires lifecycle redesign
**Complexity:** Medium-High
**Risk:** Medium (affects crew route access, status transitions)

**What Would Be Required:**
- New RPC `publish_route_run(p_route_run_id uuid)` OR direct status update
- UI changes to show publish button
- Potential crew route access rule changes (ensure crew only sees published)
- Status transition logic (draft → published)
- Validation before publish (ensure route has stops)

**Decision:** Defer to post-launch. Current system works (routes are visible to crew via `get_team_route_for_day()` which prefers published but shows draft if needed).

---

### Deferred: Draft/Published Lifecycle Redesign
**Reason:** Current system works, redesign not needed for launch
**Complexity:** High
**Risk:** High (affects multiple systems)

**What Would Be Required:**
- Rethink route status model
- Update crew route access rules
- Add status transition workflows
- Add route versioning (if needed)
- Update all route display logic

**Decision:** Defer. Current system is functional. Lifecycle improvements can be post-launch enhancement.

---

### Deferred: Crew-Only Published-Route Enforcement
**Reason:** Current system already handles this via `get_team_route_for_day()` preference
**Complexity:** Medium
**Risk:** Medium (may break existing crew access)

**What Would Be Required:**
- Ensure crew portal only calls `get_team_route_for_day()` (already does)
- Verify RPC prefers published (already does)
- Add explicit "crew cannot see drafts" rule (may be overkill)

**Decision:** Defer. Current RPC already prefers published routes. Crew access is working correctly.

---

## Exact Files Likely Involved

### Batch 1 Files:
1. `src/pages/admin/RoutePlanningAdmin.jsx`
   - Route status badge enhancement
   - Pre-generation validation
   - Better error messages

2. `src/pages/admin/DispatchCenterAdmin.jsx`
   - Route status panel enhancement
   - Route mismatch quick fix button

3. `src/pages/admin/SchedulingCenterAdmin.jsx`
   - Pre-generation validation (bulk)
   - Better error messages
   - Generation path guidance

### Batch 2 Files (Optional):
4. `src/pages/admin/CrewDashboard.jsx`
   - Route metadata display

---

## Smallest Safe Implementation Order

### Step 1: Route Status Clarity (Safest, First)
**Why First:** Read-only display changes, zero risk
**Effort:** 1 hour
**Files:** `RoutePlanningAdmin.jsx`, `DispatchCenterAdmin.jsx`

### Step 2: Generation Path Guidance (Safest, Second)
**Why Second:** Just help text, zero risk
**Effort:** 30 minutes
**Files:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`

### Step 3: Better Error Messages (Safe, Third)
**Why Third:** Error handling only, low risk
**Effort:** 1 hour
**Files:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`

### Step 4: Pre-Generation Validation (Safe, Fourth)
**Why Fourth:** Read-only checks, low risk
**Effort:** 2-3 hours
**Files:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`

### Step 5: Route Mismatch Quick Fix (Safe, Fifth)
**Why Fifth:** Uses existing RPC, low risk
**Effort:** 1 hour
**Files:** `DispatchCenterAdmin.jsx`

**Total Batch 1 Effort:** 5.5-6.5 hours

---

## Risk Notes

### Low Risk Items
- ✅ Route status clarity (read-only display)
- ✅ Generation path guidance (help text)
- ✅ Better error messages (error handling)
- ✅ Route readiness indicator (computed display)

### Medium Risk Items
- ⚠️ Pre-generation validation (read-only but adds new queries)
  - **Mitigation:** Validation queries are simple, no mutations
- ⚠️ Route mismatch quick fix (calls existing RPC)
  - **Mitigation:** Uses same RPC as Route Planning, proven safe

### High Risk Items (Deferred)
- ❌ Publish route workflow (status mutations, lifecycle changes)
- ❌ Draft/published lifecycle redesign (system-wide changes)
- ❌ Crew route access rule changes (may break existing access)

---

## Can Routing Be Made Launch-Ready Without Publish-Route?

**Answer: Yes, absolutely.**

**Reasoning:**
1. **Current System Works:** Routes are generated, stored, and visible to crew
2. **Status Already Exists:** Routes have draft/published status (just need clarity)
3. **Crew Access Works:** `get_team_route_for_day()` already prefers published routes
4. **Gaps Are UX, Not Functional:** The issues are clarity, not functionality

**What Makes It Launch-Ready:**
- ✅ Route status clearly explained (users understand draft vs published)
- ✅ Pre-generation validation (prevents issues)
- ✅ Route mismatch quick fix (easy resolution)
- ✅ Generation path guidance (reduces confusion)
- ✅ Better error messages (clear failures)

**What Can Wait:**
- ❌ Publish button (routes can be regenerated if needed)
- ❌ Explicit publish workflow (current implicit workflow works)
- ❌ Crew-only published enforcement (RPC already handles this)

---

## Smallest High-Confidence Polish Set

### Minimal Launch-Safe Set (3-4 hours):
1. **Route Status Clarity** (1 hour) - Show status with explanation
2. **Route Mismatch Quick Fix** (1 hour) - One-click regenerate
3. **Better Error Messages** (1 hour) - User-friendly failures
4. **Generation Path Guidance** (30 min) - Help text

**Result:** Routing is clearer, fixable, and understandable without lifecycle changes.

### Recommended Launch Set (5.5-6.5 hours):
Add to minimal set:
5. **Pre-Generation Validation** (2-3 hours) - Prevent issues before generation

**Result:** Routing is clear, validated, fixable, and prevents common issues.

---

## Recommended Next Build Prompt

**Suggested Prompt:**

```
Goal: Implement Phase C Batch 1 routing polish (launch-safe clarity improvements).

Context: We have a routing polish plan that focuses on clarity without lifecycle changes.

Tasks:
1. Add route status clarity to RoutePlanningAdmin and DispatchCenterAdmin
2. Add pre-generation validation to RoutePlanningAdmin and SchedulingCenterAdmin
3. Add route mismatch quick fix button to DispatchCenterAdmin
4. Add generation path guidance (help text) to both generation pages
5. Improve error messages with user-friendly explanations

Constraints:
- Do NOT add publish-route workflow
- Do NOT change route lifecycle
- Keep changes surgical and low-risk
- Preserve existing route generation behavior
```

---

## Summary

**Revised Batch 1 (Launch-Safe):**
1. Route status clarity (1 hour)
2. Pre-generation validation (2-3 hours)
3. Route mismatch quick fix (1 hour)
4. Generation path guidance (30 min)
5. Better error messages (1 hour)

**Total:** 5.5-6.5 hours

**Deferred:**
- Publish route workflow
- Draft/published lifecycle redesign
- Crew-only published enforcement

**Answer to Key Questions:**
- ✅ **Can routing be launch-ready without publish-route?** Yes, absolutely
- ✅ **Smallest high-confidence polish set?** 3-4 hours (status clarity + quick fix + errors + guidance)
- ✅ **Recommended set?** 5.5-6.5 hours (adds validation)

**Risk Level:** Low - All changes are display/validation improvements, no lifecycle mutations
