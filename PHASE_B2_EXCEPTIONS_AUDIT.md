# Phase B.2 Exceptions Queue Audit
## Operational Exceptions Workflow - Read-Only Audit

**Date**: 2024-03-XX  
**Scope**: Operational exceptions surfacing across admin experience  
**Status**: ✅ **AUDIT COMPLETE** - Ready for implementation planning

---

## Executive Summary

The product currently has **significant fragmentation** in how operational exceptions are surfaced. Exceptions appear across **8+ different admin pages** with **overlapping but inconsistent** presentation. There is **no unified "work the queue" path**, and operators must navigate between multiple pages to resolve related issues.

**Top 5 Issues:**
1. **No single exceptions queue** - Exceptions scattered across Dispatch, Intelligence, Schedule, Financial, and Revenue pages
2. **Duplication without consolidation** - Same exception types (unassigned jobs, route mismatches) appear in multiple places with different actions
3. **Weak prioritization** - Urgent exceptions (unassigned today) mixed with passive insights (recurring gaps)
4. **Inconsistent actionability** - Some exception cards are actionable, others are informational only
5. **Multi-page resolution flows** - Resolving one exception often requires navigating to 2-3 different pages

---

## A. Exception Inventory

### 1. Unassigned Jobs

**Where it appears:**
- **DispatchCenterAdmin** (`/admin/operations?tab=today`)
  - Section: "Unassigned Jobs" panel
  - Scope: Today's jobs only (`service_date = today`)
  - Actionable: ✅ Yes - Inline team assignment dropdown
  - Resolution: Direct assignment on page

- **JobIntelligenceAdmin** (`/admin/operations?tab=intelligence`)
  - Section: "Unassigned Upcoming Jobs" card
  - Scope: Next 7 days (`service_date >= today AND service_date <= next7Days`)
  - Actionable: ✅ Yes - Inline team assignment dropdown
  - Resolution: Direct assignment on page

- **SchedulingCenterAdmin** (`/admin/operations?tab=automation`)
  - Section: "Scheduling Gaps" card (type: 'unassigned')
  - Scope: Next 7 days
  - Actionable: ❌ No - Informational only
  - Resolution: Navigate to Schedule or Jobs page

- **AdminDashboard** (`/admin`)
  - Section: KPI card "Unassigned Jobs"
  - Scope: This week
  - Actionable: ✅ Yes - Links to `/admin/jobs?quickFilter=unassigned`
  - Resolution: Navigate to Jobs page

**Fragmentation:** Same exception type appears in 4 places with different scopes and actionability.

---

### 2. Missing Customer Addresses

**Where it appears:**
- **JobIntelligenceAdmin** (`/admin/operations?tab=intelligence`)
  - Section: "Missing Customer Address" card
  - Scope: All jobs in next 7 days
  - Actionable: ✅ Yes - "Update Address" button links to `/admin/customers`
  - Resolution: Navigate to Customers page, find customer, update address

**Fragmentation:** Only appears in one place, but resolution requires navigation.

---

### 3. Route Mismatches

**Where it appears:**
- **DispatchCenterAdmin** (`/admin/operations?tab=today`)
  - Section: "Dispatch Warnings" card (type: 'route_mismatch')
  - Scope: Today only
  - Actionable: ✅ Yes - "Regenerate" button per team
  - Resolution: Direct route regeneration on page

- **JobIntelligenceAdmin** (`/admin/operations?tab=intelligence`)
  - Section: "Route Mismatch" card
  - Scope: Today only
  - Actionable: ❌ No - Informational only
  - Resolution: Navigate to Dispatch Center or Route Planning

**Fragmentation:** Same exception appears in 2 places, one actionable and one informational.

---

### 4. Jobs Assigned But Not Routed

**Where it appears:**
- **DispatchCenterAdmin** (`/admin/operations?tab=today`)
  - Section: "Dispatch Warnings" card (type: 'no_route')
  - Scope: Today only
  - Actionable: ❌ No - Informational only
  - Resolution: Navigate to Route Planning or Scheduling Center

- **JobIntelligenceAdmin** (`/admin/operations?tab=intelligence`)
  - Section: "Jobs Assigned But Not Routed Today" card
  - Scope: Today only
  - Actionable: ✅ Yes - "Plan Route" button links to `/admin/operations?tab=routes`
  - Resolution: Navigate to Routes tab

- **SchedulingCenterAdmin** (`/admin/operations?tab=automation`)
  - Section: "Today's Teams Requiring Routes" card
  - Scope: Today only
  - Actionable: ✅ Yes - "Generate Today's Draft Routes" bulk action button
  - Resolution: Bulk route generation on page

**Fragmentation:** Same exception appears in 3 places with different actionability and resolution paths.

---

### 5. Schedule Requests

**Where it appears:**
- **ScheduleAdmin** (`/admin/operations?tab=schedule&scheduleTab=requests`)
  - Section: "Schedule Requests" tab (full table)
  - Scope: All pending schedule requests
  - Actionable: ✅ Yes - Approve/Decline buttons per request
  - Resolution: Direct approval/decline on page

**Fragmentation:** Well-contained in one place, but requires navigating to Schedule tab → Requests sub-tab.

---

### 6. Jobs Needing Scheduling

**Where it appears:**
- **ScheduleAdmin** (`/admin/operations?tab=schedule&scheduleTab=needs-scheduling`)
  - Section: "Needs Scheduling" tab (full table)
  - Scope: Jobs with `service_date IS NULL` and status not Completed/Canceled
  - Actionable: ✅ Yes - Schedule date modal per job
  - Resolution: Direct scheduling on page

- **RevenueHub** (`/admin/revenue-hub`)
  - Section: "Queue 2: Jobs Needing Scheduling" card
  - Scope: Same as ScheduleAdmin
  - Actionable: ✅ Yes - "Schedule" button per job
  - Resolution: Navigate to job detail or schedule modal

**Fragmentation:** Same exception appears in 2 places with different UI patterns.

---

### 7. Unpaid Jobs

**Where it appears:**
- **FinancialControlCenterAdmin** (`/admin/financial-control-center`)
  - Section: "Unpaid Jobs" card
  - Scope: All jobs with `job_cost > 0` and `paidTotal = 0`
  - Actionable: ✅ Yes - "Collect Payment" button links to `/admin/jobs?openJobId={id}&action=collect_payment`
  - Resolution: Navigate to Jobs page with payment action

- **RevenueHub** (`/admin/revenue-hub`)
  - Section: "Queue 4: Invoices With Balance Due" card
  - Scope: Jobs with invoices and `balanceDue > 0`
  - Actionable: ✅ Yes - Payment collection actions per job
  - Resolution: Various actions (collect payment, send invoice, etc.)

- **PaymentsAdmin** (`/admin/payments`)
  - Section: "Unpaid Total" KPI card
  - Scope: Company-wide unpaid total
  - Actionable: ❌ No - Informational only
  - Resolution: Navigate to Revenue Hub or Financial Control Center

**Fragmentation:** Same exception type appears in 3 places with different scopes and actionability.

---

### 8. Partially Paid Jobs

**Where it appears:**
- **FinancialControlCenterAdmin** (`/admin/financial-control-center`)
  - Section: "Partially Paid Jobs" card
  - Scope: Jobs with `0 < paidTotal < job_cost`
  - Actionable: ✅ Yes - "View Payment History" button links to `/admin/jobs?openJobId={id}&action=collect_payment`
  - Resolution: Navigate to Jobs page with payment action

**Fragmentation:** Only appears in one place, but resolution requires navigation.

---

### 9. Completed But Unpaid Jobs

**Where it appears:**
- **FinancialControlCenterAdmin** (`/admin/financial-control-center`)
  - Section: "Completed But Unpaid" card
  - Scope: Completed jobs with `paidTotal < job_cost`
  - Actionable: ✅ Yes - "Collect Payment" button links to `/admin/jobs?openJobId={id}&action=collect_payment`
  - Resolution: Navigate to Jobs page with payment action

**Fragmentation:** Only appears in one place, but resolution requires navigation.

---

### 10. Payment Risk Alerts

**Where it appears:**
- **FinancialControlCenterAdmin** (`/admin/financial-control-center`)
  - Section: "Payment Risk / Attention" card
  - Types:
    - High-balance unpaid jobs (> $500)
    - Completed jobs with no payment
    - Customers with 3+ unpaid jobs
  - Actionable: ✅ Yes - Links to Revenue Hub or Customers page
  - Resolution: Navigate to Revenue Hub or Customers page

**Fragmentation:** Only appears in one place, but resolution requires navigation to other pages.

---

### 11. Recurring Schedule Gaps

**Where it appears:**
- **SchedulingCenterAdmin** (`/admin/operations?tab=automation`)
  - Section: "Scheduling Gaps" card (type: 'missing_job')
  - Scope: Active recurring schedules with no generated job for next expected date
  - Actionable: ❌ No - Informational only
  - Resolution: Navigate to Scheduling Center and generate jobs

- **JobIntelligenceAdmin** (`/admin/operations?tab=intelligence`)
  - Section: "Recurring Schedule Attention" card
  - Scope: Same as SchedulingCenterAdmin
  - Actionable: ✅ Yes - "View Scheduling Center" button links to `/admin/operations?tab=automation`
  - Resolution: Navigate to Automation tab

**Fragmentation:** Same exception appears in 2 places, one actionable and one informational.

---

### 12. Incomplete Operational Data

**Where it appears:**
- **JobIntelligenceAdmin** (`/admin/operations?tab=intelligence`)
  - Section: "Incomplete Operational Data" card
  - Scope: Jobs missing `customer_id` or `service_date`
  - Actionable: ✅ Yes - "View Jobs" button links to `/admin/jobs`
  - Resolution: Navigate to Jobs page

**Fragmentation:** Only appears in one place, but resolution requires navigation.

---

### 13. Idle Teams (No Jobs Assigned)

**Where it appears:**
- **DispatchCenterAdmin** (`/admin/operations?tab=today`)
  - Section: "Dispatch Warnings" card (type: 'idle')
  - Scope: Today only
  - Actionable: ❌ No - Informational only
  - Resolution: None (informational)

**Fragmentation:** Only appears in one place, informational only.

---

### 14. Overloaded Teams (8+ Jobs)

**Where it appears:**
- **DispatchCenterAdmin** (`/admin/operations?tab=today`)
  - Section: "Dispatch Warnings" card (type: 'overloaded')
  - Scope: Today only
  - Actionable: ❌ No - Informational only
  - Resolution: None (informational)

**Fragmentation:** Only appears in one place, informational only.

---

## B. Fragmentation Matrix

| Exception Type | Dispatch | Intelligence | Schedule | Scheduling | Financial | Revenue | Payments | Dashboard |
|----------------|----------|-------------|----------|------------|-----------|---------|----------|-----------|
| Unassigned Jobs (Today) | ✅ Actionable | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Link |
| Unassigned Jobs (Upcoming) | ❌ | ✅ Actionable | ❌ | ⚠️ Info | ❌ | ❌ | ❌ | ❌ |
| Missing Addresses | ❌ | ✅ Actionable | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Route Mismatches | ✅ Actionable | ⚠️ Info | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Jobs Not Routed | ⚠️ Info | ✅ Actionable | ❌ | ✅ Bulk | ❌ | ❌ | ❌ | ❌ |
| Schedule Requests | ❌ | ❌ | ✅ Actionable | ❌ | ❌ | ❌ | ❌ | ❌ |
| Needs Scheduling | ❌ | ❌ | ✅ Actionable | ❌ | ❌ | ✅ Actionable | ❌ | ❌ |
| Unpaid Jobs | ❌ | ❌ | ❌ | ❌ | ✅ Actionable | ✅ Actionable | ⚠️ Info | ❌ |
| Partially Paid | ❌ | ❌ | ❌ | ❌ | ✅ Actionable | ❌ | ❌ | ❌ |
| Completed Unpaid | ❌ | ❌ | ❌ | ❌ | ✅ Actionable | ❌ | ❌ | ❌ |
| Payment Risk | ❌ | ❌ | ❌ | ❌ | ✅ Actionable | ❌ | ❌ | ❌ |
| Recurring Gaps | ❌ | ✅ Actionable | ❌ | ⚠️ Info | ❌ | ❌ | ❌ | ❌ |
| Incomplete Data | ❌ | ✅ Actionable | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Idle Teams | ⚠️ Info | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Overloaded Teams | ⚠️ Info | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ Actionable = Exception is actionable on that page
- ⚠️ Info = Exception is shown but informational only
- ❌ = Exception does not appear on that page

**Key Observations:**
- **Unassigned Jobs** appears in 4 places with different scopes
- **Route Mismatches** appears in 2 places, one actionable and one informational
- **Jobs Not Routed** appears in 3 places with different actionability
- **Needs Scheduling** appears in 2 places with different UI patterns
- **Unpaid Jobs** appears in 3 places with different scopes
- **Recurring Gaps** appears in 2 places, one actionable and one informational

---

## C. Workflow Friction Inventory

### 1. No Single "Work the Queue" Path

**Problem:** Operators must navigate between multiple pages to work through exceptions:
- Dispatch Center for today's unassigned jobs
- Intelligence for upcoming unassigned jobs
- Schedule tab for schedule requests
- Financial Control Center for payment issues
- Revenue Hub for invoicing/collection

**Impact:** High cognitive load, easy to miss exceptions, no clear prioritization.

**Example Flow:**
1. Operator opens Dispatch Center → sees 3 unassigned jobs today
2. Assigns jobs → sees route mismatch warning
3. Navigates to Route Planning → generates route
4. Navigates to Intelligence → sees 5 upcoming unassigned jobs
5. Assigns those → navigates to Schedule → sees 2 schedule requests
6. Approves requests → navigates to Financial Control Center → sees 8 unpaid jobs
7. Navigates to Jobs page → collects payments

**Total page hops:** 6-7 pages for one exception-resolution session.

---

### 2. Duplicated Attention Surfaces

**Problem:** Same exception types appear in multiple places with different:
- Scopes (today vs. upcoming)
- Actionability (actionable vs. informational)
- Resolution paths (direct vs. navigate)

**Impact:** Confusion about which surface to use, duplicate work, inconsistent state.

**Example:** Unassigned jobs appear in:
- Dispatch Center (today, actionable)
- Intelligence (upcoming, actionable)
- Scheduling Center (upcoming, informational)
- Dashboard (this week, link)

**Operator confusion:** "Which one should I check first? Are they the same jobs?"

---

### 3. Weak Prioritization

**Problem:** Urgent exceptions (unassigned today) are mixed with passive insights (recurring gaps, idle teams).

**Impact:** Operators may focus on low-priority items while missing urgent issues.

**Example in DispatchCenterAdmin:**
- Urgent: Unassigned jobs today (actionable)
- Urgent: Route mismatches (actionable)
- Informational: Idle teams (no action)
- Informational: Overloaded teams (no action)

All shown in same "Dispatch Warnings" card with no visual prioritization.

---

### 4. Informational Cards Without Clear Next Actions

**Problem:** Some exception cards are informational only with no direct action path.

**Impact:** Operators see the issue but must navigate elsewhere to resolve it.

**Examples:**
- **JobIntelligenceAdmin** "Route Mismatch" card → No action button, must navigate to Dispatch Center
- **SchedulingCenterAdmin** "Scheduling Gaps" (unassigned) → No action button, must navigate to Schedule
- **DispatchCenterAdmin** "Idle Teams" → No action, purely informational

---

### 5. Multi-Page Resolution Flows

**Problem:** Resolving one exception often requires navigating to 2-3 different pages.

**Impact:** Slow resolution, context switching, easy to lose track of original issue.

**Example: Unpaid Job Resolution**
1. See exception in Financial Control Center
2. Click "Collect Payment" → Navigate to Jobs page
3. Jobs page opens job detail drawer
4. Navigate to Payments tab in drawer
5. Record payment
6. Navigate back to Financial Control Center to verify resolution

**Total page hops:** 3-4 for one exception.

---

### 6. Inconsistent Deep-Linking

**Problem:** Some exception cards deep-link correctly, others don't.

**Impact:** Operators must manually find the item after clicking.

**Examples:**
- ✅ **FinancialControlCenterAdmin** unpaid jobs → Deep-links to `/admin/jobs?openJobId={id}&action=collect_payment`
- ✅ **CustomersAdmin** schedule request events → Deep-links to `/admin/operations?tab=schedule&scheduleTab=requests&jobId={id}`
- ❌ **JobIntelligenceAdmin** missing addresses → Links to `/admin/customers` (no customer ID)
- ❌ **JobIntelligenceAdmin** incomplete data → Links to `/admin/jobs` (no job ID)

---

### 7. No Exception Status Tracking

**Problem:** No way to track which exceptions have been "worked" or "acknowledged."

**Impact:** Operators may revisit the same exceptions multiple times, or miss exceptions that were partially resolved.

**Example:** Operator sees "5 unassigned jobs" in Intelligence, assigns 3, but the card still shows "5 unassigned jobs" until page refresh.

---

## D. Recommended Phase B.2 Plan

### Goal
Create a unified exceptions queue that consolidates actionable exceptions from all surfaces into a single "work the queue" interface, while preserving existing page-specific views for detailed workflows.

### Design Principles
1. **Unified queue, not replacement** - Keep existing page-specific views, add a new unified queue
2. **Actionable first** - Prioritize exceptions that can be resolved directly
3. **Urgent first** - Prioritize today's exceptions over upcoming
4. **Preserve deep-linking** - Maintain existing deep-link patterns
5. **Minimal disruption** - Add new surface without removing existing ones

### Implementation Sequence

#### Step 1: Create Unified Exceptions Queue Component (Low Risk)
**Scope:** New shared component that aggregates exceptions from existing data sources.

**Deliverables:**
- `src/components/exceptions/ExceptionsQueue.jsx`
- Hook: `src/hooks/useExceptionsQueue.js`
- Exception aggregation logic (reads from existing page data, doesn't duplicate queries)

**Features:**
- Unified list of all actionable exceptions
- Priority sorting (urgent → upcoming → informational)
- Category grouping (Scheduling, Routing, Payments, Data Quality)
- Direct action buttons per exception
- Deep-linking to resolution context

**Integration Points:**
- Reuse existing data fetching from:
  - DispatchCenterAdmin (today's jobs, routes)
  - JobIntelligenceAdmin (upcoming jobs, addresses, routes)
  - ScheduleAdmin (schedule requests, needs scheduling)
  - FinancialControlCenterAdmin (unpaid, partially paid)
  - RevenueHub (balance due)

**Acceptance Criteria:**
- Queue shows all actionable exceptions from existing pages
- Priority sorting works correctly
- Action buttons resolve exceptions without page navigation where possible
- Deep-linking works for exceptions requiring navigation

---

#### Step 2: Add Exceptions Queue to Operations Center (Low Risk)
**Scope:** Add new "Exceptions" tab to Operations Center.

**Deliverables:**
- Update `src/pages/admin/OperationsCenterAdmin.jsx`
- Add "Exceptions" tab to TABS array
- Integrate `ExceptionsQueue` component

**Features:**
- New tab: `/admin/operations?tab=exceptions`
- Unified exceptions queue as tab content
- Preserve all existing tabs

**Acceptance Criteria:**
- Exceptions tab appears in Operations Center
- Queue loads and displays correctly
- Existing tabs remain unchanged

---

#### Step 3: Add Exceptions Badge to Operations Center Nav (Low Risk)
**Scope:** Show exception count badge on Operations Center tab navigation.

**Deliverables:**
- Update `src/pages/admin/OperationsCenterAdmin.jsx`
- Add exception count badge to "Exceptions" tab
- Real-time count updates

**Features:**
- Badge shows total actionable exception count
- Updates when exceptions are resolved
- Visual indicator of work remaining

**Acceptance Criteria:**
- Badge displays correct count
- Badge updates when exceptions resolved
- Badge styling matches existing patterns

---

#### Step 4: Add Dashboard Quick Link (Low Risk)
**Scope:** Add quick link to exceptions queue from Admin Dashboard.

**Deliverables:**
- Update `src/pages/admin/AdminDashboard.jsx`
- Add "Exceptions" quick link card or update existing exception KPIs

**Features:**
- Link to `/admin/operations?tab=exceptions`
- Show exception count in card
- Preserve existing exception KPIs

**Acceptance Criteria:**
- Link navigates correctly
- Count matches queue count
- Existing KPIs remain functional

---

#### Step 5: Enhance Exception Resolution (Medium Risk)
**Scope:** Add inline resolution actions where possible to reduce page navigation.

**Deliverables:**
- Enhance `ExceptionsQueue` component
- Add inline modals/drawers for:
  - Team assignment (reuse existing dropdown pattern)
  - Route regeneration (reuse existing button pattern)
  - Payment collection (reuse existing payment modal)
  - Schedule request approval (reuse existing approval pattern)

**Features:**
- Inline team assignment dropdown
- Inline route regeneration button
- Inline payment collection modal
- Inline schedule request approval
- Exception removed from queue after resolution

**Acceptance Criteria:**
- Inline actions work correctly
- Exceptions removed from queue after resolution
- No regressions in existing page-specific actions

---

### Deferred Items (Future Phases)

1. **Exception Status Tracking** - Track "acknowledged" vs. "resolved" exceptions
2. **Exception History** - Show recently resolved exceptions
3. **Exception Filters** - Filter by category, priority, date range
4. **Exception Notifications** - Real-time notifications for new exceptions
5. **Exception Analytics** - Track resolution time, exception trends

---

## E. Acceptance Checklist

### Phase B.2 Step 1: Unified Exceptions Queue Component
- [ ] `ExceptionsQueue` component created
- [ ] `useExceptionsQueue` hook created
- [ ] Exception aggregation logic implemented
- [ ] Priority sorting works (urgent → upcoming → informational)
- [ ] Category grouping works (Scheduling, Routing, Payments, Data Quality)
- [ ] Action buttons render correctly per exception type
- [ ] Deep-linking works for exceptions requiring navigation
- [ ] Component handles loading and error states
- [ ] Component handles empty state (no exceptions)

### Phase B.2 Step 2: Operations Center Integration
- [ ] "Exceptions" tab added to Operations Center
- [ ] Tab route: `/admin/operations?tab=exceptions`
- [ ] `ExceptionsQueue` component integrated
- [ ] Existing tabs remain unchanged
- [ ] Tab navigation works correctly

### Phase B.2 Step 3: Exception Count Badge
- [ ] Badge displays on "Exceptions" tab
- [ ] Badge shows correct actionable exception count
- [ ] Badge updates when exceptions resolved
- [ ] Badge styling matches existing patterns

### Phase B.2 Step 4: Dashboard Quick Link
- [ ] Quick link added to Admin Dashboard
- [ ] Link navigates to `/admin/operations?tab=exceptions`
- [ ] Link shows exception count
- [ ] Existing exception KPIs remain functional

### Phase B.2 Step 5: Inline Resolution Actions
- [ ] Inline team assignment dropdown works
- [ ] Inline route regeneration button works
- [ ] Inline payment collection modal works
- [ ] Inline schedule request approval works
- [ ] Exceptions removed from queue after resolution
- [ ] No regressions in existing page-specific actions

### Overall Phase B.2 Acceptance
- [ ] Unified exceptions queue consolidates all actionable exceptions
- [ ] Priority sorting works correctly
- [ ] Operators can resolve exceptions without excessive page navigation
- [ ] Existing page-specific views remain functional
- [ ] Deep-linking works correctly
- [ ] No regressions in existing exception surfacing

---

## Summary

**Current State:** Fragmented exceptions across 8+ pages with inconsistent actionability and resolution paths.

**Target State:** Unified exceptions queue in Operations Center with priority sorting, category grouping, and inline resolution actions.

**Implementation Risk:** Low to Medium - Adding new surface without removing existing ones, reusing existing data and patterns.

**Recommended First Prompt:** Phase B.2 Step 1 - Create Unified Exceptions Queue Component

---

## Files Referenced

### Exception Sources
- `src/pages/admin/DispatchCenterAdmin.jsx` - Today's unassigned, route mismatches, idle/overloaded teams
- `src/pages/admin/JobIntelligenceAdmin.jsx` - Upcoming unassigned, missing addresses, route mismatches, recurring gaps, incomplete data
- `src/pages/admin/ScheduleAdmin.jsx` - Schedule requests, needs scheduling
- `src/pages/admin/SchedulingCenterAdmin.jsx` - Unassigned upcoming, recurring gaps, teams requiring routes
- `src/pages/admin/FinancialControlCenterAdmin.jsx` - Unpaid, partially paid, completed unpaid, payment risk
- `src/pages/admin/RevenueHub.jsx` - Balance due, needs scheduling
- `src/pages/admin/PaymentsAdmin.jsx` - Unpaid total (informational)
- `src/pages/admin/AdminDashboard.jsx` - Unassigned jobs KPI

### Shared Components
- `src/components/schedule/ScheduleRequestsTab.jsx` - Schedule requests table
- `src/components/schedule/ScheduleNeedsSchedulingTab.jsx` - Needs scheduling table

### Container
- `src/pages/admin/OperationsCenterAdmin.jsx` - Operations Center container (target for new tab)
