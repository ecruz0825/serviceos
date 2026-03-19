# Dispatch System Technical Analysis

## Overview

The dispatch system is a comprehensive scheduling and route management interface built into `ScheduleAdmin.jsx`. It provides multiple views for managing jobs, assigning crews, optimizing routes, and visualizing schedules on maps.

---

## Files Related to Dispatch

### Core Dispatch Files

1. **`src/pages/admin/ScheduleAdmin.jsx`** (2,525 lines)
   - Main dispatch interface with all view modes
   - Handles drag-and-drop, crew assignment, route optimization
   - Integrates calendar, week, agenda, crew, and map views

2. **`src/components/schedule/ScheduleJobRow.jsx`**
   - Reusable job row component for list views
   - Displays job details, status, customer, assignee
   - Includes crew assignment dropdown

3. **`src/components/schedule/CalendarMonth.jsx`**
   - Month calendar grid view
   - Shows jobs as pills on calendar days
   - Clickable days open drawer with day's jobs

4. **`src/components/schedule/CalendarWeek.jsx`**
   - Week view with drag-and-drop job scheduling
   - Supports multi-day job spans
   - Resizable job pills (start/end date adjustment)

5. **`src/components/schedule/DayJobsDrawer.jsx`**
   - Drawer component showing all jobs for a selected day
   - Filterable by crew and status
   - Quick job creation

### Database Schema Files

6. **`supabase/migrations/20260310040000_add_route_order_rpc.sql`**
   - Defines `get_optimized_route_for_day()` RPC
   - Server-side route optimization using nearest-neighbor algorithm

7. **`supabase/migrations/20260310050000_add_route_order_persistence.sql`**
   - Adds `jobs.route_order` column
   - Defines `apply_optimized_route_for_day()` RPC
   - Creates index for route ordering queries

8. **`supabase/migrations/20260312000000_crew_specific_route_optimization.sql`**
   - Extends optimization RPCs to support crew-specific filtering
   - Adds `p_assigned_team_id` parameter to both RPCs

### Supporting Files

9. **`src/pages/crew/CrewPortalMobile.jsx`**
   - Crew-facing job list sorted by `route_order`
   - Displays route stop numbers

10. **`src/hooks/useCrewJobs.js`**
    - Fetches crew jobs ordered by `route_order`
    - Used by crew portal views

---

## Dispatch Views

### 1. **Agenda View** (`viewMode === 'agenda'`)
- **Purpose**: List view of jobs grouped by date
- **Date Range**: Day or week (configurable)
- **Features**:
  - Jobs sorted by `service_date` ascending, then by title
  - Grouped by date with date headers
  - Quick range chips (Today, Tomorrow, This Week)
  - Filterable by crew and status

### 2. **Calendar View** (`viewMode === 'calendar'`)
- **Purpose**: Month grid showing jobs as pills
- **Component**: `CalendarMonth.jsx`
- **Features**:
  - 6-week calendar grid (42 days)
  - Jobs displayed as colored pills (max 3 visible, "+N more" for overflow)
  - Status-based colors (Completed=green, In Progress=blue, Canceled=gray, Pending=amber)
  - Clickable days open `DayJobsDrawer`
  - Clickable job pills highlight and open drawer

### 3. **Week View** (`viewMode === 'week'`)
- **Purpose**: Week grid with drag-and-drop scheduling
- **Component**: `CalendarWeek.jsx`
- **Features**:
  - 7-day columns (Sunday to Saturday)
  - Jobs displayed as draggable pills spanning multiple days
  - Drag jobs between days to reschedule
  - Resize handles on job pills (left=start date, right=end date)
  - Jobs sorted by assignee, customer, title within each day
  - Optimistic updates with undo toast notifications

### 4. **Crew View** (`viewMode === 'crew'`)
- **Purpose**: Group jobs by assigned crew/team
- **Features**:
  - Jobs grouped by `assigned_team_id`
  - "Unassigned" section for jobs without crew
  - Drag-and-drop job assignment between crews
  - Crew color coding (from `teams.color`)
  - Crew member count display
  - Drop zones for each crew section

### 5. **Map View** (`viewMode === 'map'`)
- **Purpose**: Geographic visualization of job locations
- **Library**: `react-leaflet` (Leaflet.js)
- **Features**:
  - Interactive map with job markers
  - Route lines connecting jobs in `route_order` sequence
  - Only shows jobs with valid customer coordinates (`latitude`, `longitude`)
  - Jobs sorted by `route_order` (nulls last)
  - Route optimization controls (optimize, apply)
  - Crew filter support

---

## How Jobs Appear in Dispatch

### Data Flow

1. **Initial Load** (`useEffect` in `ScheduleAdmin.jsx:605-709`):
   ```javascript
   // Fetch jobs with route_order
   const { data: jobsData } = await supabase
     .from('jobs')
     .select('id, services_performed, status, job_cost, customer_id, assigned_team_id, service_date, scheduled_end_date, route_order')
     .eq('company_id', companyId);
   ```

2. **Filtering**:
   - **Date Range**: Filtered by `service_date` within view's date range
   - **Status**: Excludes "Canceled" unless `includeCanceled` is true
   - **Crew**: Filtered by `assigned_team_id` if `selectedCrew` is set
   - **Location**: Map view requires `customer.latitude` and `customer.longitude`

3. **Grouping** (view-specific):
   - **Agenda**: Grouped by `service_date` (date key: `YYYY-MM-DD`)
   - **Calendar**: Grouped by `service_date` in `jobsByDate` map
   - **Week**: Jobs spanning multiple days appear in each day column
   - **Crew**: Grouped by `assigned_team_id` (null → "unassigned")
   - **Map**: No grouping, sorted by `route_order`

4. **Sorting**:
   - **Agenda**: `service_date` ASC, then `services_performed` ASC
   - **Calendar**: `services_performed` ASC within each day
   - **Week**: Assignee name, customer name, title, job ID (stable sort)
   - **Crew**: `service_date` ASC within each crew
   - **Map**: `route_order` ASC (nulls last)

### Job Display Components

- **Job Pills** (Calendar/Week): Colored pills with truncated title, customer name, cost, assignee badge
- **Job Rows** (Agenda/Crew): Full row with title, status badge, customer, assignee dropdown, "Open" button
- **Map Markers**: Leaflet markers with popups showing job details

---

## Crew Assignment

### Assignment Methods

1. **Dropdown Selection** (`ScheduleJobRow.jsx:77-95`):
   ```javascript
   <select
     value={job.assigned_team_id || ""}
     onChange={(e) => onAssignCrew(job.id, e.target.value)}
   >
     <option value="">Unassigned</option>
     {teams.map((team) => (
       <option key={team.id} value={team.id}>
         {displayName}
       </option>
     ))}
   </select>
   ```

2. **Drag-and-Drop** (Crew View, `ScheduleAdmin.jsx:1898-1932`):
   - Jobs are draggable (`useDraggable` from `@dnd-kit/core`)
   - Crew sections are drop zones (`useDroppable`)
   - On drop, calls `handleAssignCrew(jobId, newTeamId)`

### Assignment Handler (`handleAssignCrew`, `ScheduleAdmin.jsx:1069-1099`)

```javascript
const handleAssignCrew = async (jobId, teamId) => {
  // 1. Optimistic UI update
  setJobs(prev => prev.map(job =>
    job.id === jobId ? { ...job, assigned_team_id: teamId || null } : job
  ));
  
  // 2. Persist to database
  const { error } = await supabase
    .from('jobs')
    .update({ assigned_team_id: teamId || null })
    .eq('id', jobId);
  
  // 3. Rollback on error
  if (error) {
    // Restore previous assigned_team_id
    setJobs(prev => prev.map(job =>
      job.id === jobId ? { ...job, assigned_team_id: previousTeamId } : job
    ));
    toast.error('Could not assign job.');
  }
};
```

### Database Schema

- **`jobs.assigned_team_id`**: UUID foreign key to `teams.id` (nullable)
- **`teams` table**: Stores crew/team definitions with `name`, `color`, `company_id`
- **`team_members` table**: Links `teams` to `crew_members` (many-to-many)

### Display Logic

- **Single-member teams**: Display crew member's `full_name` instead of team name
- **Multi-member teams**: Display team `name`
- **Unassigned**: `assigned_team_id IS NULL` → "Unassigned"

---

## Route Order Persistence

### Database Column

**`jobs.route_order`** (integer, nullable):
- Added in migration `20260310050000_add_route_order_persistence.sql`
- Index: `idx_jobs_company_service_date_route_order` on `(company_id, service_date, route_order)`
- Purpose: Stores the optimized visit order for jobs on a given day

### How Route Order is Set

1. **Manual Assignment**: Not directly supported in UI (would require custom ordering controls)
2. **Route Optimization**: Set via `apply_optimized_route_for_day()` RPC

### Route Optimization RPCs

#### `get_optimized_route_for_day(p_service_date, p_assigned_team_id)`

**Location**: `supabase/migrations/20260312000000_crew_specific_route_optimization.sql`

**Algorithm**: Nearest-neighbor heuristic
1. Select all jobs for the date (optionally filtered by `p_assigned_team_id`)
2. Filter jobs with valid customer coordinates
3. Pick first job arbitrarily (deterministic by UUID sort)
4. Repeatedly choose the closest remaining job using `geo_distance_km()`
5. Return ordered list with `route_order` (1, 2, 3, ...)

**Returns**:
```sql
TABLE (
  job_id uuid,
  customer_name text,
  latitude double precision,
  longitude double precision,
  route_order integer
)
```

#### `apply_optimized_route_for_day(p_service_date, p_assigned_team_id)`

**Location**: Same migration file

**Process**:
1. Calls `get_optimized_route_for_day()` to get optimized order
2. Updates `jobs.route_order` for matching jobs
3. Returns `updated_count`

**Usage in Frontend** (`ScheduleAdmin.jsx:1020-1066`):
```javascript
const { data, error } = await supabase.rpc('apply_optimized_route_for_day', {
  p_service_date: selectedDate,
  p_assigned_team_id: routeOptimizationCrew || null
});
```

### Route Order Usage

1. **Map View**: Jobs sorted by `route_order`, route lines drawn in order
2. **Crew Portal**: Jobs displayed in `route_order` sequence with stop numbers
3. **Database Queries**: Ordered by `route_order ASC, nullsFirst: false`

---

## Dispatch State Persistence

### What is Persisted

1. **Job Assignment** (`jobs.assigned_team_id`):
   - Updated immediately on crew assignment
   - Persisted via direct Supabase update

2. **Job Dates** (`jobs.service_date`, `jobs.scheduled_end_date`):
   - Updated on drag-and-drop reschedule (Week view)
   - Persisted via direct Supabase update
   - Optimistic updates with rollback on error

3. **Route Order** (`jobs.route_order`):
   - Set via `apply_optimized_route_for_day()` RPC
   - Persisted in database
   - Not cleared when jobs are reassigned (manual cleanup may be needed)

### What is NOT Persisted

1. **View Mode**: Stored in `localStorage` (`schedule:viewMode`), not database
2. **Selected Date**: Stored in URL query params (`?date=YYYY-MM-DD`), not database
3. **Filters** (crew, status): Stored in URL query params, not database
4. **Optimized Route Preview**: Stored in component state (`optimizedRoute`), not database until "Apply" is clicked

### State Management

- **React State**: Jobs, customers, teams, filters, view mode
- **URL Query Params**: Selected date, date range, filters (for shareable/bookmarkable URLs)
- **LocalStorage**: View mode preference
- **Database**: Job assignments, dates, route order (source of truth)

---

## Route Optimization: Server-Side vs Frontend

### **Server-Side Optimization** ✅

Route optimization is **entirely server-side**:

1. **RPC Functions**: `get_optimized_route_for_day()` and `apply_optimized_route_for_day()` run in PostgreSQL
2. **Algorithm**: Nearest-neighbor heuristic implemented in PL/pgSQL
3. **Distance Calculation**: Uses `geo_distance_km()` function (Haversine formula)
4. **Frontend Role**: Only triggers optimization and displays results

### Optimization Flow

```
Frontend (ScheduleAdmin.jsx)
  ↓
1. User clicks "Optimize Route"
  ↓
2. Calls supabase.rpc('get_optimized_route_for_day', { p_service_date, p_assigned_team_id })
  ↓
3. PostgreSQL executes nearest-neighbor algorithm
  ↓
4. Returns ordered list with route_order
  ↓
5. Frontend displays preview (Map view shows route lines)
  ↓
6. User clicks "Apply Optimized Route"
  ↓
7. Calls supabase.rpc('apply_optimized_route_for_day', { p_service_date, p_assigned_team_id })
  ↓
8. PostgreSQL updates jobs.route_order
  ↓
9. Frontend refreshes jobs data
```

### Why Server-Side?

- **Performance**: Database can efficiently query and sort large job sets
- **Consistency**: Same algorithm for all clients
- **Security**: RLS policies enforced, role-based access control
- **Scalability**: No client-side computation burden

### Frontend Optimization Features

- **Preview**: Shows optimized route on map before applying
- **Crew Filtering**: Can optimize routes for specific crews
- **Date Selection**: Optimize for any service date
- **Visual Feedback**: Route lines drawn in optimized order

---

## Drag-and-Drop Scheduling

### Libraries

- **`@dnd-kit/core`**: Core drag-and-drop functionality
- **`@dnd-kit/sortable`**: Not used (custom implementation)

### Drag-and-Drop Implementations

1. **Crew View** (`ScheduleAdmin.jsx:1898-1932`):
   - Jobs draggable between crew sections
   - Drop zones: `crew-drop-{teamId}` or `crew-drop-unassigned`
   - Updates `assigned_team_id` on drop

2. **Week View** (`CalendarWeek.jsx:229-351`):
   - Jobs draggable between day columns
   - Drop zones: `day-YYYY-MM-DD`
   - Updates `service_date` and `scheduled_end_date` on drop
   - Supports resize drags (left/right handles)

### Drag Handlers

- **`handleDragStart`**: Sets `draggedJob` and `activeDragJobId` for visual feedback
- **`handleDragEnd`**: Processes drop, updates database, shows undo toast
- **`handleDragCancel`**: Cleans up state on cancel

### Optimistic Updates

- UI updates immediately on drag end
- Database update happens asynchronously
- Rollback on error with toast notification
- Undo support via toast action (7-second window)

---

## Technical Architecture Summary

### Data Model

```
jobs
├── assigned_team_id (FK → teams.id) - Crew assignment
├── service_date (date) - Start date
├── scheduled_end_date (date) - End date (nullable)
└── route_order (integer) - Visit order (nullable)

teams
├── id (PK)
├── name
├── color
└── company_id (FK)

customers
├── id (PK)
├── latitude (for route optimization)
└── longitude (for route optimization)
```

### Key Functions

1. **`handleAssignCrew(jobId, teamId)`**: Assigns job to crew (optimistic update)
2. **`handleJobDateChange(jobId, newDate)`**: Reschedules job (with undo)
3. **`handleOptimizeRoute()`**: Fetches optimized route preview
4. **`handleApplyOptimizedRoute()`**: Applies route order to database
5. **`handleCrewDragEnd(event)`**: Processes crew assignment via drag-and-drop

### Performance Considerations

- **Indexes**: `idx_jobs_company_service_date_route_order` for route queries
- **Memoization**: `useMemo` for filtered/grouped job lists
- **Optimistic Updates**: Immediate UI feedback, async persistence
- **Lazy Loading**: Jobs fetched on mount and filter changes

### Security

- **RLS Policies**: All queries scoped by `company_id`
- **Role Gates**: Route optimization RPCs require `admin`, `manager`, or `dispatcher` role
- **Authentication**: All operations require authenticated user

---

## Summary

The dispatch system is a sophisticated scheduling interface with:

- **5 View Modes**: Agenda, Calendar, Week, Crew, Map
- **Drag-and-Drop**: Crew assignment and date rescheduling
- **Route Optimization**: Server-side nearest-neighbor algorithm
- **State Persistence**: Job assignments, dates, and route order stored in database
- **Optimistic Updates**: Fast UI with rollback on error
- **Multi-Tenant Safe**: All operations scoped by `company_id` via RLS

The system balances flexibility (multiple views) with performance (server-side optimization, optimistic updates) and user experience (undo, visual feedback, drag-and-drop).
