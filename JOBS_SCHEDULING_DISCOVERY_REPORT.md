# Jobs Scheduling & Status Implementation Discovery Report

## 1. Admin Job Pages/Components

### Main Pages
- **`src/pages/admin/JobsAdmin.jsx`** (1,821 lines)
  - Primary job management page
  - Route: `/admin/jobs`
  - Features: Create, edit, delete, filter, assign teams, generate invoices
  - Form includes: service_date, scheduled_end_date, status, assigned_team_id

- **`src/pages/admin/ScheduleAdmin.jsx`** (1,375 lines)
  - Schedule visualization page
  - Route: `/admin/schedule`
  - Views: Agenda, Calendar (month), Week
  - Features: Drag-and-drop rescheduling, date range filters, team filters

### Components
- **`src/components/jobs/JobCard.jsx`** (196 lines)
  - Displays job details in list/grid views
  - Shows status badges, dates, assignee, pricing

- **`src/components/schedule/CalendarWeek.jsx`** (761 lines)
  - Week view with drag-and-drop scheduling
  - Supports multi-day job spans
  - Resize handles for start/end dates

- **`src/components/schedule/CalendarMonth.jsx`**
  - Month calendar view

- **`src/components/schedule/ScheduleJobRow.jsx`**
  - Row component for agenda view

- **`src/components/schedule/DayJobsDrawer.jsx`**
  - Drawer showing jobs for a selected day

---

## 2. Scheduling Fields (Exact Column Names)

### Primary Fields
- **`service_date`** (date, nullable)
  - Primary scheduling field
  - Used as job start date
  - Example: `job.service_date ? job.service_date.split('T')[0] : ''`

- **`scheduled_end_date`** (date, NOT NULL)
  - End date for multi-day jobs
  - Defaults to `service_date` if not provided (via trigger)
  - Constraint: `scheduled_end_date >= service_date`
  - Example: `job.scheduled_end_date ? formatDateKey(job.scheduled_end_date) : formatDateKey(job.service_date)`

### Migration Reference
```sql
-- From: supabase/migrations/20260126193000_ab5_jobs_scheduled_end_date.sql
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_end_date date;

-- Trigger ensures scheduled_end_date defaults to service_date
CREATE OR REPLACE FUNCTION public.jobs_set_scheduled_end_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_end_date IS NULL THEN
    NEW.scheduled_end_date := NEW.service_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Code Snippets

**JobsAdmin.jsx - Form Data:**
```javascript
const [formData, setFormData] = useState({
  service_date: '',
  scheduled_end_date: '',
  // ...
});

// Save logic (line 759-767):
const endDate = formData.scheduled_end_date || formData.service_date || null;
const payload = {
  service_date: formData.service_date || null,
  scheduled_end_date: endDate,
  // ...
};
```

**ScheduleAdmin.jsx - Query:**
```javascript
.select('id, services_performed, status, job_cost, customer_id, assigned_to, assigned_team_id, service_date, scheduled_end_date')
```

**CalendarWeek.jsx - Job Span Logic:**
```javascript
const getJobSpan = (job) => {
  if (!job.service_date) return null;
  const start = formatDateKey(job.service_date);
  const end = job.scheduled_end_date ? formatDateKey(job.scheduled_end_date) : start;
  return { start, end };
};
```

---

## 3. Job Status System

### Status Values (Exact Strings)
1. **`'Pending'`** (default)
   - Used when creating new jobs
   - Badge: amber background

2. **`'In Progress'`**
   - Badge: blue background

3. **`'Completed'`**
   - Badge: green background
   - Auto-set when payment >= job_cost (CustomerDashboard.jsx:222)

4. **`'Canceled'`**
   - Badge: slate/gray background
   - Filtered out by default in schedule views

### Status Usage in Code

**JobsAdmin.jsx - Status Dropdown (lines 1624-1635):**
```javascript
<select value={formData.status} onChange={...}>
  <option value="Pending">Pending</option>
  <option value="In Progress">In Progress</option>
  <option value="Completed">Completed</option>
</select>
```

**JobCard.jsx - Status Badge (lines 32-41):**
```javascript
const getStatusBadge = (status) => {
  if (status === "Completed")
    return <span className="bg-green-100 text-green-800">{status}</span>;
  if (status === "In Progress")
    return <span className="bg-blue-100 text-blue-800">{status}</span>;
  if (status === "Canceled")
    return <span className="bg-slate-200 text-slate-700">{status}</span>;
  return <span className="bg-amber-100 text-amber-800">{status}</span>; // Pending
};
```

**Status Filtering (JobsAdmin.jsx:342-346):**
```javascript
if (status) {
  filtered = filtered.filter(
    job => (job.status || '').toLowerCase() === status.toLowerCase()
  );
}
```

**Overdue Filter Logic (JobsAdmin.jsx:309-314):**
```javascript
// Overdue: service_date < today AND status NOT IN ("Completed", "Canceled")
const statusLower = (job.status || '').toLowerCase();
return serviceDate < today && 
       statusLower !== 'completed' && 
       statusLower !== 'canceled';
```

---

## 4. Quote to Job Conversion

### Conversion Function
**File:** `supabase/migrations/20260131122942_enforce_quote_validity_and_idempotency.sql`

**Function:** `respond_to_quote_public(p_token, p_action, p_signer_name, p_comment)`

### Job Creation on Quote Acceptance (lines 113-135):
```sql
INSERT INTO public.jobs (
  company_id,
  customer_id,
  service_date,              -- Set to CURRENT_DATE
  scheduled_end_date,        -- Set to CURRENT_DATE
  services_performed,
  job_cost,
  status,                   -- Set to 'Pending'
  assigned_team_id,         -- Set to NULL (unassigned)
  notes
) VALUES (
  v_quote.company_id,
  v_quote.customer_id,
  CURRENT_DATE,             -- Placeholder date
  CURRENT_DATE,             -- Placeholder date
  'From Quote ' || v_quote.quote_number,
  COALESCE(v_quote.total, 0),
  'Pending',                -- Default status
  NULL,                     -- Unassigned
  v_job_notes               -- Includes quote details, signer, comment
)
RETURNING id INTO v_job_id;
```

### Quote Update (lines 137-144):
```sql
UPDATE public.quotes
SET status = 'accepted',
    accepted_at = now(),
    accepted_by_name = p_signer_name,
    customer_comment = p_comment,
    converted_job_id = v_job_id  -- Links quote to job
WHERE id = v_quote.id;
```

### Key Fields Written to Job:
- `company_id` ← from quote
- `customer_id` ← from quote
- `service_date` ← `CURRENT_DATE` (placeholder)
- `scheduled_end_date` ← `CURRENT_DATE` (placeholder)
- `services_performed` ← `'From Quote {quote_number}'`
- `job_cost` ← `quote.total`
- `status` ← `'Pending'`
- `assigned_team_id` ← `NULL` (unassigned)
- `notes` ← concatenated quote info, signer name, customer comment

### Quote-Job Relationship
- **Quote field:** `converted_job_id` (uuid, references jobs.id)
- **Usage in QuotesAdmin.jsx (line 41):**
  ```javascript
  .select('id, quote_number, customer_id, total, status, valid_until, expires_at, created_at, updated_at, sent_at, converted_job_id, last_viewed_at')
  ```

---

## 5. Existing Scheduling UI

### ScheduleAdmin.jsx Features

**View Modes:**
- **Agenda:** Day/week list view with grouped jobs
- **Calendar:** Month grid view
- **Week:** 7-day drag-and-drop view

**Drag-and-Drop (CalendarWeek.jsx):**
- Move jobs between days
- Resize start date (left handle)
- Resize end date (right handle)
- Optimistic updates with undo toast

**Date Manipulation (ScheduleAdmin.jsx):**
- `handleJobDateChange()` - Moves job to new date (shifts end date by same delta)
- `handleResizeStart()` - Changes start date only
- `handleResizeEnd()` - Changes end date only
- All persist to Supabase: `service_date` and `scheduled_end_date`

**Filters:**
- Team/crew filter (by `assigned_team_id`)
- Include/exclude canceled jobs
- Date range (day/week)

**Quick Actions:**
- Create job for specific date (navigates to JobsAdmin with prefillDate param)
- Open job details (navigates to JobsAdmin with openJobId param)

### JobsAdmin.jsx Scheduling Features

**Form Fields:**
- Service Date (required)
- End Date (optional, defaults to service_date)
- Date validation: end date cannot be before start date

**Quick Filters:**
- `pending` - Status = 'Pending'
- `completed` - Status = 'Completed'
- `upcoming` - service_date >= today AND status != 'Completed'
- `unassigned` - assigned_team_id IS NULL AND assigned_to IS NULL
- `overdue` - service_date < today AND status NOT IN ('Completed', 'Canceled')

**URL Parameters:**
- `?openJobId={id}` - Opens job edit form
- `?prefillDate={YYYY-MM-DD}` - Prefills service_date in new job form
- `?prefillCrewId={team_id}` - Prefills assigned_team_id
- `?quickFilter={filter}` - Applies quick filter
- `?filter=overdue` - Applies overdue filter

---

## 6. Routes

### Admin Routes
- `/admin/jobs` → JobsAdmin.jsx
- `/admin/schedule` → ScheduleAdmin.jsx

### Navigation
- Defined in `src/components/nav/navConfig.js`
- Topbar breadcrumb mapping in `src/components/nav/Topbar.jsx`

---

## Summary

### Scheduling Fields
- **Primary:** `service_date` (date, nullable)
- **End Date:** `scheduled_end_date` (date, NOT NULL, defaults to service_date)

### Status Values
- `'Pending'` (default)
- `'In Progress'`
- `'Completed'`
- `'Canceled'`

### Admin Pages
- **JobsAdmin.jsx** - Full CRUD, filtering, assignment
- **ScheduleAdmin.jsx** - Visual scheduling with drag-and-drop

### Quote Conversion
- **Function:** `respond_to_quote_public()` RPC
- **Creates job with:** service_date = CURRENT_DATE, scheduled_end_date = CURRENT_DATE, status = 'Pending', assigned_team_id = NULL
- **Quote field:** `converted_job_id` links back to job

### Scheduling UI
- Drag-and-drop week view (CalendarWeek.jsx)
- Month calendar view (CalendarMonth.jsx)
- Agenda list view
- Date resize handles for multi-day jobs
- Optimistic updates with undo

### Key Finding for "Needs Scheduling" Module
**Accepted jobs from quotes are created with:**
- `service_date = CURRENT_DATE` (placeholder)
- `scheduled_end_date = CURRENT_DATE` (placeholder)
- `status = 'Pending'`
- `assigned_team_id = NULL` (unassigned)

**These jobs need:**
1. Proper `service_date` assignment (not placeholder)
2. Proper `scheduled_end_date` assignment (if multi-day)
3. Team assignment (`assigned_team_id`)
4. Status may remain 'Pending' or transition to a "Scheduled" state if needed

