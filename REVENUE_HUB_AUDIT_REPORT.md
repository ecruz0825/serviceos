# Revenue Hub + Quotes → Jobs → Scheduling → Invoicing System Audit

**Date:** 2026-02-06  
**Scope:** Full lifecycle from quote acceptance through invoicing

---

## SECTION A: System Map

### Database Objects

#### Tables
- **`public.jobs`**
  - Key columns: `id`, `company_id`, `customer_id`, `service_date` (date, nullable), `scheduled_end_date` (date, nullable), `status` (text), `job_cost` (numeric), `invoice_path` (text, nullable), `invoice_uploaded_at` (timestamptz, nullable), `completed_at` (timestamptz, nullable), `created_at` (timestamptz), `updated_at` (timestamptz), `assigned_team_id` (uuid, nullable), `notes` (text)
  - Constraints: `jobs_scheduled_end_date_gte_start` CHECK (scheduled_end_date >= service_date) - handles NULLs correctly

- **`public.quotes`**
  - Key columns: `id`, `company_id`, `customer_id`, `public_token` (uuid), `status` (text: draft/sent/accepted/rejected/expired), `converted_job_id` (uuid, nullable), `accepted_at`, `accepted_by_name`, `customer_comment`, `rejected_at`, `rejected_by_name`

- **`public.job_schedule_requests`**
  - Key columns: `id`, `company_id`, `job_id`, `quote_id`, `public_token`, `requested_date` (date), `customer_note` (text), `status` (text: requested/approved/declined/canceled), `created_at`, `approved_at`, `approved_by`, `decline_reason`

#### Functions/Triggers
1. **`respond_to_quote_public(p_token, p_action, p_signer_name, p_comment)`**
   - Location: `supabase/migrations/20260206000000_fix_public_quote_accept_no_auto_schedule.sql`
   - Creates job with `service_date = NULL`, `scheduled_end_date = NULL`
   - Sets `quotes.status = 'accepted'`, `converted_job_id = job.id`
   - Grants: `anon, authenticated`

2. **`jobs_set_default_end_date()`** (Trigger Function)
   - Location: `supabase/migrations/20260206000001_allow_null_scheduled_dates_for_needs_scheduling.sql`
   - Trigger: `trg_jobs_set_default_end_date` BEFORE INSERT OR UPDATE
   - Logic: Only sets `scheduled_end_date = service_date` if `service_date IS NOT NULL`
   - Allows both dates to be NULL for "Needs Scheduling" jobs

3. **`jobs_lifecycle_trigger()`** (Trigger Function)
   - Location: `supabase/migrations/20260205130135_jobs_add_lifecycle_timestamps.sql`
   - Trigger: `jobs_lifecycle_trigger` BEFORE UPDATE
   - Sets `updated_at = now()` on every update
   - Sets `completed_at = now()` when status transitions INTO completed
   - Clears `completed_at` when status transitions OUT OF completed

4. **`request_job_schedule_public(p_token, p_requested_date, p_customer_note)`**
   - Location: `supabase/migrations/20260201000000_job_schedule_requests.sql`
   - Creates `job_schedule_requests` record with `status = 'requested'`
   - Requires quote to be accepted and have `converted_job_id`
   - Grants: `anon, authenticated`

5. **`approve_job_schedule_request(p_request_id)`**
   - Location: `supabase/migrations/20260201000000_job_schedule_requests.sql` (updated in `20260201000001_schedule_request_notifications.sql`, `20260203101500_add_schedule_request_logging.sql`)
   - Updates job: `service_date = requested_date`, `scheduled_end_date = requested_date`
   - Updates request: `status = 'approved'`, `approved_at = now()`, `approved_by = auth.uid()`
   - Sends email notifications
   - Grants: `authenticated`

6. **`decline_job_schedule_request(p_request_id, p_reason)`**
   - Location: `supabase/migrations/20260201000000_job_schedule_requests.sql` (updated in `20260201000001_schedule_request_notifications.sql`, `20260203101500_add_schedule_request_logging.sql`)
   - Updates request: `status = 'declined'`, `decline_reason = p_reason`
   - Sends email notifications
   - Grants: `authenticated`

### Frontend Pages & Components

1. **`src/pages/admin/RevenueHub.jsx`** (Lines 1-505)
   - Fetches: quotes, jobs, payments, customers, schedule_requests
   - Queues:
     - Quotes Needing Follow-up (sent, not expired, last_viewed > 3 days ago)
     - **Needs Scheduling** (jobs where `service_date IS NULL` AND status not completed/cancelled) - Line 272-290
     - Needs Invoicing (completed status AND `invoice_path IS NULL`) - Line 294-307
     - Balance Due (has invoice AND remaining balance > 0) - Line 311-333
   - Uses: `computeJobStage()`, `getNextAction()` from `revenuePipeline.js`

2. **`src/utils/revenuePipeline.js`** (Lines 1-219)
   - **`computeJobStage(job, paidTotal)`** (Lines 57-89)
     - Logic: `hasServiceDate = !!(job.service_date || job.scheduled_date)` - Line 63
     - Returns `JOB_NEEDS_SCHEDULING` if `!hasServiceDate` - Line 88
     - Returns `JOB_SCHEDULED` if `hasServiceDate` - Line 84
   - **`getNextAction({ quote, job, stage, hasScheduleRequest, hasInvoice, hasBalanceDue })`** (Lines 120-218)
     - For `JOB_NEEDS_SCHEDULING`: Returns "Review Schedule Request" if `hasScheduleRequest`, else "Schedule Job" - Lines 150-164

3. **`src/pages/admin/JobsNeedsScheduling.jsx`** (Lines 1-515)
   - Fetches: accepted quotes with `converted_job_id`, jobs where `assigned_team_id IS NULL`
   - **Issue:** Only shows jobs from accepted quotes, filters by `assigned_team_id IS NULL` (Line 95)
   - **Issue:** Does NOT filter by `service_date IS NULL` - could show already-scheduled jobs

4. **`src/pages/admin/ScheduleRequestsAdmin.jsx`** (Lines 1-363)
   - Fetches: `job_schedule_requests` where `status = 'requested'` - Line 57
   - Shows: requested_date, quote #, customer, services, requested_at, customer_note
   - Actions: Approve, Decline
   - **Correct:** Properly displays pending schedule requests

5. **`src/pages/public/PublicQuote.jsx`** (Lines 1-507)
   - Accept/Reject quote via `respond_to_quote_public()`
   - **Missing:** No UI for "Request Schedule Date" - customers cannot submit schedule requests from public quote page

6. **`src/pages/admin/JobsAdmin.jsx`**
   - Main jobs management page
   - Handles scheduling via form (Lines 757-765)
   - Filters: Overdue (service_date < today, not completed), Upcoming (service_date >= today) - Lines 315-340
   - **Issue:** Line 872 sets `completed_at: job.service_date` (should use `completed_at` column, not `service_date`)

7. **`src/pages/admin/ScheduleAdmin.jsx`**
   - Calendar view for scheduling
   - Uses `service_date` and `scheduled_end_date` correctly (handles NULLs)

---

## SECTION B: Findings

### ✅ What's Correct

1. **"Needs Scheduling" Detection Logic**
   - `revenuePipeline.js`: Correctly checks `!hasServiceDate` where `hasServiceDate = !!(job.service_date || job.scheduled_date)`
   - `RevenueHub.jsx`: Correctly filters `jobsNeedingScheduling` where `service_date IS NULL` AND status not completed/cancelled
   - Both use consistent logic

2. **Database Constraints**
   - `scheduled_end_date` can be NULL (migration `20260206000001`)
   - CHECK constraint `jobs_scheduled_end_date_gte_start` handles NULLs correctly
   - Trigger `jobs_set_default_end_date()` only sets end date if start date is provided

3. **Schedule Request Storage**
   - Stored in `job_schedule_requests` table with proper structure
   - Admin visibility: `ScheduleRequestsAdmin.jsx` correctly displays pending requests

4. **Lifecycle Timestamps**
   - `completed_at` is properly set/cleared by `jobs_lifecycle_trigger()`
   - `created_at` and `updated_at` are maintained

### ⚠️ Inconsistencies

1. **JobsNeedsScheduling.jsx Filtering**
   - **Problem:** Only shows jobs from accepted quotes (Line 66-67)
   - **Problem:** Filters by `assigned_team_id IS NULL` instead of `service_date IS NULL` (Line 95)
   - **Impact:** Jobs created directly (not from quotes) won't appear, and already-scheduled jobs might appear if unassigned

2. **RevenueHub vs JobsNeedsScheduling Logic Mismatch**
   - `RevenueHub`: Filters by `service_date IS NULL` (correct)
   - `JobsNeedsScheduling`: Filters by `assigned_team_id IS NULL` (incorrect)
   - **Impact:** Different jobs appear in each view

3. **"scheduled_date" vs "service_date" Naming**
   - `revenuePipeline.js` Line 63: Checks `job.scheduled_date` (legacy column name?)
   - All other code uses `service_date`
   - **Impact:** If `scheduled_date` doesn't exist, this check is harmless (returns false), but inconsistent

### ❌ Missing/Broken

1. **Public Quote "Request Schedule Date" UI Missing**
   - **Problem:** `PublicQuote.jsx` has no UI for customers to request a schedule date
   - **Impact:** Customers cannot submit schedule requests after accepting a quote
   - **Expected:** After accepting, show a form to request a schedule date that calls `request_job_schedule_public()`

2. **JobsAdmin.jsx completed_at Bug**
   - **Problem:** Line 872 sets `completed_at: job.service_date` (should be `job.completed_at`)
   - **Impact:** Wrong timestamp displayed/used

3. **RevenueHub Schedule Request Integration**
   - **Problem:** `RevenueHub.jsx` fetches schedule requests (Line 166) but only uses them to show "Review Schedule Request" button
   - **Missing:** No visual indicator in "Needs Scheduling" queue that a request exists
   - **Impact:** Admins might not notice pending requests

---

## SECTION C: Recommended Next 3 Changes

### Prompt #15: Fix JobsNeedsScheduling to Match RevenueHub Logic

**Goal:** Make `JobsNeedsScheduling.jsx` show the same jobs as RevenueHub "Needs Scheduling" queue.

**Changes:**
1. **File:** `src/pages/admin/JobsNeedsScheduling.jsx`
   - **Line 90-95:** Change query to filter by `service_date IS NULL` instead of `assigned_team_id IS NULL`
   - **Line 66-67:** Remove quote-only filter OR make it optional (show all jobs needing scheduling, not just from quotes)

**Exact Code Changes:**

```javascript
// OLD (Line 90-95):
const { data: jobsData, error: jobsError } = await supabase
  .from('jobs')
  .select('id, customer_id, service_date, scheduled_end_date, services_performed, status, assigned_team_id')
  .in('id', jobIds)
  .is('assigned_team_id', null);

// NEW:
const { data: jobsData, error: jobsError } = await supabase
  .from('jobs')
  .select('id, customer_id, service_date, scheduled_end_date, services_performed, status, assigned_team_id')
  .eq('company_id', companyId)
  .is('service_date', null)
  .not('status', 'in', '(Completed,Canceled)');
```

**Also update Line 61-88:** Remove quote dependency, fetch all jobs needing scheduling:

```javascript
// Replace quote-based fetching with direct job query
const { data: jobsData, error: jobsError } = await supabase
  .from('jobs')
  .select('id, customer_id, service_date, scheduled_end_date, services_performed, status, assigned_team_id, converted_job_id')
  .eq('company_id', companyId)
  .is('service_date', null)
  .not('status', 'in', '(Completed,Canceled)')
  .order('created_at', { ascending: true });

// Then fetch quotes for jobs that have converted_job_id
const jobIdsWithQuotes = (jobsData || []).map(j => j.converted_job_id).filter(Boolean);
if (jobIdsWithQuotes.length > 0) {
  // Fetch quotes where id IN jobIdsWithQuotes
}
```

**Verification:**
```sql
-- Should return same jobs as RevenueHub "Needs Scheduling"
SELECT id, customer_id, service_date, status, created_at
FROM jobs
WHERE company_id = '<your_company_id>'
  AND service_date IS NULL
  AND status NOT IN ('Completed', 'Canceled')
ORDER BY created_at ASC;
```

---

### Prompt #16: Add "Request Schedule Date" to Public Quote Receipt Page

**Goal:** Allow customers to request a schedule date after accepting a quote.

**Changes:**
1. **File:** `src/pages/public/PublicQuoteReceipt.jsx` (or create if doesn't exist)
   - Add form: Date picker + optional note
   - Call `request_job_schedule_public(p_token, p_requested_date, p_customer_note)`
   - Show success message and disable form after submission

2. **File:** `src/pages/public/PublicQuote.jsx` (if receipt page doesn't exist)
   - After successful accept, show schedule request form before redirecting to receipt
   - OR redirect to receipt with schedule request form

**Exact Code Changes:**

Create/Update `src/pages/public/PublicQuoteReceipt.jsx`:

```jsx
// Add state
const [requestingSchedule, setRequestingSchedule] = useState(false);
const [scheduleDate, setScheduleDate] = useState('');
const [scheduleNote, setScheduleNote] = useState('');
const [scheduleSubmitted, setScheduleSubmitted] = useState(false);

// Add handler
const handleRequestSchedule = async () => {
  if (!scheduleDate) {
    toast.error('Please select a date');
    return;
  }
  
  setRequestingSchedule(true);
  try {
    const { data, error } = await supabase.rpc('request_job_schedule_public', {
      p_token: token,
      p_requested_date: scheduleDate,
      p_customer_note: scheduleNote || null
    });
    
    if (error) throw error;
    
    if (data?.ok === true) {
      toast.success('Schedule request submitted! We will confirm shortly.');
      setScheduleSubmitted(true);
    } else {
      toast.error(data?.reason || 'Failed to submit request');
    }
  } catch (err) {
    console.error('Error requesting schedule:', err);
    toast.error(err.message || 'Failed to submit schedule request');
  } finally {
    setRequestingSchedule(false);
  }
};

// Add UI (after quote acceptance message)
{isAccepted && !scheduleSubmitted && (
  <Card className="bg-blue-50 border-blue-200 mt-6">
    <h3 className="text-lg font-semibold text-slate-900 mb-4">
      Request a Schedule Date
    </h3>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Preferred Date <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={scheduleDate}
          onChange={(e) => setScheduleDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          disabled={requestingSchedule}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          value={scheduleNote}
          onChange={(e) => setScheduleNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          placeholder="Any special instructions or preferences..."
          disabled={requestingSchedule}
        />
      </div>
      <Button
        onClick={handleRequestSchedule}
        variant="primary"
        disabled={requestingSchedule || !scheduleDate}
      >
        {requestingSchedule ? 'Submitting...' : 'Submit Request'}
      </Button>
    </div>
  </Card>
)}
```

**Verification:**
1. Accept a quote via public link
2. On receipt page, fill schedule request form
3. Submit and verify success message
4. Check `job_schedule_requests` table:
```sql
SELECT id, job_id, requested_date, customer_note, status, created_at
FROM job_schedule_requests
WHERE status = 'requested'
ORDER BY created_at DESC
LIMIT 5;
```

---

### Prompt #17: Fix JobsAdmin completed_at Bug + Add Schedule Request Indicators

**Goal:** Fix timestamp bug and improve visibility of pending schedule requests.

**Changes:**
1. **File:** `src/pages/admin/JobsAdmin.jsx`
   - **Line 872:** Change `completed_at: job.service_date` to `completed_at: job.completed_at`

2. **File:** `src/pages/admin/RevenueHub.jsx`
   - Add visual indicator in "Needs Scheduling" queue when a schedule request exists
   - Show badge/icon next to job row if `scheduleRequestByJobId[job.id]` exists

**Exact Code Changes:**

**JobsAdmin.jsx Line 872:**
```javascript
// OLD:
completed_at: job.service_date,

// NEW:
completed_at: job.completed_at,
```

**RevenueHub.jsx (add after Line 410, in renderJobRow):**
```jsx
// Add schedule request indicator
{hasScheduleRequest && (
  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
    Schedule Request Pending
  </span>
)}
```

**Also enhance the job row display (around Line 393-404):**
```jsx
<div className="flex-1 min-w-0">
  <div className="font-medium text-slate-900 flex items-center gap-2">
    {customer?.full_name || '—'} • {job.services_performed || 'Job'}
    {hasScheduleRequest && (
      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-normal">
        Schedule Request
      </span>
    )}
  </div>
  {/* rest of row */}
</div>
```

**Verification:**
1. Create a schedule request via public quote
2. Check RevenueHub "Needs Scheduling" queue - should show "Schedule Request" badge
3. Check JobsAdmin - completed_at should show correct timestamp (not service_date)

---

## SECTION D: Verification Checklist

### SQL Queries

1. **Verify "Needs Scheduling" Jobs:**
```sql
SELECT 
  j.id, 
  j.service_date, 
  j.scheduled_end_date, 
  j.status, 
  j.created_at,
  q.quote_number,
  q.status as quote_status
FROM jobs j
LEFT JOIN quotes q ON q.converted_job_id = j.id
WHERE j.company_id = '<your_company_id>'
  AND j.service_date IS NULL
  AND j.status NOT IN ('Completed', 'Canceled')
ORDER BY j.created_at ASC;
```

2. **Verify Schedule Requests:**
```sql
SELECT 
  jsr.id,
  jsr.job_id,
  jsr.requested_date,
  jsr.customer_note,
  jsr.status,
  jsr.created_at,
  j.service_date as current_job_service_date,
  q.quote_number
FROM job_schedule_requests jsr
JOIN jobs j ON j.id = jsr.job_id
LEFT JOIN quotes q ON q.id = jsr.quote_id
WHERE jsr.company_id = '<your_company_id>'
  AND jsr.status = 'requested'
ORDER BY jsr.created_at DESC;
```

3. **Verify completed_at Timestamps:**
```sql
SELECT 
  id,
  status,
  service_date,
  completed_at,
  created_at,
  updated_at
FROM jobs
WHERE company_id = '<your_company_id>'
  AND status IN ('Completed', 'Complete', 'Done')
ORDER BY completed_at DESC NULLS LAST
LIMIT 10;
```

### UI Scenarios

1. **Quote Acceptance → Needs Scheduling:**
   - Create quote, send via email
   - Open public link, accept quote
   - Verify job appears in RevenueHub → "Needs Scheduling"
   - Verify job has `service_date = NULL` in database

2. **Schedule Request Submission:**
   - Accept quote via public link
   - On receipt page, submit schedule request
   - Verify request appears in ScheduleRequestsAdmin
   - Verify RevenueHub shows "Schedule Request" badge

3. **Schedule Request Approval:**
   - Approve schedule request in ScheduleRequestsAdmin
   - Verify job `service_date` and `scheduled_end_date` are set
   - Verify job moves from "Needs Scheduling" to "Scheduled" in RevenueHub

4. **JobsNeedsScheduling Consistency:**
   - Verify same jobs appear in RevenueHub "Needs Scheduling" and JobsNeedsScheduling page
   - Both should filter by `service_date IS NULL`

---

## Summary

**Critical Issues:**
1. JobsNeedsScheduling uses wrong filter (assigned_team_id instead of service_date)
2. Public quote receipt missing schedule request UI
3. JobsAdmin completed_at bug

**Recommended Priority:**
1. **Prompt #15** (Fix JobsNeedsScheduling) - High priority, affects admin workflow
2. **Prompt #16** (Add schedule request UI) - High priority, customer-facing feature
3. **Prompt #17** (Fix bugs + indicators) - Medium priority, polish and bug fixes

**Estimated Impact:**
- Prompt #15: Fixes inconsistency between two admin views
- Prompt #16: Enables customer self-service scheduling
- Prompt #17: Improves UX and fixes data accuracy bug
