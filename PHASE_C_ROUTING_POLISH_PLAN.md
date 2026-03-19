# Phase C: Routing & Dispatch Polish Plan

## Executive Summary

The routing and dispatch workflow is **functionally complete** but has several UX gaps that reduce dispatch confidence and crew clarity. The core infrastructure (route generation, route storage, crew visibility) works, but the workflow lacks clear status indicators, validation, and "next action" guidance.

**Current State:**
- ✅ Route generation works (nearest-neighbor optimization)
- ✅ Routes are stored and retrievable
- ✅ Crew can see route order
- ✅ Dispatch warnings exist
- ❌ Route status unclear (draft vs published)
- ❌ No pre-generation validation
- ❌ Multiple generation paths create confusion
- ❌ Route readiness not clearly communicated
- ❌ Route mismatch fixes not obvious

**Recommendation:** Implement a small polish batch (5-7 improvements) to make routing feel launch-ready. The system works but needs clarity improvements.

---

## Current Routing Strengths

### 1. Solid Technical Foundation
- **Route Generation RPC:** `generate_team_route_for_day()` works well
  - Nearest-neighbor optimization when coordinates available
  - Falls back gracefully when coordinates missing
  - Multi-tenant safe with proper auth checks
  - Creates `route_runs` and `route_stops` correctly

### 2. Route Retrieval Works
- **Route Retrieval RPC:** `get_team_route_for_day()` is robust
  - Role-based access (admin/manager/dispatcher/crew)
  - Prefers published routes, falls back to latest draft
  - Returns route header + stops in order

### 3. Crew Route Visibility
- **Crew Dashboard:** Shows route stops sorted by `route_order`
- **Route Order Persistence:** Jobs have `route_order` field that persists
- **Visual Route Display:** Stop numbers shown clearly in crew portal

### 4. Dispatch Warnings
- **Dispatch Center:** Detects and shows:
  - Unassigned jobs
  - Teams with jobs but no route
  - Route stop mismatches
  - Idle teams
  - Overloaded teams

### 5. Multiple Generation Points
- **Route Planning:** Manual generation for specific team/date
- **Scheduling Center:** Bulk generation for today's teams
- Both paths work correctly

---

## Key Routing UX Gaps

### Gap 1: Route Status Ambiguity
**Issue:** Routes are created in 'draft' status, but there's no clear "publish" action or indication of what status means.

**Impact:**
- Admins don't know if route is "ready" for crew
- No clear workflow: draft → review → publish
- Crew may see draft routes that aren't finalized

**Current Behavior:**
- Routes created with `status = 'draft'`
- `get_team_route_for_day()` prefers published but shows draft if no published exists
- No UI to publish routes

**Severity:** P1 - Launch blocker for clarity

---

### Gap 2: No Pre-Generation Validation
**Issue:** Route generation can fail silently or create routes with missing addresses.

**Impact:**
- Routes generated for jobs without addresses (can't optimize)
- No warning before generation about missing data
- Generation fails but error message may be unclear

**Current Behavior:**
- `generate_team_route_for_day()` filters out jobs without addresses (implicitly)
- No pre-check UI to warn: "3 jobs missing addresses, route may be suboptimal"
- No validation summary before generation

**Severity:** P1 - High-value polish

---

### Gap 3: Duplicate Generation Paths
**Issue:** Routes can be generated from two places (Route Planning, Scheduling Center) with no clear guidance on when to use which.

**Impact:**
- Admins may regenerate routes accidentally
- No clear "single source of truth" for route generation
- Confusion about which tool to use

**Current Behavior:**
- Route Planning: Manual, team+date specific
- Scheduling Center: Bulk, today's teams only
- Both can generate for same team/date (may create duplicate drafts)

**Severity:** P2 - UX clarity issue

---

### Gap 4: Route Mismatch Fix Not Obvious
**Issue:** Dispatch Center shows route mismatch warnings but no clear "fix" action.

**Impact:**
- Admins see warning but don't know how to resolve
- Route mismatch = assigned jobs count ≠ route stops count
- No one-click "regenerate route" from warning

**Current Behavior:**
- Warning shown: "Team X has 5 assigned jobs but only 3 route stops"
- Admin must navigate to Route Planning to regenerate
- No direct action from warning

**Severity:** P1 - High-value polish

---

### Gap 5: Route Readiness Unclear
**Issue:** No clear indication when a route is "ready" for dispatch/crew viewing.

**Impact:**
- Dispatch doesn't know if route is final
- Crew may see draft routes that change
- No confidence indicator

**Current Behavior:**
- Routes show status badge (draft/published/archived)
- But no clear "ready for dispatch" state
- No workflow: draft → review → publish

**Severity:** P1 - Launch blocker for clarity

---

### Gap 6: Route Generation Failure States
**Issue:** When route generation fails (no routable jobs, missing addresses), error messages may be unclear.

**Impact:**
- Admins don't understand why generation failed
- No guidance on how to fix
- Silent failures possible

**Current Behavior:**
- RPC returns empty result if no jobs
- Error messages exist but may be technical
- No user-friendly failure explanations

**Severity:** P2 - UX polish

---

### Gap 7: Crew Route Context Missing
**Issue:** Crew sees route stops but may not understand they're from a "route" vs just sorted jobs.

**Impact:**
- Crew may not realize route is optimized
- No indication if route is draft vs final
- Missing context about route source

**Current Behavior:**
- Crew Dashboard shows "Today's Route" section
- Jobs sorted by `route_order`
- But no route metadata (status, generation method, etc.)

**Severity:** P2 - UX polish

---

## Prioritized Polish Backlog

### Must Fix Before Launch (P0/P1)

#### 1. Route Status Clarity + Publish Action
**Priority:** P0 - Launch blocker
**Effort:** Medium
**Files:** `RoutePlanningAdmin.jsx`, possibly new RPC for publish
**Fix:**
- Add "Publish Route" button when route is draft
- Show clear status: Draft / Published / Archived
- Add status badge with tooltip explaining meaning
- Ensure crew only sees published routes (or clear draft indicator)

#### 2. Pre-Generation Validation
**Priority:** P1 - High-value
**Effort:** Low-Medium
**Files:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`
**Fix:**
- Before generation, show validation summary:
  - "5 jobs ready for routing"
  - "2 jobs missing addresses (will use fallback ordering)"
  - "1 job has no assigned team"
- Add "Generate Route" button that shows validation first
- Or show validation inline before generation

#### 3. Route Mismatch Quick Fix
**Priority:** P1 - High-value
**Effort:** Low
**Files:** `DispatchCenterAdmin.jsx`
**Fix:**
- Add "Regenerate Route" button next to route mismatch warnings
- Button calls `generate_team_route_for_day()` for that team
- Show loading state and success/error feedback

#### 4. Route Readiness Indicator
**Priority:** P1 - High-value
**Effort:** Low
**Files:** `DispatchCenterAdmin.jsx`, `RoutePlanningAdmin.jsx`
**Fix:**
- Add "Ready for Dispatch" indicator when route is published
- Or add "Route Status" section showing: Draft / Published / Ready
- Clear visual distinction between draft and final routes

---

### High-Value Polish (P1/P2)

#### 5. Generation Path Guidance
**Priority:** P2 - UX clarity
**Effort:** Low
**Files:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`
**Fix:**
- Add tooltips/help text:
  - Route Planning: "Generate routes for specific teams and dates"
  - Scheduling Center: "Bulk generate routes for all teams with jobs today"
- Or add inline guidance: "Use this for bulk generation, use Route Planning for specific dates"

#### 6. Better Failure Messages
**Priority:** P2 - UX polish
**Effort:** Low
**Files:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`
**Fix:**
- Map RPC errors to user-friendly messages:
  - "No routable jobs" → "No jobs with addresses found. Add addresses to jobs to enable route optimization."
  - "Team not found" → "Team selection invalid. Please refresh and try again."
- Add actionable guidance in error states

#### 7. Crew Route Context
**Priority:** P2 - UX polish
**Effort:** Low
**Files:** `CrewDashboard.jsx`
**Fix:**
- Add route metadata to "Today's Route" section:
  - "Route generated at [time]"
  - "Optimized route" badge if generation_method = 'optimized'
  - "Draft route" indicator if status = 'draft' (if crew can see drafts)

---

### Future Enhancement (Post-Launch)

#### 8. Route Preview Before Generation
**Priority:** Future
**Effort:** High
**Description:** Show preview of route stops before generating, allow reordering

#### 9. Route Comparison
**Priority:** Future
**Effort:** High
**Description:** Compare draft vs published routes, show differences

#### 10. Route Templates
**Priority:** Future
**Effort:** High
**Description:** Save route patterns, apply to similar days

---

## Smallest Safe Implementation Sequence

### Batch 1: Critical Clarity (Must Have)
**Goal:** Make route status and readiness clear

1. **Route Status Badge Enhancement** (30 min)
   - Update `RoutePlanningAdmin.jsx` to show status badge with tooltip
   - Add "Draft" / "Published" / "Archived" labels with explanations
   - Ensure status is visible and clear

2. **Publish Route Action** (2-3 hours)
   - Add RPC `publish_route_run(p_route_run_id uuid)` or update existing route_run status
   - Add "Publish Route" button in `RoutePlanningAdmin.jsx`
   - Show button only when route is draft
   - Update route status after publish

3. **Route Readiness Indicator** (1 hour)
   - Add "Ready for Dispatch" indicator in `DispatchCenterAdmin.jsx`
   - Show when route is published for today
   - Visual distinction (green badge, checkmark icon)

**Result:** Routes have clear status, publish workflow exists, dispatch knows when routes are ready

---

### Batch 2: Validation & Quick Fixes (High Value)
**Goal:** Prevent issues and make fixes easy

4. **Pre-Generation Validation** (2-3 hours)
   - Add validation function that checks:
     - Jobs with assigned_team_id for selected team/date
     - Jobs with addresses (count missing)
     - Jobs with coordinates (count missing)
   - Show validation summary before generation
   - Add "Generate Anyway" vs "Cancel" options

5. **Route Mismatch Quick Fix** (1 hour)
   - Add "Regenerate Route" button in `DispatchCenterAdmin.jsx` route mismatch warnings
   - Button calls `generate_team_route_for_day()` for that team
   - Show loading and success feedback

**Result:** Admins see validation before generation, can fix mismatches with one click

---

### Batch 3: UX Polish (Nice to Have)
**Goal:** Improve overall experience

6. **Generation Path Guidance** (30 min)
   - Add help text/tooltips to Route Planning and Scheduling Center
   - Explain when to use each tool

7. **Better Failure Messages** (1 hour)
   - Map RPC errors to user-friendly messages
   - Add actionable guidance

8. **Crew Route Context** (1 hour)
   - Add route metadata to Crew Dashboard "Today's Route" section
   - Show generation time, method, status

**Result:** Better guidance, clearer errors, crew has more context

---

## Implementation Notes

### Route Status Workflow
**Recommended:** Simple two-state model for v1
- **Draft:** Route is generated but not finalized (can be regenerated)
- **Published:** Route is finalized and visible to crew (should not be regenerated)

**Future:** Could add "Archived" for past routes, but not needed for launch

### Publish Route Implementation
**Option A:** Update route_run.status directly
```sql
UPDATE route_runs SET status = 'published' WHERE id = route_run_id
```

**Option B:** Create RPC `publish_route_run(p_route_run_id uuid)`
- More explicit
- Can add validation (e.g., ensure route has stops)
- Can add audit logging

**Recommendation:** Option A for v1 (simpler), Option B if we need validation/logging

### Pre-Generation Validation
**Implementation:**
- Before calling `generate_team_route_for_day()`, query jobs for team/date
- Count: total jobs, jobs with addresses, jobs with coordinates
- Show summary: "5 jobs ready, 2 missing addresses, 0 missing coordinates"
- Allow generation anyway (with warning) or cancel

### Route Mismatch Fix
**Implementation:**
- In `DispatchCenterAdmin.jsx`, add button to route mismatch warning
- Button calls `generate_team_route_for_day(today, teamId)`
- Show loading state, refresh route status after
- Simple and effective

---

## Risk Assessment

### Low Risk Changes
- Route status badge enhancement (read-only display)
- Generation path guidance (help text only)
- Better failure messages (error handling only)
- Crew route context (read-only display)

### Medium Risk Changes
- Publish route action (mutation, but simple status update)
- Pre-generation validation (read-only checks before generation)
- Route mismatch quick fix (calls existing RPC)

### Considerations
- **Route Status Changes:** Ensure crew portal respects published-only rule (or shows draft indicator)
- **Publish Action:** Ensure only one published route per team/date (archive or prevent duplicate publishes)
- **Validation:** Don't block generation, just inform (allow "generate anyway")

---

## Summary

**Routing Status:** Functionally complete, needs clarity polish

**Top 5 Gaps:**
1. Route status ambiguity (draft vs published)
2. No pre-generation validation
3. Route mismatch fix not obvious
4. Route readiness unclear
5. Duplicate generation paths

**Recommended First Step:** Batch 1 (Route Status + Publish Action)

**Launch Readiness:** Needs Batch 1 + Batch 2 for confidence. Batch 3 is nice-to-have polish.

**Estimated Effort:**
- Batch 1: 4-5 hours
- Batch 2: 3-4 hours
- Batch 3: 2-3 hours
- **Total:** 9-12 hours for full polish

**Recommendation:** Implement Batch 1 + Batch 2 before launch. Batch 3 can be post-launch polish.
