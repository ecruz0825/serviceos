# Recurring Jobs System — Full Audit Report

**Date:** 2025-03-16  
**Mode:** Read-only investigation. No code changes. No fixes implemented.

---

## A. Exact Files Inspected

### Database / migrations
- `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql` — RPC definition
- `supabase/migrations/20260317000001_fix_generate_jobs_ambiguous_columns.sql` — RPC column fix
- `supabase/migrations/20260322000000_add_billing_enforcement_to_priority1_rpcs.sql` — billing check in RPC
- `supabase/migrations/20260315000005_rls_recurring_jobs_tenant_isolation.sql` — RLS for `recurring_jobs`
- `supabase/migrations/20260127000002_ab10_recurring_jobs_default_team_id.sql` — `default_team_id` + backfill
- `supabase/migrations/20260310080006_enforce_monthly_job_plan_limit.sql` — job limit trigger
- `supabase/migrations/20260310080003_get_company_plan_usage.sql` — plan usage helper
- `supabase/migrations/20260315000006_rls_jobs_tenant_isolation.sql` — jobs RLS (reference)

### Admin UI
- `src/pages/admin/RecurringJobsAdmin.jsx` — Recurring Jobs page (list, create, delete, pause/resume, inline generation)
- `src/pages/admin/SchedulingCenterAdmin.jsx` — Scheduling Center (RPC trigger, recurring fetch, gaps, generate button)
- `src/pages/admin/JobIntelligenceAdmin.jsx` — recurring fetch, “missing job” attention
- `src/pages/admin/CustomersAdmin.jsx` — recurring preview per customer
- `src/pages/admin/JobsAdmin.jsx` — `recurring_job_id` in product event
- `src/pages/admin/Settings.jsx` — `auto_generate_recurring_jobs` load/save
- `src/AdminDashboard.jsx` — dashboard + `generateScheduledJobsOncePerDay` on load

### Utilities / hooks
- `src/utils/jobGenerators.js` — `generateScheduledJobsOncePerDay`, `getNextDate`
- `src/hooks/useCompanySettings.js` — `auto_generate_recurring_jobs` in settings

### Edge function
- `supabase/functions/auto-generate-recurring-jobs/index.ts` — scheduled auto-generation (30-day window)

### Routing / nav
- `src/App.jsx` — route `/admin/recurring-jobs`
- `src/components/nav/navConfig.js` — nav entry
- `src/components/nav/Topbar.jsx` — breadcrumb
- `src/Navbar.jsx` — link

---

## B. Database / Schema Summary

### Table: `recurring_jobs` (inferred from migrations and code; no `CREATE TABLE` in audited migrations)

| Column / object | Type / purpose |
|-----------------|----------------|
| `id` | uuid, PK (inferred) |
| `company_id` | uuid, company scope |
| `customer_id` | uuid, FK to customers |
| `start_date` | date, first occurrence |
| `recurrence_type` | text — `'weekly' \| 'biweekly' \| 'monthly'` |
| `last_generated_date` | date, nullable — last date a job was generated for this template |
| `services_performed` | text |
| `job_cost` | numeric |
| `is_paused` | boolean |
| `default_team_id` | uuid, nullable, FK to teams (added in 20260127000002) |
| `default_crew_id` | referenced in backfill comment; legacy, not written by current code |
| `created_by` | uuid, set on insert in RecurringJobsAdmin |

**Constraints / indexes (from migrations):**
- RLS enabled. Policies: `recurring_jobs_select_admin`, `recurring_jobs_insert_admin`, `recurring_jobs_update_admin`, `recurring_jobs_delete_admin` — all **admin-only**.
- `recurring_jobs_default_team_id_fkey` — FK to `teams(id)` ON DELETE SET NULL.
- `idx_recurring_jobs_default_team_id` on `default_team_id`.

**Missing or weak from a robustness perspective:**
- No unique constraint on `(recurrence_type)` values; invalid strings are skipped in RPC but not enforced.
- No check constraint on `start_date` (e.g. not future-only if desired).
- No explicit index for “due” queries (e.g. `company_id, is_paused, last_generated_date`).
- No `end_date` or “max occurrences” for templates.
- No `timezone` or time-of-day; all logic is date-only (server/local date).

### Table: `jobs` (recurring-related)

- `recurring_job_id` — uuid, nullable, set when job is created from a recurring template.
- `assigned_team_id` — set from `recurring_jobs.default_team_id` by RPC and RecurringJobsAdmin; not set by edge function or `jobGenerators.js`.
- `BEFORE INSERT` trigger `trg_enforce_monthly_job_plan_limit` — applies to all job inserts (including recurring); can raise `JOB_LIMIT_REACHED`.

### Companies

- `companies.auto_generate_recurring_jobs` — boolean, used by edge function and Settings/useCompanySettings. No migration that adds this column was found in the audited set; assumed present in DB.

---

## C. Current Recurring-Job Workflow Summary

### A. How a recurring job is created

1. **Recurring Jobs admin page** (`RecurringJobsAdmin.jsx`): operator picks customer, start date, frequency, services, cost, optional team, clicks “Add Recurring Job”.
2. Insert into `recurring_jobs` with `company_id`, `customer_id`, `start_date`, `recurrence_type`, `services_performed`, `job_cost`, `created_by`, `last_generated_date: null`, `is_paused: false`, `default_team_id`.
3. **RLS:** Only **admin** can insert; INSERT policy also requires customer in same company.
4. **No server-side validation** of recurrence type or start date; invalid types are skipped later during generation.

### B. How next scheduled date is calculated

- **RPC / SchedulingCenter / JobIntelligence:**  
  `next = last_generated_date ?? start_date`; then advance by interval (weekly/biweekly/monthly) until `next > today`; return that date (YYYY-MM-DD). Correct for “next occurrence” once jobs have been generated.
- **RecurringJobsAdmin (preview in form):**  
  Same “advance from start until > today” but **does not use `last_generated_date`** — preview is correct only before any generation.
- **RecurringJobsAdmin table column “Next Scheduled”:**  
  Uses `getNextScheduledDatePreview(start_date, recurrence_type)` **without `last_generated_date`** — so for templates that have already generated, the shown “Next Scheduled” is **wrong** (shows next from `start_date`, not from `last_generated_date`).
- **jobGenerators.js `getNextDate`:**  
  Advances from `start_date` until > today, then **steps back one interval** to “current period” and returns that date. **Does not use `last_generated_date`** — logic is inconsistent with RPC and can cause duplicate/missed semantics if mixed with other paths.
- **Edge function:**  
  Iterates from `start_date`, skips until `cursor >= today`, then fills next 30 days. Does not use `last_generated_date` and does not update it.

### C. How actual jobs are generated from the template

**Four separate code paths:**

1. **RecurringJobsAdmin.jsx (useEffect on mount)**  
   - Fetches `recurring_jobs` for company, `is_paused = false`.  
   - For each: `nextDate = last_generated_date ?? start_date` + one interval (weekly/biweekly/monthly).  
   - If `nextDate <= today`: **inserts one job** (customer_id, company_id, service_date, services_performed, job_cost, recurring_job_id, assigned_team_id), then updates `recurring_jobs.last_generated_date = nextDate`.  
   - **No duplicate check** — relies on advancing `last_generated_date` so next run sees a later nextDate. If two tabs load or run in same day, **duplicate jobs possible** for same (recurring_job_id, service_date).  
   - **Billing / limits:** No check; monthly limit enforced only by DB trigger on `jobs` insert.

2. **SchedulingCenterAdmin.jsx (button “Generate jobs”)**  
   - Calls `supabase.rpc('generate_jobs_from_recurring')`.  
   - **RPC:** For each active recurring job, computes single “next due” date (using `last_generated_date`). If that date ≤ today, checks for existing job `(recurring_job_id, service_date)`; if none, inserts one job, sets `last_generated_date`, returns.  
   - **Duplicate protection:** Yes (EXISTS check).  
   - **Billing:** RPC checks `companies.subscription_status`; if unpaid/canceled, raises `BILLING_READ_ONLY`.  
   - **Limits:** Proactive UI check via `usePlanLimits`; actual insert still subject to `trg_enforce_monthly_job_plan_limit`.

3. **AdminDashboard.jsx (useEffect on load)**  
   - When `companyId` is set, fetches `recurring_jobs` (company, not paused) and calls `generateScheduledJobsOncePerDay(jobs)`.  
   - **Does not** read `companies.auto_generate_recurring_jobs` — runs on every dashboard load for every company.  
   - **jobGenerators.js:** For each template, `dueDate = getNextDate(start_date, type)` (ignores `last_generated_date`). If `dueDate === today` and `last_generated_date !== today`, inserts one job and sets `last_generated_date = today`.  
   - **Duplicate risk:** `getNextDate` can disagree with RPC/RecurringJobsAdmin (e.g. “step back” logic); plus no DB-level duplicate check — **duplicates possible**.  
   - **Team/copy:** Insert copies `services_performed` and `job_cost` from template but does **not** set `assigned_team_id`.

4. **Edge function `auto-generate-recurring-jobs`**  
   - Invoked by **cron/scheduler** (exact schedule not in repo).  
   - Loads companies with `auto_generate_recurring_jobs = true`.  
   - Loads recurring_jobs where `is_paused = false` and company in that set.  
   - For each template: from `start_date`, advance until `cursor >= today`, then for each date in [today, today+30] check for existing job `(recurring_job_id, service_date)`; if none, insert job.  
   - **Does not** update `recurring_jobs.last_generated_date` — so RPC and client “next due” logic are out of sync after edge runs.  
   - **Does not** set `assigned_team_id`, `services_performed`, `job_cost` from template — uses fixed “Recurring service” and 0.  
   - **Billing/limits:** No check; uses service role. Monthly limit enforced by trigger; one failed insert could fail the whole request depending on error handling.  
   - **Duplicate protection:** Per (recurring_job_id, service_date) before insert — yes.

### D. How pause/resume works

- **RecurringJobsAdmin:** Toggle “Pause” / “Resume” calls `update recurring_jobs set is_paused = !job.is_paused where id = job.id`.  
- **RPC / edge / dashboard:** All filter `is_paused = false` when selecting recurring jobs to generate.  
- **RLS:** Only admin can UPDATE recurring_jobs.  
- Pause is respected by all generation paths; no separate “paused at” timestamp or audit.

### E. How deletion works

- **RecurringJobsAdmin:** “Delete” → `delete from recurring_jobs where id = id`.  
- **RLS:** Only admin can DELETE.  
- **Generated jobs:** No cascade or cleanup. Rows in `jobs` keep `recurring_job_id` pointing to the deleted template (FK behavior not confirmed; if no ON DELETE, they become orphaned references).  
- No soft-delete; no “deleted_at” or history.

### F. How assigned team flows into generated jobs

- **RPC:** Inserts with `assigned_team_id = v_recurring_job.default_team_id`.  
- **RecurringJobsAdmin inline generation:** Same — `assigned_team_id: job.default_team_id || null`.  
- **jobGenerators.js:** Insert does **not** set `assigned_team_id` — generated jobs are unassigned.  
- **Edge function:** Does **not** set `assigned_team_id` — generated jobs are unassigned.  
- If `default_team_id` references a deleted team, FK on `recurring_jobs` is ON DELETE SET NULL; RPC would then insert `assigned_team_id = null`. Jobs table FK behavior for `assigned_team_id` not re-checked here.

### G. How customer/job history reflects recurring jobs

- **Jobs:** `recurring_job_id` is set when created from a template; JobsAdmin logs `recurring_job_id` in product event.  
- **Customer detail (CustomersAdmin):** Fetches `recurring_jobs` for `customer_id`, computes “next” dates (without `last_generated_date` in the helper), shows as “recurring preview” dates.  
- **Job Intelligence / Scheduling Center:** Use `recurring_job_id` and `service_date` to detect “missing” generated jobs (recurring due in window but no job row).  
- No dedicated “jobs created from this recurring template” view or link from Recurring Jobs admin.

---

## D. What Works Well Already

- **RPC `generate_jobs_from_recurring`:** Single “next due” per template, duplicate check, billing gate, company-scoped, updates `last_generated_date`, copies team/services/cost.  
- **Scheduling Center:** Clear “Generate jobs” button, plan limit check, good error handling and refresh after RPC.  
- **Duplicate protection in RPC and edge function:** Prevents double-create for (recurring_job_id, service_date) when those paths are used alone.  
- **Monthly job limit:** Enforced for all job inserts (recurring and ad hoc) via trigger.  
- **RLS on recurring_jobs:** Company-scoped, admin-only; INSERT validates customer in company.  
- **Pause:** Single flag, respected everywhere.  
- **Recurring Jobs UI:** Create form with customer, start date, frequency, services, cost, optional team; list with Pause/Resume and Delete.  
- **Settings:** `auto_generate_recurring_jobs` is persisted and used by the edge function (when cron runs).  
- **Job Intelligence / Scheduling Center:** Surfaces “recurring due but no job” gaps.

---

## E. What Is Weak or Confusing Today

- **Four different generation paths** with different rules (who runs, duplicate check, last_generated_date, team/copy, billing). Operators cannot rely on a single “source of truth” for when and how jobs are created.  
- **RecurringJobsAdmin “Next Scheduled” column** ignores `last_generated_date` — misleading after first generation.  
- **RecurringJobsAdmin runs inline generation on every page load** — no button, no billing/limit check, weak duplicate protection; can create duplicates with multiple loads/tabs.  
- **AdminDashboard** runs `generateScheduledJobsOncePerDay` on every load and **ignores `auto_generate_recurring_jobs`** — setting has no effect on dashboard behavior.  
- **jobGenerators.js** uses different next-date logic and does not set `assigned_team_id`; duplicates possible.  
- **Edge function** does not update `last_generated_date` and does not set team/services/cost — mixed behavior when combined with RPC or client.  
- **Manager/dispatcher:** RPC allows them to run generation, but RLS on `recurring_jobs` is admin-only — they cannot see recurring templates on Scheduling Center (empty list); they can only trigger RPC.  
- **No edit flow** for a recurring job (frequency, start date, services, cost, team) — only add and delete.  
- **No link** from Recurring Jobs admin to “jobs created from this template” or to customer detail.  
- **Companies.auto_generate_recurring_jobs** is not used by dashboard; only by edge function.  
- **Timezone:** All logic is date-only (CURRENT_DATE / local date); no explicit timezone for “today” or for templates — potential boundary issues for global or multi-TZ companies.

---

## F. Biggest Technical Risks

1. **Duplicate jobs** from RecurringJobsAdmin (inline) or AdminDashboard + jobGenerators when used alongside RPC or edge (different “next” logic, no DB duplicate check in client paths).  
2. **Race conditions** — multiple tabs or rapid reloads on RecurringJobsAdmin or dashboard can double-insert for same (recurring_job_id, service_date).  
3. **Edge function vs RPC/UI divergence** — edge does not update `last_generated_date` and does not set team/services/cost; if both run, data and “next due” can be inconsistent.  
4. **Orphaned / invalid references** — recurring_jobs with deleted customer (if soft-delete) or invalid team; RPC will still read and try to insert (FK on jobs may catch invalid customer_id). No explicit “template validity” check before generation.  
5. **Billing bypass** — RecurringJobsAdmin and AdminDashboard generation do not check subscription; only RPC and (implicitly) trigger do. Edge uses service role and does not check billing.  
6. **Plan limit** — Recurring generation can hit `JOB_LIMIT_REACHED` mid-batch (RPC or edge); partial success and unclear operator feedback.

---

## G. Biggest UX / Product Gaps

1. **“Next Scheduled” wrong** on Recurring Jobs list after any generation (does not use `last_generated_date`).  
2. **No edit** for existing recurring job (change frequency, start, services, cost, team).  
3. **No visibility** of “jobs created from this recurring schedule” from the Recurring Jobs page.  
4. **Manager/dispatcher** can trigger generation but cannot see or manage recurring templates (RLS admin-only).  
5. **Unclear when jobs are created** — page load vs button vs cron; no single explanation in UI.  
6. **Auto-generate setting** only affects edge cron; dashboard still runs its own generation and ignores the setting.  
7. **Empty state / first-time** — Recurring Jobs empty state is fine; no “preview next 3 dates” or “how generation works” in UI.  
8. **No “recurring” filter or badge** on Jobs list (e.g. “from recurring”) for quick scan.

---

## H. Most Important Improvements (Ranked High → Low)

1. **Single generation path** — Use one mechanism (prefer RPC) for “create jobs from recurring”; remove or disable inline generation in RecurringJobsAdmin and dashboard; have edge function call RPC or mirror its logic and update `last_generated_date`.  
2. **Fix “Next Scheduled”** on Recurring Jobs list to use `last_generated_date` (same logic as SchedulingCenter/JobIntelligence).  
3. **Duplicate protection** — Ensure every generation path either calls the RPC or performs an equivalent “exists (recurring_job_id, service_date)” check before insert.  
4. **Respect `auto_generate_recurring_jobs`** in AdminDashboard — do not run client-side generation when the setting is false; or remove dashboard generation and rely on RPC + edge.  
5. **Edge function alignment** — Update `last_generated_date` (or call RPC); copy `default_team_id`, `services_performed`, `job_cost` into generated jobs; optionally add billing/limit check before batch.  
6. **Edit recurring job** — Allow editing frequency, start date, services, cost, team without deleting and re-adding.  
7. **Link “jobs from this template”** — From Recurring Jobs admin, show or link to jobs where `recurring_job_id = id`.  
8. **RLS for manager/dispatcher** — Allow SELECT (and optionally UPDATE for pause) on `recurring_jobs` for manager/dispatcher so Scheduling Center and generation UX are consistent.  
9. **Recurring Jobs creation** — Check billing and plan limits before insert (e.g. no new recurring if at limit), and surface clear errors.  
10. **End date / cap** — Optional `end_date` or max occurrences for a template to avoid unbounded generation.

---

## I. Which Improvements Are Safe to Do Surgically

- **Fix “Next Scheduled”** in RecurringJobsAdmin (use `last_generated_date` in preview and in table column) — UI-only, no schema change.  
- **Remove or gate RecurringJobsAdmin inline generation** — e.g. remove the useEffect that generates on load, or replace with a single “Generate now” button that calls the RPC; reduces duplicates and aligns behavior.  
- **Respect `auto_generate_recurring_jobs` in AdminDashboard** — only run `generateScheduledJobsOncePerDay` when setting is true; or remove that call and rely on RPC/edge.  
- **Add duplicate check** to RecurringJobsAdmin if keeping client-side generation — before insert, query jobs for (recurring_job_id, nextDate); skip if exists.  
- **Edge function: copy team and template fields** — add `assigned_team_id`, `services_performed`, `job_cost` from recurring_jobs to insert; no RLS/schema change.  
- **Edge function: update `last_generated_date`** — after inserting for a date, update `recurring_jobs.last_generated_date` to that date (or max date generated in the run) for each template — keeps “next due” consistent with RPC.

---

## J. KEEP / FIX / REJECT

- **KEEP:**  
  - RPC `generate_jobs_from_recurring` as the canonical generation path.  
  - Scheduling Center “Generate jobs” button and its flow.  
  - RLS and company scoping on recurring_jobs.  
  - Pause, monthly limit trigger, and billing check in RPC.  
  - Recurring Jobs page for create/list/pause/delete and Settings toggle for auto-generate.

- **FIX:**  
  - RecurringJobsAdmin “Next Scheduled” and preview to use `last_generated_date`.  
  - RecurringJobsAdmin inline generation (remove or replace with RPC + duplicate-safe behavior).  
  - AdminDashboard generation to respect `auto_generate_recurring_jobs` or be removed.  
  - jobGenerators.js either removed from dashboard path or aligned with RPC (next-date + duplicate check + team).  
  - Edge function to update `last_generated_date` and to set team/services/cost.  
  - Manager/dispatcher visibility of recurring_jobs (policy or read-only view) if product intent is that they can trigger generation.

- **REJECT (as-is):**  
  - Keeping four independent generation implementations with different semantics.  
  - Leaving “Next Scheduled” and dashboard generation as-is without fixing or removing.

---

**End of audit.**
