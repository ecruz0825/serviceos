# Phase B: Target Navigation Structure

## Proposed Final Primary Navigation

### Admin Role Navigation

```
Dashboard          → /admin
Customers          → /admin/customers
Jobs               → /admin/jobs
Operations         → /admin/operations (NEW - consolidated)
Finance            → /admin/finance (NEW - consolidated)
Quotes             → /admin/quotes
Crew               → /admin/crew
Teams              → /admin/teams
Payments           → /admin/payments
Expenses           → /admin/expenses
Recurring Jobs     → /admin/recurring-jobs
Settings           → /admin/settings
Billing            → /admin/billing
Worker Portal      → /crew
```

### Manager/Dispatcher Role Navigation

```
Operations         → /admin/operations
Finance            → /admin/finance
```

*(Manager/dispatcher only see operational and financial surfaces per Phase A decisions)*

---

## Operations Center Tab Structure

**Route:** `/admin/operations`

**Default Tab:** `today` (Dispatch view)

**Tab Options:**
- `today` - Today's dispatch overview
- `schedule` - Calendar-based scheduling
- `routes` - Route planning and generation
- `automation` - Recurring job automation
- `intelligence` - Operational insights

**URL Structure:**
- `/admin/operations` → Defaults to `today` tab
- `/admin/operations?tab=today`
- `/admin/operations?tab=schedule`
- `/admin/operations?tab=routes`
- `/admin/operations?tab=automation`
- `/admin/operations?tab=intelligence`

**Tab Details:**

### Tab 1: Today (Default)
- **Source:** `DispatchCenterAdmin.jsx`
- **Content:**
  - Today's jobs summary (total, completed, pending)
  - Crew load per team
  - Unassigned jobs with quick assignment
  - Route status per team
  - Dispatch warnings
- **Actions:**
  - Assign teams to unassigned jobs
  - Navigate to Schedule tab for calendar view
  - Navigate to Routes tab for route generation

### Tab 2: Schedule
- **Source:** `ScheduleAdmin.jsx`
- **Content:**
  - Month/week calendar views
  - Drag-and-drop job assignment
  - Schedule requests tab
  - Needs scheduling tab
  - Day jobs drawer
- **Actions:**
  - Drag jobs to assign teams
  - View/edit jobs in calendar
  - Handle schedule requests

### Tab 3: Routes
- **Source:** `RoutePlanningAdmin.jsx`
- **Content:**
  - Team and date selector
  - Route generation
  - Route preview with map
  - Route stops list
- **Actions:**
  - Generate routes for team/date
  - Preview routes on map
  - Refresh route data

### Tab 4: Automation
- **Source:** `SchedulingCenterAdmin.jsx`
- **Content:**
  - Generate jobs from recurring schedules
  - Upcoming recurring work
  - Next 7 days scheduled jobs
  - Scheduling gaps
  - Today's teams requiring routes
  - Generate today's routes
- **Actions:**
  - Generate jobs from recurring
  - Generate today's routes
  - Link to Recurring Jobs admin page

### Tab 5: Intelligence
- **Source:** `JobIntelligenceAdmin.jsx`
- **Content:**
  - Unassigned upcoming jobs
  - Jobs assigned but not routed
  - Route mismatches
  - Missing customer addresses
  - Recurring schedule attention
  - Incomplete operational data
- **Actions:**
  - Assign teams to unassigned jobs
  - Navigate to relevant pages (Customers, Schedule, Routes)

---

## Finance Hub Tab Structure

**Route:** `/admin/finance`

**Default Tab:** `pipeline` (Revenue Hub main view)

**Tab Options:**
- `pipeline` - Quotes/Jobs/Invoices/Collections queues
- `collections` - Collections operations and cases
- `analytics` - Financial snapshots and trends
- `intelligence` - Financial risk alerts

**URL Structure:**
- `/admin/finance` → Defaults to `pipeline` tab
- `/admin/finance?tab=pipeline`
- `/admin/finance?tab=collections`
- `/admin/finance?tab=analytics`
- `/admin/finance?tab=intelligence`

**Tab Details:**

### Tab 1: Pipeline (Default)
- **Source:** `RevenueHub.jsx` (main pipeline sections)
- **Content:**
  - Quotes queue (with next actions)
  - Jobs queue (with next actions)
  - Invoices queue (with next actions)
  - Collections queue (with actions)
- **Actions:**
  - Work through queues top-to-bottom
  - Mark invoices sent/void
  - Log collection actions
  - Set follow-ups
  - Send collection emails

### Tab 2: Collections
- **Source:** `RevenueHub.jsx` (collections sections)
- **Content:**
  - Collections queue (detailed)
  - Collections activity log
  - Follow-ups list
  - Escalations list
  - Collections cases
  - Case metrics
- **Actions:**
  - Log collection actions
  - Set follow-ups
  - Send collection emails
  - Manage cases
  - Sync cases from escalations

### Tab 3: Analytics
- **Source:** `RevenueHub.jsx` (analytics sections)
- **Content:**
  - Financial snapshot (30-day)
  - Profit snapshot
  - AR aging buckets
  - Cash forecast
  - Revenue trends (chart)
  - Profit trends (chart)
  - Revenue by customer
  - Revenue by month
  - Expenses by category
- **Actions:**
  - Export CSV for various reports
  - Filter/retry data loads

### Tab 4: Intelligence
- **Source:** `FinancialControlCenterAdmin.jsx`
- **Content:**
  - Financial KPIs (revenue collected, unpaid count, etc.)
  - Unpaid jobs list
  - Partially paid jobs list
  - Completed but unpaid jobs
  - Payment risk/attention items
- **Actions:**
  - Navigate to Revenue Hub (Pipeline tab) for collections
  - Navigate to Jobs page for job details
  - Navigate to Customers page for customer details

---

## Current Routes: Visible vs Hidden

### Routes to Keep Visible in Nav

| Route | New Location | Nav Label |
|-------|--------------|-----------|
| `/admin` | Dashboard | Dashboard |
| `/admin/customers` | Customers | Customers |
| `/admin/jobs` | Jobs | Jobs |
| `/admin/operations` | Operations (NEW) | Operations |
| `/admin/finance` | Finance (NEW) | Finance |
| `/admin/quotes` | Quotes | Quotes |
| `/admin/crew` | Crew | Crew |
| `/admin/teams` | Teams | Teams |
| `/admin/payments` | Payments | Payments |
| `/admin/expenses` | Expenses | Expenses |
| `/admin/recurring-jobs` | Recurring Jobs | Recurring Jobs |
| `/admin/settings` | Settings | Settings |
| `/admin/billing` | Billing | Billing |

### Routes to Hide from Nav (Preserve for Deep Links)

| Route | Redirect To | Notes |
|-------|-------------|-------|
| `/admin/dispatch-center` | `/admin/operations?tab=today` | Preserve route, redirect to Today tab |
| `/admin/scheduling-center` | `/admin/operations?tab=automation` | Preserve route, redirect to Automation tab |
| `/admin/route-planning` | `/admin/operations?tab=routes` | Preserve route, redirect to Routes tab |
| `/admin/job-intelligence` | `/admin/operations?tab=intelligence` | Preserve route, redirect to Intelligence tab |
| `/admin/revenue-hub` | `/admin/finance?tab=pipeline` | Preserve route, redirect to Pipeline tab |
| `/admin/financial-control-center` | `/admin/finance?tab=intelligence` | Preserve route, redirect to Intelligence tab |
| `/admin/schedule` | `/admin/operations?tab=schedule` | Preserve route, redirect to Schedule tab |

**Implementation:** Add redirects in `App.jsx` or create redirect components that preserve query params and navigate to appropriate tab.

---

## Breadcrumbs / Deep-Link Considerations

### Breadcrumb Structure

**Operations Center:**
```
Dashboard > Operations > [Tab Name]
```

**Finance Hub:**
```
Dashboard > Finance > [Tab Name]
```

### Deep Link Support

**Query Parameter Approach:**
- Use `?tab=tabname` for tab selection
- Preserve other query params when redirecting
- Example: `/admin/dispatch-center?jobId=123` → `/admin/operations?tab=today&jobId=123`

**Hash Approach (Alternative):**
- Use `#tabname` for tab selection
- Simpler but less SEO-friendly
- Example: `/admin/operations#today`

**Recommended:** Query parameter approach for better URL sharing and bookmarking.

### Bookmark/Share Considerations

**Current State:**
- Users may have bookmarked `/admin/dispatch-center`, `/admin/revenue-hub`, etc.

**Migration Strategy:**
1. Keep old routes active
2. Add redirects that preserve query params
3. Show toast notification: "This page has moved to Operations > Today tab" (one-time, dismissible)
4. After 3 months, remove redirects (or keep indefinitely for safety)

---

## Navigation Config Changes

### Current Admin Nav (Before)

```javascript
{
  label: "Schedule",
  path: "/admin/schedule",
},
{
  label: "Dispatch Center",
  path: "/admin/dispatch-center",
},
{
  label: "Scheduling Center",
  path: "/admin/scheduling-center",
},
{
  label: "Job Intelligence",
  path: "/admin/job-intelligence",
},
{
  label: "Revenue Hub",
  path: "/admin/revenue-hub",
},
{
  label: "Financial Control Center",
  path: "/admin/financial-control-center",
},
```

### Proposed Admin Nav (After)

```javascript
{
  label: "Operations",
  path: "/admin/operations",
  icon: "briefcase", // or "calendar" or "route"
},
{
  label: "Finance",
  path: "/admin/finance",
  icon: "trending-up", // or "dollar-sign"
},
```

**Note:** "Schedule" nav item removed (now a tab within Operations)

---

## Manager/Dispatcher Nav Changes

### Current Manager/Dispatcher Nav (Before)

```javascript
{
  label: "Revenue Hub",
  path: "/admin/revenue-hub",
},
{
  label: "Route Planning",
  path: "/admin/route-planning",
},
{
  label: "Dispatch Center",
  path: "/admin/dispatch-center",
},
{
  label: "Scheduling Center",
  path: "/admin/scheduling-center",
},
{
  label: "Job Intelligence",
  path: "/admin/job-intelligence",
},
{
  label: "Financial Control Center",
  path: "/admin/financial-control-center",
},
```

### Proposed Manager/Dispatcher Nav (After)

```javascript
{
  label: "Operations",
  path: "/admin/operations",
},
{
  label: "Finance",
  path: "/admin/finance",
},
```

**Result:** 6 nav items → 2 nav items (much cleaner)

---

## Implementation Notes

### Tab Component Pattern

**Recommended Structure:**
```jsx
<OperationsCenter>
  <TabNav>
    <Tab name="today" label="Today" />
    <Tab name="schedule" label="Schedule" />
    <Tab name="routes" label="Routes" />
    <Tab name="automation" label="Automation" />
    <Tab name="intelligence" label="Intelligence" />
  </TabNav>
  <TabContent>
    {activeTab === 'today' && <DispatchCenterAdmin />}
    {activeTab === 'schedule' && <ScheduleAdmin />}
    {activeTab === 'routes' && <RoutePlanningAdmin />}
    {activeTab === 'automation' && <SchedulingCenterAdmin />}
    {activeTab === 'intelligence' && <JobIntelligenceAdmin />}
  </TabContent>
</OperationsCenter>
```

### URL Sync Pattern

**Use React Router's `useSearchParams`:**
```jsx
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get('tab') || 'today';

const handleTabChange = (tabName) => {
  setSearchParams({ tab: tabName });
};
```

### Redirect Pattern

**Create redirect components:**
```jsx
// src/pages/admin/DispatchCenterRedirect.jsx
export default function DispatchCenterRedirect() {
  const [searchParams] = useSearchParams();
  const tab = 'today';
  const otherParams = Object.fromEntries(
    Array.from(searchParams.entries()).filter(([key]) => key !== 'tab')
  );
  return <Navigate to={`/admin/operations?tab=${tab}&${new URLSearchParams(otherParams)}`} replace />;
}
```

---

## Summary

**Primary Navigation Reduction:**
- **Before:** 7 operational/financial nav items
- **After:** 2 nav items (Operations, Finance)
- **Reduction:** 71% fewer nav items

**Tab Structure:**
- **Operations:** 5 tabs (Today, Schedule, Routes, Automation, Intelligence)
- **Finance:** 4 tabs (Pipeline, Collections, Analytics, Intelligence)

**Route Preservation:**
- All old routes remain functional via redirects
- Deep links and bookmarks continue to work
- Gradual migration path for users
