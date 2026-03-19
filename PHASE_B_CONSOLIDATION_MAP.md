# Phase B: Operations Center / Finance Consolidation Map

## Executive Summary

The current admin product has **8 overlapping operational and financial surfaces** that create navigation confusion and workflow fragmentation. This document maps a consolidation strategy to reduce complexity while preserving all capabilities.

**Key Findings:**
- **Operations pages:** 5 pages (Schedule, Scheduling Center, Dispatch Center, Route Planning, Job Intelligence) with significant overlap
- **Finance pages:** 2 pages (Revenue Hub, Financial Control Center) with complementary but distinct purposes
- **Dashboard:** 1 overview page that links to many of the above

**Target Structure:**
- **Operations Center** (consolidated) - Single destination for all operational workflows
- **Finance Hub** (consolidated) - Single destination for all financial workflows
- **Dashboard** (enhanced) - Remains as overview with better navigation

**Simplification Opportunity:** Reduce 8 pages to 3 primary destinations + 2-3 secondary tools.

---

## Current Overlap Analysis

### Operations Pages

#### 1. **ScheduleAdmin** (`/admin/schedule`)
- **Primary Purpose:** Calendar-based job scheduling with drag-and-drop assignment
- **Daily vs Occasional:** Daily (primary scheduling tool)
- **Key Features:**
  - Month/week calendar views
  - Drag-and-drop job assignment to teams
  - Schedule requests tab
  - Needs scheduling tab
  - Day jobs drawer
- **Overlap:**
  - Job assignment overlaps with Dispatch Center
  - Calendar view overlaps with Scheduling Center's "next 7 days"
  - Unassigned jobs view overlaps with Job Intelligence
- **Classification:** **PRIMARY** - Core scheduling workflow

#### 2. **SchedulingCenterAdmin** (`/admin/scheduling-center`)
- **Primary Purpose:** Recurring job automation and scheduling pipeline health
- **Daily vs Occasional:** Occasional (automation triggers)
- **Key Features:**
  - Generate jobs from recurring schedules
  - Upcoming recurring work view
  - Next 7 days scheduled jobs
  - Scheduling gaps detection
  - Generate today's routes
- **Overlap:**
  - "Next 7 days" overlaps with Schedule calendar
  - Route generation overlaps with Route Planning
  - Unassigned jobs overlaps with Dispatch Center and Job Intelligence
- **Classification:** **SECONDARY** - Automation/health tool

#### 3. **DispatchCenterAdmin** (`/admin/dispatch-center`)
- **Primary Purpose:** Today's operational overview and quick dispatch actions
- **Daily vs Occasional:** Daily (morning dispatch routine)
- **Key Features:**
  - Today's jobs summary (total, completed, pending)
  - Crew load per team
  - Unassigned jobs with quick assignment
  - Route status per team
  - Dispatch warnings
- **Overlap:**
  - Job assignment overlaps with Schedule
  - Today's jobs overlaps with Schedule's today view
  - Route status overlaps with Route Planning
- **Classification:** **PRIMARY** - Daily dispatch workflow

#### 4. **RoutePlanningAdmin** (`/admin/route-planning`)
- **Primary Purpose:** Generate and preview team routes for specific dates
- **Daily vs Occasional:** Occasional (when planning routes)
- **Key Features:**
  - Select team and date
  - Generate route from assigned jobs
  - Preview route with map
  - View route stops
- **Overlap:**
  - Route generation overlaps with Scheduling Center's "Generate Today's Routes"
  - Route preview could be part of Dispatch Center
- **Classification:** **SECONDARY** - Specialized route tool

#### 5. **JobIntelligenceAdmin** (`/admin/job-intelligence`)
- **Primary Purpose:** Rule-based operational insights and risk detection
- **Daily vs Occasional:** Occasional (health checks)
- **Key Features:**
  - Unassigned upcoming jobs
  - Jobs assigned but not routed
  - Route mismatches
  - Missing customer addresses
  - Recurring schedule attention
  - Incomplete operational data
- **Overlap:**
  - Unassigned jobs overlaps with Dispatch Center and Schedule
  - Route mismatches overlaps with Dispatch Center
  - Recurring attention overlaps with Scheduling Center
- **Classification:** **ADVANCED** - Intelligence/health tool

### Finance Pages

#### 6. **RevenueHub** (`/admin/revenue-hub`)
- **Primary Purpose:** Comprehensive revenue pipeline and collections operations
- **Daily vs Occasional:** Daily (primary revenue workflow)
- **Key Features:**
  - Quotes pipeline
  - Jobs pipeline
  - Invoices pipeline
  - Collections queue with actions
  - Financial snapshots (30-day, profit, AR aging, cash forecast)
  - Revenue trends
  - Collections activity, follow-ups, escalations, cases
  - Export capabilities
- **Overlap:**
  - Financial metrics overlap with Financial Control Center
  - Unpaid jobs view overlaps with Financial Control Center
- **Classification:** **PRIMARY** - Core revenue/collections workflow

#### 7. **FinancialControlCenterAdmin** (`/admin/financial-control-center`)
- **Primary Purpose:** Read-only financial intelligence and payment risk alerts
- **Daily vs Occasional:** Occasional (financial health checks)
- **Key Features:**
  - Financial KPIs (revenue collected, unpaid count, partially paid count)
  - Unpaid jobs list
  - Partially paid jobs list
  - Completed but unpaid jobs
  - Payment risk/attention items
- **Overlap:**
  - Unpaid/partially paid views overlap with Revenue Hub's collections queue
  - Financial KPIs overlap with Revenue Hub's snapshots
- **Classification:** **SECONDARY** - Read-only intelligence view

### Overview Page

#### 8. **AdminDashboard** (`/admin`)
- **Primary Purpose:** KPI overview and quick navigation
- **Daily vs Occasional:** Daily (landing page)
- **Key Features:**
  - Today/this week KPIs
  - Overdue jobs list
  - Crew workload
  - Financial summary
  - Quick action cards
- **Overlap:**
  - Links to all other pages
  - KPI summaries duplicate data from other pages
- **Classification:** **PRIMARY** - Overview/landing page

---

## Target Product Structure

### Primary Navigation Structure

```
Dashboard          → Overview, KPIs, quick actions
Customers          → Customer management (existing)
Jobs               → Job management (existing)
Operations         → NEW: Consolidated operations center
Finance            → NEW: Consolidated finance hub
Crew               → Crew management (existing)
Settings           → Settings (existing)
Billing            → Billing (existing)
```

### Operations Center Structure (Tabs/Sections)

**Proposed Tab Model:**

1. **Today** (default tab)
   - Today's jobs summary
   - Crew load per team
   - Unassigned jobs with quick assignment
   - Route status
   - Dispatch warnings
   - *Source: DispatchCenterAdmin*

2. **Schedule**
   - Calendar view (month/week)
   - Drag-and-drop assignment
   - Schedule requests
   - Needs scheduling
   - *Source: ScheduleAdmin*

3. **Routes**
   - Route planning (team + date selector)
   - Route generation
   - Route preview with map
   - *Source: RoutePlanningAdmin*

4. **Automation**
   - Generate jobs from recurring
   - Upcoming recurring work
   - Scheduling gaps
   - *Source: SchedulingCenterAdmin*

5. **Intelligence**
   - Operational insights
   - Risk signals
   - Health checks
   - *Source: JobIntelligenceAdmin*

### Finance Hub Structure (Tabs/Sections)

**Proposed Tab Model:**

1. **Pipeline** (default tab)
   - Quotes queue
   - Jobs queue
   - Invoices queue
   - Collections queue
   - *Source: RevenueHub (main pipeline views)*

2. **Collections**
   - Collections queue with actions
   - Collections activity
   - Follow-ups
   - Escalations
   - Cases
   - *Source: RevenueHub (collections sections)*

3. **Analytics**
   - Financial snapshots
   - Revenue trends
   - Profit trends
   - AR aging
   - Cash forecast
   - Revenue by customer/month
   - Expenses by category
   - *Source: RevenueHub (analytics sections)*

4. **Intelligence**
   - Financial KPIs
   - Unpaid jobs
   - Partially paid jobs
   - Completed but unpaid
   - Payment risk alerts
   - *Source: FinancialControlCenterAdmin*

---

## Page-by-Page Mapping

### Operations Pages

| Current Page | Destination | Classification | Notes |
|-------------|-------------|----------------|-------|
| **ScheduleAdmin** | Operations → Schedule tab | **Keep as primary** | Core scheduling workflow, becomes tab |
| **DispatchCenterAdmin** | Operations → Today tab | **Fold into Operations** | Becomes default tab of Operations |
| **RoutePlanningAdmin** | Operations → Routes tab | **Fold into Operations** | Becomes Routes tab |
| **SchedulingCenterAdmin** | Operations → Automation tab | **Fold into Operations** | Becomes Automation tab |
| **JobIntelligenceAdmin** | Operations → Intelligence tab | **Fold into Operations** | Becomes Intelligence tab |

### Finance Pages

| Current Page | Destination | Classification | Notes |
|-------------|-------------|----------------|-------|
| **RevenueHub** | Finance → Pipeline/Collections/Analytics tabs | **Keep as primary** | Core revenue workflow, becomes multi-tab hub |
| **FinancialControlCenterAdmin** | Finance → Intelligence tab | **Fold into Finance** | Becomes Intelligence tab |

### Overview Page

| Current Page | Destination | Classification | Notes |
|-------------|-------------|----------------|-------|
| **AdminDashboard** | Dashboard (enhanced) | **Keep as primary** | Remains landing page, improved navigation |

### Secondary Tools (Keep Separate)

| Current Page | Destination | Classification | Notes |
|-------------|-------------|----------------|-------|
| **JobsAdmin** | Jobs (existing) | **Keep as primary** | No change needed |
| **CustomersAdmin** | Customers (existing) | **Keep as primary** | No change needed |
| **PaymentsAdmin** | Payments (existing) | **Keep as primary** | No change needed |
| **ExpensesAdmin** | Expenses (existing) | **Keep as primary** | No change needed |
| **QuotesAdmin** | Quotes (existing) | **Keep as primary** | No change needed |
| **RecurringJobsAdmin** | Recurring Jobs (existing) | **Keep as secondary** | Could link from Operations → Automation |

---

## Recommended Phased Implementation Path

### Phase B.1: Navigation Consolidation (Safest, First Step)

**Goal:** Update navigation to point to new consolidated destinations without changing page code.

**Steps:**
1. Create wrapper pages:
   - `OperationsCenterAdmin.jsx` - Tab container, routes to existing pages initially
   - `FinanceHubAdmin.jsx` - Tab container, routes to existing pages initially
2. Update `navConfig.js`:
   - Replace "Dispatch Center", "Scheduling Center", "Route Planning", "Job Intelligence" with "Operations"
   - Replace "Revenue Hub", "Financial Control Center" with "Finance"
3. Preserve all existing routes (for deep links, bookmarks)
4. Wrapper pages use tabs to switch between existing page components

**Risk:** Low - No page code changes, only navigation and wrapper structure

**Migration Path:** Existing routes remain functional, new routes point to wrappers

### Phase B.2: Tab Integration (Medium Risk)

**Goal:** Integrate existing pages as tabs within consolidated hubs.

**Steps:**
1. Refactor existing pages to be tab-compatible (remove PageHeader, accept props)
2. Update wrapper pages to render tabs with integrated components
3. Share state/data where beneficial (e.g., today's jobs across Today and Schedule tabs)
4. Add tab navigation UI

**Risk:** Medium - Requires page refactoring but preserves all functionality

**Migration Path:** Existing routes redirect to appropriate tab in consolidated hub

### Phase B.3: Data Consolidation (Higher Risk, Optional)

**Goal:** Share data fetching across tabs to reduce duplicate queries.

**Steps:**
1. Create shared data hooks for Operations Center (today's jobs, teams, routes, etc.)
2. Create shared data hooks for Finance Hub (jobs, payments, invoices, etc.)
3. Refactor tabs to use shared hooks instead of independent fetching
4. Add loading states and error handling

**Risk:** Higher - Requires careful state management, but improves performance

**Migration Path:** Gradual - Start with read-only data, then add mutations

---

## Risks / Migration Concerns

### High Risk Areas

1. **Deep Links / Bookmarks**
   - **Risk:** Users have bookmarked specific pages
   - **Mitigation:** Preserve routes, add redirects to appropriate tabs
   - **Solution:** Keep old routes, redirect to new tab structure

2. **Manager/Dispatcher Navigation**
   - **Risk:** Manager/dispatcher nav was just updated in Phase A
   - **Mitigation:** Update nav config to point to Operations/Finance instead of individual pages
   - **Solution:** Single nav update, all roles benefit

3. **RevenueHub Complexity**
   - **Risk:** RevenueHub is very large (4500+ lines) with many sections
   - **Mitigation:** Tab structure allows gradual migration, preserve all sections
   - **Solution:** Start with wrapper, migrate sections to tabs incrementally

### Medium Risk Areas

1. **State Management**
   - **Risk:** Multiple pages currently manage independent state
   - **Mitigation:** Start with independent state per tab, consolidate later
   - **Solution:** Phase B.2 keeps state separate, Phase B.3 consolidates

2. **URL Structure**
   - **Risk:** Tab state not reflected in URL initially
   - **Mitigation:** Use query params for tab selection (`/admin/operations?tab=today`)
   - **Solution:** Add URL sync in Phase B.2

### Low Risk Areas

1. **Component Reuse**
   - **Risk:** Some components may need prop adjustments
   - **Mitigation:** Most components already accept props, minimal changes needed
   - **Solution:** Wrapper pages pass appropriate props

2. **Support Mode**
   - **Risk:** Support mode checks need to work in tab structure
   - **Mitigation:** Support mode checks are in handlers, not page structure
   - **Solution:** Tab components inherit support mode from wrapper

---

## Summary

**Biggest Simplification Opportunities:**
1. **Operations:** 5 pages → 1 Operations Center with 5 tabs
2. **Finance:** 2 pages → 1 Finance Hub with 4 tabs
3. **Navigation:** 7 operational/financial nav items → 2 nav items

**Pages Likely to Remain as Secondary Tools:**
- JobsAdmin (already well-structured)
- CustomersAdmin (already well-structured)
- PaymentsAdmin (already well-structured)
- ExpensesAdmin (already well-structured)
- QuotesAdmin (already well-structured)
- RecurringJobsAdmin (could link from Operations → Automation)

**Recommended First Implementation Step:**
**Phase B.1: Navigation Consolidation** - Create wrapper pages and update navigation. This provides immediate UX improvement with zero risk to existing functionality.
