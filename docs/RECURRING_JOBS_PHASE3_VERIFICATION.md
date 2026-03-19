# Recurring Jobs Architecture Cleanup — Phase 3 Verification

**Date:** Phase 3 execution  
**Scope:** Dead code removal, migration/RPC validation, code-level verification, drift audit, live test checklist.

---

## A. Exact Files Changed

| File | Change |
|------|--------|
| **`src/utils/jobGenerators.js`** | **Deleted.** Had no remaining callers after Phase 1 (AdminDashboard no longer imports it). Contained `generateScheduledJobsOncePerDay` and `getNextDate`; was the only client-side recurring generation path that inserted into `jobs` and updated `recurring_jobs.last_generated_date`. |

No other files were modified in Phase 3. Migrations and edge function from Phase 2 are unchanged.

---

## B. Dead Code Removed

**Yes.** `src/utils/jobGenerators.js` was removed.

- **Pre-deletion:** No imports of `jobGenerators` or `generateScheduledJobsOncePerDay` in any `src` file (Phase 1 had already removed the only consumer in AdminDashboard).
- **Post-deletion:** No references to `jobGenerators.js` in application code. References in docs (e.g. `RECURRING_JOBS_AUDIT.md`, `RECURRING_JOBS_GENERATION_PATHS_AUDIT.md`) are historical only.

---

## C. No Remaining Non-Canonical Recurring Generation Paths

**Verified.** All recurring job generation that creates rows in `jobs` from recurring templates now goes through one of two DB functions:

| Path | Entry point | Creates jobs via |
|------|-------------|-------------------|
| **Manual** | SchedulingCenterAdmin button | `supabase.rpc('generate_jobs_from_recurring')` → DB only |
| **Scheduled** | Edge function (cron/POST) | `supabase.rpc('generate_jobs_from_recurring_for_company', { p_company_id })` → DB only |

**Checked:**

- **`jobs.insert` in src:** Only in CustomersAdmin (one-off job), JobsAdmin (create/edit job), CustomerDashboard (one-off). None set `recurring_job_id` as part of a “recurring generation” flow.
- **`recurring_job_id` in src:** Only used for: selecting/displaying jobs (SchedulingCenter, JobIntelligence), product event (JobsAdmin), and previously jobGenerators (deleted). No remaining client-side insert into `jobs` with `recurring_job_id`.
- **`generate_jobs_from_recurring`:** Only invoked in SchedulingCenterAdmin.jsx (line 344) as `supabase.rpc('generate_jobs_from_recurring')`.
- **`generate_jobs_from_recurring_for_company`:** Only invoked in the edge function `auto-generate-recurring-jobs/index.ts` with `p_company_id`.

**Conclusion:** There are no remaining non-canonical recurring generation paths (no client or edge direct-insert from recurring templates).

---

## D. Manual vs Scheduled Path Verification

### Manual path

- **File:** `src/pages/admin/SchedulingCenterAdmin.jsx`
- **Trigger:** User clicks “Generate Scheduled Jobs” (or equivalent) button.
- **Call:** `await supabase.rpc('generate_jobs_from_recurring')`.
- **DB:** `public.generate_jobs_from_recurring()` — no arguments; uses `auth.uid()` → profile → `company_id`; role gate (admin/manager/dispatcher); billing check; loops `recurring_jobs` for that company; duplicate check; insert into `jobs`; update `last_generated_date`; returns table.
- **Status:** Unchanged and correct.

### Scheduled path

- **File:** `supabase/functions/auto-generate-recurring-jobs/index.ts`
- **Trigger:** Cron or HTTP POST.
- **Flow:** Load companies with `auto_generate_recurring_jobs = true`; for each company call `supabase.rpc('generate_jobs_from_recurring_for_company', { p_company_id: company.id })`; aggregate `createdJobs` from returned rows where `created === true`.
- **DB:** `public.generate_jobs_from_recurring_for_company(p_company_id uuid)` — company from parameter; billing check; same loop/duplicate-check/insert/update logic as user RPC; granted to `service_role` only.
- **Status:** Uses canonical DB logic only; no direct edge inserts.

### Coexistence

- **User RPC:** `generate_jobs_from_recurring()` — for authenticated UI; company from profile.
- **Company RPC:** `generate_jobs_from_recurring_for_company(p_company_id)` — for service-role (edge); company from argument.
- Both use the same core logic (next-date from `last_generated_date`/start_date, duplicate check, team/services/cost copy, `last_generated_date` update). No conflict; no duplication of generation logic outside the DB.

---

## E. Live Test Checklist

Use this to validate behavior after deployment.

### 1. Create template

- [ ] Recurring Jobs page: create a recurring job (customer, start date, frequency, services, cost, optional team).
- [ ] Template appears in list with Status Active, correct Next Scheduled, Team (if set).
- [ ] No jobs created yet for future dates (only “next due” ≤ today will generate).

### 2. Manual generate

- [ ] Go to Scheduling Center.
- [ ] Click “Generate Scheduled Jobs” (or equivalent).
- [ ] For a template whose next due is today (or past), a job is created.
- [ ] New job appears in jobs list with correct customer, service date, services, cost, assigned team (if set on template), and `recurring_job_id` set.
- [ ] Recurring Jobs list “Next Scheduled” for that template advances (uses `last_generated_date`).

### 3. Duplicate prevention

- [ ] With a template whose next due is today and already generated once, click “Generate Scheduled Jobs” again.
- [ ] No second job is created for the same (recurring_job_id, service_date).
- [ ] UI shows “No new jobs to generate” or similar when nothing was due or all due already had jobs.

### 4. Scheduled generate (edge)

- [ ] Set `companies.auto_generate_recurring_jobs = true` for a test company that has an active recurring template with next due ≤ today.
- [ ] Invoke the edge function (POST to `auto-generate-recurring-jobs` with service role or cron).
- [ ] Response: `ok: true`, `createdJobs` ≥ 0, `companiesProcessed` ≥ 1, `perCompany` with counts.
- [ ] For that company, a job exists for the template’s next due date; `recurring_jobs.last_generated_date` updated.
- [ ] Re-run edge: no duplicate job for same date; `createdJobs` for that company 0 for that run (or only for other due templates).

### 5. Pause behavior

- [ ] Recurring Jobs: pause a template.
- [ ] Manual generate (Scheduling Center): no job created for that template.
- [ ] Scheduled run (edge): no job created for that template (RPC filters `is_paused = false`).
- [ ] Resume template; next due still correct; generate again creates job when due.

### 6. Team/cost propagation

- [ ] Create recurring template with assigned team and non-zero cost.
- [ ] Generate (manual or scheduled) for a due date.
- [ ] Created job has `assigned_team_id` and `job_cost` (and `services_performed`) matching the template.

### 7. `last_generated_date` update

- [ ] After generating for a template, open Recurring Jobs list (or DB).
- [ ] That template’s `last_generated_date` is set to the service_date that was just generated.
- [ ] “Next Scheduled” column shows the following occurrence (e.g. +7 days for weekly), not the same date again.

---

## F. Migration and RPC Validation

### New migration

- **File:** `supabase/migrations/20260325000000_generate_jobs_from_recurring_for_company.sql`
- **Objects:** References `public.companies`, `public.recurring_jobs`, `public.jobs` — all existing.
- **Function:** `public.generate_jobs_from_recurring_for_company(p_company_id uuid)` — RETURNS TABLE, SECURITY DEFINER, same logic as user RPC; billing check; duplicate check; insert with team/cost/services; update `last_generated_date`.
- **Grant:** `GRANT EXECUTE ... TO service_role` only.
- **Conclusion:** Migration is consistent with schema and intent.

### Both RPCs

- **`generate_jobs_from_recurring()`** — defined in earlier migrations (e.g. 20260322000000), granted to `authenticated`. Unchanged in Phase 2/3.
- **`generate_jobs_from_recurring_for_company(p_company_id uuid)`** — defined in 20260325000000, granted to `service_role`. Used only by edge.
- Coexistence confirmed; no naming or signature conflict.

---

## G. Drift Audit (Remaining References)

| Search | Where found | Purpose | Suspicious? |
|--------|-------------|---------|-------------|
| `recurring_job_id` | SchedulingCenterAdmin, JobIntelligenceAdmin | Select/display jobs, gap detection | No |
| `recurring_job_id` | JobsAdmin | Product event payload | No |
| `generate_jobs_from_recurring` | SchedulingCenterAdmin | RPC call (manual path) | No |
| `generate_jobs_from_recurring_for_company` | Edge function, migration, docs | RPC call (scheduled path) / definition / docs | No |
| `auto_generate_recurring_jobs` | Settings, useCompanySettings, edge | Load/save setting; edge filters companies | No |
| `jobs.insert` | CustomersAdmin, JobsAdmin, CustomerDashboard | One-off job creation | No (not recurring generation) |

No remaining suspicious or duplicate recurring-generation paths.

---

## H. KEEP / FIX / REJECT

| Item | Verdict |
|------|--------|
| `generate_jobs_from_recurring()` (user-scoped) | **KEEP** — manual path only. |
| `generate_jobs_from_recurring_for_company(p_company_id)` | **KEEP** — scheduled path only. |
| Scheduling Center button → user RPC | **KEEP** — unchanged. |
| Edge → company RPC per company | **KEEP** — canonical. |
| `src/utils/jobGenerators.js` | **REMOVED** — dead code. |
| Recurring template CRUD, Settings, useCompanySettings | **KEEP** — unchanged. |
| Any client/edge direct insert from recurring | **NONE** — confirmed removed. |

---

**Phase 3 complete.** Recurring generation is canonical (DB-only), manual and scheduled paths are verified, dead code is removed, and the live test checklist is documented.
