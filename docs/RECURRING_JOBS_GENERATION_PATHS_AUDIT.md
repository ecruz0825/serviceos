# Recurring Job Generation Paths — Architecture Audit

**Date:** 2025-03-16  
**Mode:** Read-only investigation. No code changes.

**Note:** The database RPC is named `generate_jobs_from_recurring()` (no `_templates`). There is no function named `generate_jobs_from_recurring_templates` in the codebase.

---

## 1. Every Place That Creates Jobs from Recurring Templates

| # | Location | How jobs are created |
|---|----------|----------------------|
| 1 | `src/pages/admin/RecurringJobsAdmin.jsx` | Inline `generateScheduledJobs()` in `useEffect` → `supabase.from('jobs').insert([...])` |
| 2 | `src/AdminDashboard.jsx` | `useEffect` → `generateScheduledJobsOncePerDay(jobs)` → `src/utils/jobGenerators.js` → `supabase.from('jobs').insert([...])` |
| 3 | `src/pages/admin/SchedulingCenterAdmin.jsx` | Button "Generate jobs" → `supabase.rpc('generate_jobs_from_recurring')` (RPC does the insert) |
| 4 | `supabase/functions/auto-generate-recurring-jobs/index.ts` | Edge function (cron/HTTP POST) → `supabase.from('jobs').insert({...})` per date in 30-day window |

**Other references (read-only or non-generation):**

- `recurring_job_id` appears in: SchedulingCenterAdmin, JobIntelligenceAdmin (select/gap detection), JobsAdmin (product event), CustomersAdmin (recurring preview), RPC/edge (insert). Only the four above **create** jobs with `recurring_job_id`.
- `auto_generate_recurring_jobs`: Settings (load/save), useCompanySettings (read), edge function (filter companies). Not used by RecurringJobsAdmin or AdminDashboard to gate generation.
- `jobGenerators`: Only imported and called from AdminDashboard.

---

## 2. Per-Path Documentation

### Path 1 — RecurringJobsAdmin.jsx (inline)

| Field | Detail |
|-------|--------|
| **A. File** | `src/pages/admin/RecurringJobsAdmin.jsx` |
| **B. Trigger** | **Page load** — `useEffect(() => { generateScheduledJobs(); }, []);` runs once when the Recurring Jobs admin page mounts. No button. |
| **C. Next-date logic** | `base = last_generated_date ?? start_date`. Then `nextDate = base + one interval` (weekly +7 days, biweekly +14, monthly +1 month). If `nextDate <= today` → generate for `nextDate`. **Only one date per template per run** (single “next” occurrence). |
| **D. Duplicate protection** | **None.** No check for existing job `(recurring_job_id, service_date)` before insert. Relies on advancing `last_generated_date` so the next run sees a later date; two loads or two tabs can both see the same `nextDate` and double-insert. |
| **E. Billing limits** | **None.** No subscription_status or plan limit check. |
| **F. Team copied** | **Yes.** `assigned_team_id: job.default_team_id \|\| null`. |
| **G. Job cost copied** | **Yes.** `job_cost: job.job_cost`, `services_performed: job.services_performed`. |
| **H. last_generated_date updated** | **Yes.** After successful insert: `update recurring_jobs set last_generated_date = nextDate where id = job.id`. |

---

### Path 2 — AdminDashboard → jobGenerators.js

| Field | Detail |
|-------|--------|
| **A. File** | `src/AdminDashboard.jsx` (trigger) → `src/utils/jobGenerators.js` (logic + insert) |
| **B. Trigger** | **Page load** — `useEffect` when `companyId` is set: fetches `recurring_jobs` (company, not paused), then calls `generateScheduledJobsOncePerDay(jobs)`. Runs on every Admin Dashboard visit. Does **not** check `companies.auto_generate_recurring_jobs`. |
| **C. Next-date logic** | `getNextDate(start_date, recurrence_type)` in jobGenerators.js: advance from `start_date` until `next > today`, then **step back one interval** to get “current period” date. **Does not use `last_generated_date`.** Then only generates if `dueDate === today` and `last_generated_date !== today`. So it generates at most one job per template per day (for “today” only), but the “due date” calculation is inconsistent with RPC/RecurringJobsAdmin (step-back can disagree with “next occurrence from last_generated_date”). |
| **D. Duplicate protection** | **Partial.** Client-side: `alreadyGenerated = job.last_generated_date === today` prevents same-day double run in the same session. **No DB check** for existing job `(recurring_job_id, service_date)`. Race with Path 1 or RPC can still create duplicates. |
| **E. Billing limits** | **None.** |
| **F. Team copied** | **No.** Insert object has no `assigned_team_id`. |
| **G. Job cost copied** | **Yes.** `services_performed: job.services_performed`, `job_cost: job.job_cost`. |
| **H. last_generated_date updated** | **Yes.** After insert: `update recurring_jobs set last_generated_date = today where id = job.id`. |

---

### Path 3 — SchedulingCenterAdmin → RPC

| Field | Detail |
|-------|--------|
| **A. File** | `src/pages/admin/SchedulingCenterAdmin.jsx` (trigger) → DB function `public.generate_jobs_from_recurring()` (logic + insert) |
| **B. Trigger** | **Button** — “Generate jobs” calls `supabase.rpc('generate_jobs_from_recurring')`. Optional proactive UI check for monthly plan limit before calling; RPC enforces billing. |
| **C. Next-date logic** | **RPC:** If `last_generated_date` set: `next_date = last_generated_date + one interval`. Else if `start_date <= today`: `next_date = start_date`; else `next_date = start_date + interval` (no generate). Only generates if `next_date <= today`. **One date per template per invocation.** Uses `CURRENT_DATE` (server date). |
| **D. Duplicate protection** | **Yes.** `SELECT EXISTS(... jobs WHERE recurring_job_id = ... AND service_date = v_next_date AND company_id = ...)`; insert only if not exists. |
| **E. Billing limits** | **Yes.** RPC reads `companies.subscription_status`; if NULL/unpaid/canceled raises `BILLING_READ_ONLY`. Monthly job limit enforced by DB trigger on `jobs` insert. |
| **F. Team copied** | **Yes.** `assigned_team_id = v_recurring_job.default_team_id`. |
| **G. Job cost copied** | **Yes.** `services_performed = COALESCE(..., 'Recurring service')`, `job_cost = COALESCE(..., 0)`. |
| **H. last_generated_date updated** | **Yes.** After insert: `UPDATE recurring_jobs SET last_generated_date = v_next_date WHERE id = ... AND company_id = ...`. |

---

### Path 4 — Edge function (auto-generate-recurring-jobs)

| Field | Detail |
|-------|--------|
| **A. File** | `supabase/functions/auto-generate-recurring-jobs/index.ts` |
| **B. Trigger** | **Cron / scheduled HTTP POST** (exact schedule not in repo). Invoked externally; uses service role key. |
| **C. Next-date logic** | For each template: `cursor = start_date`, then advance until `cursor >= today`. Then for each date from cursor to `today + 30 days` (inclusive), consider that date. **Does not use `last_generated_date`.** Can create up to many jobs per template per run (e.g. 30 days of weekly = several jobs). |
| **D. Duplicate protection** | **Yes.** Before each insert: `from('jobs').select('id').eq('recurring_job_id', row.id).eq('service_date', serviceDate).maybeSingle()`; insert only if no existing row. |
| **E. Billing limits** | **None.** Uses service role; no check of `subscription_status` or plan limits. First insert that hits `JOB_LIMIT_REACHED` can fail the request. |
| **F. Team copied** | **No.** Insert has no `assigned_team_id`. |
| **G. Job cost copied** | **No.** Hardcoded `services_performed: "Recurring service"`, `job_cost: 0`. |
| **H. last_generated_date updated** | **No.** Never updates `recurring_jobs.last_generated_date`. |

---

## 3. Comparison: What the RPC Does That Other Paths Do Not

**RPC name in codebase:** `generate_jobs_from_recurring()` (not `generate_jobs_from_recurring_templates`).

| Capability | RPC | Path 1 (RecurringJobsAdmin) | Path 2 (Dashboard/jobGenerators) | Path 4 (Edge) |
|------------|-----|-----------------------------|-----------------------------------|---------------|
| Auth required | Yes (auth.uid()) | N/A (client) | N/A | No (service role) |
| Company scoped from caller | Yes (profile.company_id) | Yes (getCompanyId()) | Yes (companyId) | Yes (companies with flag) |
| Role gate (admin/manager/dispatcher) | Yes | N/A | N/A | N/A |
| **Billing check** (subscription_status) | **Yes** | No | No | No |
| Next date from **last_generated_date** | **Yes** | Yes | **No** | **No** |
| **Single “next due” per template per run** | **Yes** | Yes | Yes (today only) | No (up to 30 days) |
| **Duplicate check in DB** (exists for recurring_job_id + date) | **Yes** | **No** | **No** | Yes |
| Copy **default_team_id** → assigned_team_id | **Yes** | Yes | **No** | **No** |
| Copy services_performed / job_cost from template | **Yes** | Yes | Yes | **No** (fixed values) |
| **Update last_generated_date** after insert | **Yes** | Yes | Yes | **No** |
| Returns created rows (job_id, service_date, created) | Yes | No | No | No |

**Summary:** The RPC is the only path that combines **billing enforcement**, **duplicate protection**, **last_generated_date–based next date**, **team and cost copy**, and **last_generated_date update** in one place. Path 1 has no duplicate check. Path 2 uses different next-date logic and omits team. Path 4 does not update `last_generated_date` and does not copy team or cost, and has no billing check.

---

## 4. Which Paths Should Be KEEP / REMOVE / REWRITE

| Path | Decision | Reason |
|------|----------|--------|
| **Path 3 (SchedulingCenter → RPC)** | **KEEP** | Single canonical “on-demand” generation: billing, duplicate check, correct next date, team/cost, last_generated_date. Triggered by explicit button. |
| **Path 1 (RecurringJobsAdmin inline)** | **REMOVE or REWRITE** | No duplicate protection, no billing, runs on every page load. Prefer **REMOVE** the useEffect generation; optionally add a “Generate jobs now” button that calls the RPC (REWRITE to call RPC). |
| **Path 2 (AdminDashboard → jobGenerators)** | **REMOVE or REWRITE** | Different next-date logic, no team, no billing, no DB duplicate check; runs on every dashboard load and ignores `auto_generate_recurring_jobs`. Prefer **REMOVE** client-side generation from dashboard; scheduled generation should be edge-only (and edge should align with RPC behavior or call a company-scoped RPC). |
| **Path 4 (Edge function)** | **REWRITE** to align with RPC semantics (or call RPC) | Keep as the **scheduled** path for companies with `auto_generate_recurring_jobs = true`, but either: (a) call a new company-scoped RPC in a loop (see §5), or (b) rewrite to update `last_generated_date` and copy `default_team_id`, `services_performed`, `job_cost` from template, and optionally add billing/limit checks. |

---

## 5. Can the Edge Function Simply Call the RPC?

**Not as-is.**

- The current RPC `generate_jobs_from_recurring()` uses **auth.uid()** to resolve the caller’s profile and then **company_id**. It runs for **one company** (the authenticated user’s).
- The edge function runs with **service role** and no user context; **auth.uid() is NULL**, so the RPC would raise **AUTH_REQUIRED** and exit.

**Options:**

1. **New RPC for scheduled use**  
   Add a second function, e.g. `generate_jobs_from_recurring_for_company(p_company_id uuid)`, that:
   - Is `SECURITY DEFINER` and restricted to service role (or a dedicated role).
   - Takes `p_company_id` instead of deriving from auth.
   - Reuses the same logic as the current RPC (next date from last_generated_date, duplicate check, team/cost copy, last_generated_date update, optional billing check).
   - Edge function: for each company with `auto_generate_recurring_jobs = true`, call this RPC with that company’s id. No duplicate logic in the edge.

2. **Keep edge logic, align behavior**  
   Keep the edge function’s own loop and inserts but:
   - Update `recurring_jobs.last_generated_date` (e.g. to max date generated per template in the run).
   - Copy `default_team_id`, `services_performed`, `job_cost` from template into each insert.
   - Optionally check billing/plan before inserting for that company.

Recommendation: **Option 1** (new company-scoped RPC + edge calls it) gives one implementation of “how to generate” and avoids drift between UI and cron.

---

## 6. Structured Report

### A. Generation Paths Discovered

| Id | Name | Entry point | Creates jobs via |
|----|------|-------------|-------------------|
| 1 | RecurringJobsAdmin inline | Recurring Jobs page load | Client: `supabase.from('jobs').insert` |
| 2 | AdminDashboard + jobGenerators | Admin Dashboard page load | Client: `jobGenerators.generateScheduledJobsOncePerDay` → `supabase.from('jobs').insert` |
| 3 | Scheduling Center button | “Generate jobs” button click | Server: `supabase.rpc('generate_jobs_from_recurring')` |
| 4 | Edge auto-generate | Cron/HTTP POST | Edge: `supabase.from('jobs').insert` in 30-day window |

---

### B. Differences Between Paths

| Aspect | Path 1 | Path 2 | Path 3 (RPC) | Path 4 |
|--------|--------|--------|---------------|--------|
| Trigger | Page load | Page load | Button | Cron |
| Next date base | last_generated_date or start_date | start_date only (step-back) | last_generated_date or start_date | start_date only |
| Window | One “next” per template | Today only | One “next” per template | Today → +30 days |
| Duplicate check | No | Client only (last_generated_date === today) | DB EXISTS | DB select before insert |
| Billing | No | No | Yes | No |
| Team copied | Yes | No | Yes | No |
| Cost/services copied | Yes | Yes | Yes | No (hardcoded) |
| last_generated_date updated | Yes | Yes | Yes | No |

---

### C. Risks Created by Each Path

- **Path 1:** Duplicate jobs (no DB check; multiple loads/tabs). No billing gate. Runs on every Recurring Jobs page visit.
- **Path 2:** Duplicate jobs (no DB check; races with Path 1 or 3). Wrong “due” semantics (getNextDate step-back). Unassigned jobs (no team). Ignores `auto_generate_recurring_jobs` so dashboard always runs generation when visited.
- **Path 3:** None identified; this is the desired behavior for on-demand generation.
- **Path 4:** `last_generated_date` never updated → RPC and UI “next due” wrong after edge runs. Jobs created without team and with fixed “Recurring service” / 0 cost. No billing/limit check; one company hitting limit can cause edge to return 500. Batch size (30 days) can hit plan limit in one run.

---

### D. Recommended Single Generation Architecture

1. **One source of truth for “how to generate”**  
   - Implement generation logic in the database only: current RPC for **caller’s company** (on-demand), and optionally a **company-scoped RPC** for scheduled use (same logic, takes `p_company_id`, restricted to service role).

2. **On-demand (UI)**  
   - Only the Scheduling Center “Generate jobs” button calls the RPC. Remove all client-side insert-from-recurring logic from RecurringJobsAdmin and AdminDashboard. Optionally add a “Generate jobs now” button on Recurring Jobs that also calls the same RPC.

3. **Scheduled (cron)**  
   - Edge function runs on schedule. For each company with `auto_generate_recurring_jobs = true`, call the company-scoped RPC (or the current RPC with a way to pass company_id). No duplicate logic in the edge; no direct `jobs` inserts from the edge.

4. **Policies**  
   - RecurringJobsAdmin: no automatic generation on page load.  
   - AdminDashboard: no call to `generateScheduledJobsOncePerDay` (or any generation).  
   - `auto_generate_recurring_jobs`: only controls whether the **scheduled** edge run generates for that company.

---

### E. Safe Cleanup Order

1. **Remove** the `useEffect` that calls `generateScheduledJobs()` in **RecurringJobsAdmin.jsx** (stops automatic generation on Recurring Jobs page load). Optionally add a “Generate jobs now” button that calls `supabase.rpc('generate_jobs_from_recurring')`.
2. **Remove** the `useEffect` that calls `generateScheduledJobsOncePerDay` in **AdminDashboard.jsx** (and the import of `jobGenerators` for that use). Stops generation on dashboard load.
3. **Leave** `jobGenerators.js` in the repo only if another caller is intended; otherwise remove or reduce to dead code for future removal.
4. **Add** company-scoped RPC (e.g. `generate_jobs_from_recurring_for_company(p_company_id uuid)`) that mirrors current RPC logic and is callable by service role.
5. **Rewrite** the edge function to loop over opted-in companies and call the new RPC instead of doing its own date loop and inserts. Remove direct `jobs` inserts and `last_generated_date`/team/cost logic from the edge.
6. **(Optional)** Add billing/plan check inside the company-scoped RPC or in the edge before calling it, to avoid partial failures and unclear errors.

---

### F. KEEP / REMOVE / REWRITE Summary

| Path | Decision |
|------|----------|
| **Path 3 — SchedulingCenterAdmin → RPC** | **KEEP** as the only on-demand generation path. |
| **Path 1 — RecurringJobsAdmin inline** | **REMOVE** automatic generation from useEffect. **REWRITE** (optional): add button that calls RPC. |
| **Path 2 — AdminDashboard → jobGenerators** | **REMOVE** (dashboard no longer runs generation). Delete or repurpose `generateScheduledJobsOncePerDay` usage. |
| **Path 4 — Edge function** | **REWRITE** to call a company-scoped RPC per opted-in company (after adding that RPC). Do not duplicate generation logic in the edge. |

---

**End of architecture audit.**
