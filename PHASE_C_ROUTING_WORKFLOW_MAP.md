# Phase C: Routing & Dispatch Workflow Map

## Overview

This document maps the end-to-end routing and dispatch workflow from admin perspective (job assignment → route generation → dispatch) and crew perspective (route viewing → job execution).

---

## Admin Flow: Assigned Jobs → Route Generated → Dispatch Ready

### Step 1: Job Assignment
**Location:** Multiple places
- `DispatchCenterAdmin.jsx` - Unassigned Jobs panel
- `ScheduleAdmin.jsx` - Calendar drag-and-drop
- `JobIntelligenceAdmin.jsx` - Unassigned upcoming jobs
- `JobsAdmin.jsx` - Job detail/edit

**Action:** Assign `assigned_team_id` to job
**Result:** Job is now assigned to a team

**Current State:**
- ✅ Assignment works from multiple places
- ✅ Dispatch Center shows unassigned jobs clearly
- ✅ Assignment updates immediately in UI

---

### Step 2: Route Generation
**Location:** Two places

#### A) Route Planning (`RoutePlanningAdmin.jsx`)
- **Purpose:** Manual route generation for specific team + date
- **Workflow:**
  1. Select service date (defaults to today)
  2. Select team
  3. Click "Generate Route"
  4. Route created with `status = 'draft'`
  5. Route displayed with stops list and map preview

**Current State:**
- ✅ Generation works
- ✅ Route preview shows stops in order
- ✅ Map preview available
- ❌ No pre-generation validation
- ❌ No publish action visible
- ❌ Status shown but meaning unclear

#### B) Scheduling Center (`SchedulingCenterAdmin.jsx`)
- **Purpose:** Bulk route generation for today's teams
- **Workflow:**
  1. View "Today's Teams Requiring Routes" section
  2. Click "Generate Today's Draft Routes"
  3. System generates routes for all teams with assigned jobs (that don't have routes)
  4. Shows summary: "X routes created, Y skipped"

**Current State:**
- ✅ Bulk generation works
- ✅ Skips teams that already have routes
- ✅ Shows summary feedback
- ❌ No validation before bulk generation
- ❌ All routes created as 'draft' (no publish step)

---

### Step 3: Route Review & Publishing
**Location:** `RoutePlanningAdmin.jsx` (currently missing)

**Expected Workflow:**
1. Review generated route (stops, order, map)
2. Make adjustments if needed (future: reorder stops)
3. Publish route to make it final
4. Route status changes: `draft` → `published`

**Current State:**
- ❌ **Missing:** No publish action
- ❌ Routes stay in 'draft' status
- ❌ No clear "ready for dispatch" state

---

### Step 4: Dispatch Readiness Check
**Location:** `DispatchCenterAdmin.jsx`

**Current Workflow:**
1. View "Route Status" panel
2. See per-team status:
   - Route exists? (yes/no)
   - Number of stops
3. View "Dispatch Warnings" panel
4. See warnings for:
   - Unassigned jobs
   - Teams with jobs but no route
   - Route stop mismatches
   - Idle teams
   - Overloaded teams

**Current State:**
- ✅ Route status shown per team
- ✅ Warnings detected and displayed
- ❌ No clear "ready for dispatch" indicator
- ❌ Route mismatch warnings have no quick fix
- ❌ Status doesn't distinguish draft vs published

---

### Step 5: Crew Notification (Implicit)
**Location:** Crew portal automatically shows route when published

**Current Workflow:**
- Crew Dashboard loads jobs with `route_order`
- Jobs sorted by `route_order` in "Today's Route" section
- Crew sees stops in planned order

**Current State:**
- ✅ Crew sees route order
- ✅ Route displayed clearly
- ❌ No indication if route is draft vs published
- ❌ No route metadata (generation time, method)

---

## Crew Flow: Route Exists → Route Viewed → Jobs Executed

### Step 1: Route Visibility
**Location:** `CrewDashboard.jsx` - "Today's Route" section

**Current Workflow:**
1. Crew logs into crew portal
2. Dashboard shows "Today's Route" section
3. Jobs displayed in route order (sorted by `route_order`)
4. Each job shows stop number

**Current State:**
- ✅ Route order visible
- ✅ Stop numbers shown
- ✅ Jobs clickable to view details
- ❌ No route metadata (when generated, status, method)
- ❌ No indication if route is draft vs final

---

### Step 2: Route Execution
**Location:** `CrewDashboard.jsx` → `CrewJobDetail.jsx`

**Current Workflow:**
1. Crew clicks job from route
2. Views job details
3. Completes job (photos, status, payment)
4. Returns to dashboard
5. Next job in route order is highlighted

**Current State:**
- ✅ Jobs accessible from route
- ✅ Job completion workflow works
- ❌ No "next stop" navigation
- ❌ No route progress indicator (stop 3 of 8)

---

### Step 3: Route Completion
**Location:** Implicit (all jobs completed)

**Current Workflow:**
- As jobs are completed, route naturally finishes
- No explicit "route complete" state

**Current State:**
- ✅ Jobs can be completed
- ❌ No route completion indicator
- ❌ No route progress tracking

---

## Where Route State is Shown Today

### Admin Views

#### 1. Dispatch Center (`DispatchCenterAdmin.jsx`)
**Route Status Panel:**
- Shows per-team: route exists? (yes/no badge)
- Shows stop count per team
- **Gap:** Doesn't show route status (draft/published)
- **Gap:** Doesn't show route generation time

**Dispatch Warnings:**
- Detects route mismatches
- Shows warning: "Team X has 5 assigned jobs but only 3 route stops"
- **Gap:** No quick fix button

#### 2. Route Planning (`RoutePlanningAdmin.jsx`)
**Route Details:**
- Shows route status badge (draft/published/archived)
- Shows service date, team, total stops, generation method
- Shows stops list with addresses
- Shows map preview
- **Gap:** Status meaning not explained
- **Gap:** No publish action visible

#### 3. Scheduling Center (`SchedulingCenterAdmin.jsx`)
**Today's Teams Requiring Routes:**
- Shows teams with assigned jobs
- Shows whether route exists (yes/no badge)
- Shows assigned jobs count
- **Gap:** Doesn't show route status
- **Gap:** Bulk generation creates drafts only

#### 4. Job Intelligence (`JobIntelligenceAdmin.jsx`)
**Route Mismatch Insight:**
- Detects route mismatches
- Shows: "Team X has 5 assigned jobs but only 3 route stops"
- **Gap:** No quick fix action

---

### Crew Views

#### 1. Crew Dashboard (`CrewDashboard.jsx`)
**Today's Route Section:**
- Shows jobs sorted by `route_order`
- Shows stop numbers
- Shows customer name, address, service details
- **Gap:** No route metadata (generation time, status, method)
- **Gap:** No route progress (stop 3 of 8)

#### 2. Crew Portal (`CrewPortal.jsx`)
**Jobs List:**
- Jobs sorted by `route_order` when available
- **Gap:** Route context not explicit

---

## Where Users May Get Confused

### Confusion Point 1: Route Status Meaning
**Location:** `RoutePlanningAdmin.jsx`
**Issue:** Status badge shows "draft" or "published" but meaning unclear
**User Question:** "What does 'draft' mean? Is the route ready for crew?"
**Impact:** Admins may not know when route is "done"

**Fix Needed:** Clear status explanation + publish action

---

### Confusion Point 2: Multiple Generation Paths
**Location:** Route Planning vs Scheduling Center
**Issue:** Two places can generate routes, unclear when to use which
**User Question:** "Should I use Route Planning or Scheduling Center?"
**Impact:** Admins may generate routes from wrong place or duplicate work

**Fix Needed:** Clear guidance on when to use each tool

---

### Confusion Point 3: Route Mismatch Resolution
**Location:** `DispatchCenterAdmin.jsx` warnings
**Issue:** Warning shows mismatch but no obvious fix
**User Question:** "How do I fix this route mismatch?"
**Impact:** Admins see problem but don't know how to resolve

**Fix Needed:** "Regenerate Route" button in warning

---

### Confusion Point 4: Route Readiness
**Location:** `DispatchCenterAdmin.jsx` Route Status panel
**Issue:** Shows "route exists" but not if it's ready
**User Question:** "Is this route ready for crew to see?"
**Impact:** Dispatch may send crew to routes that aren't finalized

**Fix Needed:** "Ready for Dispatch" indicator when route is published

---

### Confusion Point 5: Pre-Generation Validation
**Location:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`
**Issue:** No validation before generation
**User Question:** "Will this route work? Do all jobs have addresses?"
**Impact:** Routes generated with missing data, suboptimal results

**Fix Needed:** Validation summary before generation

---

### Confusion Point 6: Crew Route Context
**Location:** `CrewDashboard.jsx`
**Issue:** Crew sees route order but not route metadata
**User Question:** "Is this route optimized? When was it generated?"
**Impact:** Crew may not trust route order or understand it's optimized

**Fix Needed:** Route metadata in crew dashboard

---

### Confusion Point 7: Route Generation Failure
**Location:** `RoutePlanningAdmin.jsx`, `SchedulingCenterAdmin.jsx`
**Issue:** Errors may be technical or unclear
**User Question:** "Why did route generation fail?"
**Impact:** Admins don't know how to fix generation failures

**Fix Needed:** User-friendly error messages with actionable guidance

---

## Workflow Summary

### Current Admin Workflow (As-Is)
1. Assign jobs to teams (multiple places)
2. Generate routes (Route Planning or Scheduling Center)
3. Review route in Route Planning (optional)
4. Check Dispatch Center for warnings
5. **Gap:** No clear "publish" step
6. **Gap:** No clear "ready for dispatch" confirmation
7. Crew sees route (implicitly when published or draft)

### Ideal Admin Workflow (Should-Be)
1. Assign jobs to teams
2. **Validate:** Check jobs have addresses before generation
3. Generate routes (with validation summary)
4. Review route in Route Planning
5. **Publish route** (make it final)
6. **Confirm:** Dispatch Center shows "Ready for Dispatch"
7. Crew sees published route

### Current Crew Workflow (As-Is)
1. Log into crew portal
2. See "Today's Route" section
3. Jobs sorted by route order
4. Click job to view details
5. Complete job
6. Return to route, see next job
7. **Gap:** No route progress indicator
8. **Gap:** No route metadata

### Ideal Crew Workflow (Should-Be)
1. Log into crew portal
2. See "Today's Route" section with metadata:
   - "Optimized route generated at 8:00 AM"
   - "Stop 3 of 8"
3. Jobs sorted by route order
4. Click job to view details
5. Complete job
6. See "Next Stop" navigation
7. Route progress updates automatically

---

## Data Flow

### Route Generation Flow
```
Admin selects team + date
  ↓
System queries: jobs WHERE assigned_team_id = team AND service_date = date
  ↓
System checks: jobs have addresses? coordinates?
  ↓
System creates: route_run (status = 'draft')
  ↓
System creates: route_stops (one per job, with stop_order)
  ↓
System optimizes: nearest-neighbor if coordinates available
  ↓
Route displayed in Route Planning
```

### Route Publishing Flow (Currently Missing)
```
Admin reviews route in Route Planning
  ↓
Admin clicks "Publish Route"
  ↓
System updates: route_run.status = 'published'
  ↓
Route now visible to crew (or clearly marked as published)
```

### Crew Route Viewing Flow
```
Crew logs into portal
  ↓
System queries: jobs WHERE assigned_team_id IN (crew's teams) AND service_date = today
  ↓
System includes: route_order from jobs table
  ↓
System sorts: by route_order ASC
  ↓
Crew sees: "Today's Route" with jobs in order
```

---

## Route State Transitions

### Current States
- **Draft:** Route generated but not finalized
- **Published:** Route finalized (preferred by `get_team_route_for_day()`)
- **Archived:** Past route (not actively used)

### Missing Transitions
- **Draft → Published:** No UI action
- **Published → Archived:** No UI action (automatic for past dates?)

### Recommended v1 States
- **Draft:** Can be regenerated, not shown to crew (or shown with draft indicator)
- **Published:** Final, shown to crew, should not be regenerated

---

## Summary

**Admin Workflow Gaps:**
1. No publish action (routes stay draft)
2. No validation before generation
3. Route mismatch warnings have no fix
4. Route readiness unclear
5. Multiple generation paths (confusion)

**Crew Workflow Gaps:**
1. No route metadata (generation time, method)
2. No route progress indicator
3. No "next stop" navigation
4. Route status not shown (draft vs published)

**Key Confusion Points:**
1. Route status meaning unclear
2. When to use Route Planning vs Scheduling Center
3. How to fix route mismatches
4. When route is "ready"
5. What happens if jobs missing addresses

**Recommended Fixes:**
- Add publish action (Batch 1)
- Add pre-generation validation (Batch 2)
- Add route mismatch quick fix (Batch 2)
- Add route readiness indicator (Batch 1)
- Add route metadata to crew view (Batch 3)
