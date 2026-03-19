# RLS Remediation Plan: Core Data Integrity & Tenant Safety

**Goal:** Close launch-blocking tenant isolation gaps for 7 critical tables.

**Status:** Planning phase - no migrations created yet.

---

## Table-by-Table Analysis

### 1. **customers** (HIGH_RISK - Launch Blocker)

**Current State:**
- ❌ No RLS policies found
- ✅ Has `company_id` column
- ✅ Has `user_id` column (for customer portal access)

**Risk Assessment:**
- **CRITICAL:** `UserContext.jsx` auto-linking (lines 25-30) matches by email without `company_id` filter - could link customer to wrong tenant
- **CRITICAL:** `CustomerDashboard.jsx` (line 62) - `select('*')` without any filters returns all customers
- **HIGH:** `CustomerDashboard.jsx` (lines 155, 158, 170) - UPDATE/INSERT/DELETE without `company_id` in WHERE clause
- **MEDIUM:** Admin queries in `CustomersAdmin.jsx` correctly use `.eq('company_id', companyId)` but rely on frontend enforcement

**Required RLS Policies:**

**SELECT:**
- **Admin/Crew:** `company_id = current_company_id() AND current_user_role() IN ('admin', 'crew')`
- **Customer:** `company_id = current_company_id() AND user_id = auth.uid() AND current_user_role() = 'customer'`

**INSERT:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Customer (self-registration):** `company_id = current_company_id() AND user_id = auth.uid() AND current_user_role() = 'customer'` (for customer portal signup)

**UPDATE:**
- **Admin:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Customer (own record):** `company_id = current_company_id() AND user_id = auth.uid() AND current_user_role() = 'customer'`

**DELETE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required

**Frontend Patches Required:**
- `src/context/UserContext.jsx` (lines 25-30, 46-49) - Add `.eq('company_id', profile.company_id)` to auto-linking queries
- `src/CustomerDashboard.jsx` (lines 62, 155, 158, 170) - Add `.eq('company_id', companyId)` to all queries
- `src/CustomerDashboard.jsx` (line 158) - Ensure `company_id` is included in INSERT payload

---

### 2. **jobs** (HIGH_RISK - Launch Blocker)

**Current State:**
- ❌ No RLS policies found
- ✅ Has `company_id` column
- ✅ Has `customer_id` column
- ✅ Has `assigned_team_id` column

**Risk Assessment:**
- **CRITICAL:** Customer queries rely on `customer_id` without verifying `company_id` match
- **CRITICAL:** Crew queries rely on `assigned_team_id` without verifying `company_id` match
- **CRITICAL:** `CrewJobDetail.jsx` (line 139) - Access by `id` only, relies on `userCanAccessJob` function (not RLS)
- **HIGH:** `CustomerDashboard.jsx` (lines 224, 426, 450) - UPDATE/DELETE without `company_id` in WHERE clause
- **MEDIUM:** Admin queries in `JobsAdmin.jsx` correctly use `.eq('company_id', companyId)` but rely on frontend enforcement

**Required RLS Policies:**

**SELECT:**
- **Admin:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Crew:** `company_id = current_company_id() AND current_user_role() = 'crew' AND EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id JOIN crew_members cm ON cm.id = tm.crew_member_id WHERE t.id = jobs.assigned_team_id AND t.company_id = jobs.company_id AND cm.user_id = auth.uid())`
- **Customer:** `company_id = current_company_id() AND current_user_role() = 'customer' AND EXISTS (SELECT 1 FROM customers c WHERE c.id = jobs.customer_id AND c.company_id = jobs.company_id AND c.user_id = auth.uid())`

**INSERT:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin' AND EXISTS (SELECT 1 FROM customers c WHERE c.id = jobs.customer_id AND c.company_id = current_company_id())`
- **RPC only:** Allow `auto-generate-recurring-jobs` edge function (service_role bypasses RLS)

**UPDATE:**
- **Admin:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Crew (assigned jobs only):** `company_id = current_company_id() AND current_user_role() = 'crew' AND EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id JOIN crew_members cm ON cm.id = tm.crew_member_id WHERE t.id = jobs.assigned_team_id AND t.company_id = jobs.company_id AND cm.user_id = auth.uid())`
- **Customer (status updates only):** `company_id = current_company_id() AND current_user_role() = 'customer' AND EXISTS (SELECT 1 FROM customers c WHERE c.id = jobs.customer_id AND c.company_id = jobs.company_id AND c.user_id = auth.uid())` (limited fields)

**DELETE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required
- `current_crew_member_id()` - Optional (can use EXISTS subquery instead)

**Frontend Patches Required:**
- `src/CustomerDashboard.jsx` (lines 224, 426, 450) - Add `.eq('company_id', companyId)` to UPDATE/DELETE queries
- `src/CustomerDashboard.jsx` (line 429) - Ensure `company_id` is included in INSERT payload
- `src/pages/crew/CrewJobDetail.jsx` (lines 228, 270, 332) - Add `.eq('company_id', companyId)` to UPDATE queries (defense-in-depth)
- `src/pages/customer/JobDetailPage.jsx` (line 55) - Add `.eq('company_id', companyId)` to SELECT query (defense-in-depth)

**Note:** Crew and customer policies use EXISTS subqueries to verify relationships, which is safer than relying on frontend filtering.

---

### 3. **recurring_jobs** (HIGH_RISK - Launch Blocker)

**Current State:**
- ❌ No RLS policies found
- ✅ Has `company_id` column
- ✅ Has `customer_id` column

**Risk Assessment:**
- **CRITICAL:** `AdminDashboard.jsx` (line 12) - Returns recurring jobs from ALL companies (missing `company_id` filter)
- **CRITICAL:** `jobGenerators.js` (line 25) - UPDATE by `id` only, could affect wrong tenant if ID is compromised
- **HIGH:** `CustomersAdmin.jsx` (line 1616) - Scoped by `customer_id` only, relies on relationship integrity
- **MEDIUM:** `RecurringJobsAdmin.jsx` correctly uses `company_id` in INSERT but not in all SELECT queries

**Required RLS Policies:**

**SELECT:**
- **Admin:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Crew:** None (crew should not access recurring jobs directly)
- **Customer:** None (customers should not access recurring jobs directly)

**INSERT:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin' AND EXISTS (SELECT 1 FROM customers c WHERE c.id = recurring_jobs.customer_id AND c.company_id = current_company_id())`

**UPDATE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**DELETE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required

**Frontend Patches Required:**
- `src/AdminDashboard.jsx` (line 12) - Add `.eq('company_id', companyId)` to SELECT query
- `src/utils/jobGenerators.js` (line 25) - Add `.eq('company_id', job.company_id)` to UPDATE query (defense-in-depth)
- `src/pages/admin/CustomersAdmin.jsx` (line 1616) - Add `.eq('company_id', companyId)` to SELECT query (defense-in-depth)

---

### 4. **expenses** (REQUIRES_RLS)

**Current State:**
- ❌ No RLS policies found
- ✅ Has `company_id` column (NOT NULL, enforced by migration `20260201133730_harden_expenses_schema.sql`)
- ✅ Queries in `ExpensesAdmin.jsx` use `.eq('company_id', companyId)`

**Risk Assessment:**
- **MEDIUM:** All queries appear to use explicit `company_id` filtering, but RLS is still required for defense-in-depth
- **LOW:** No customer/crew access patterns found (admin-only table)

**Required RLS Policies:**

**SELECT:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**INSERT:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**UPDATE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**DELETE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required

**Frontend Patches Required:**
- None (queries already use explicit filtering, but RLS adds defense-in-depth)

---

### 5. **crew_members** (REQUIRES_RLS)

**Current State:**
- ❌ No RLS policies found
- ✅ Has `company_id` column
- ✅ Has `user_id` column

**Risk Assessment:**
- **MEDIUM:** `CustomerDashboard.jsx` (line 68) - Missing `company_id` filter
- **LOW:** Most admin queries correctly use `.eq('company_id', companyId)`
- **LOW:** Crew members should only access their own record or company-scoped records

**Required RLS Policies:**

**SELECT:**
- **Admin:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Crew (own record):** `company_id = current_company_id() AND user_id = auth.uid() AND current_user_role() = 'crew'`
- **Crew (company members):** `company_id = current_company_id() AND current_user_role() = 'crew'` (for viewing team members)
- **Customer:** None (customers should not access crew_members directly)

**INSERT:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**UPDATE:**
- **Admin:** `company_id = current_company_id() AND current_user_role() = 'admin'`
- **Crew (own record, limited fields):** `company_id = current_company_id() AND user_id = auth.uid() AND current_user_role() = 'crew'` (e.g., phone, emergency contact only)

**DELETE:**
- **Admin only:** `company_id = current_company_id() AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required

**Frontend Patches Required:**
- `src/CustomerDashboard.jsx` (line 68) - Add `.eq('company_id', companyId)` to SELECT query
- `src/pages/admin/CustomersAdmin.jsx` (line 211) - Already has filter, but verify it's not missing in other places

---

### 6. **customer_notes** (REQUIRES_RLS)

**Current State:**
- ❌ No RLS policies found
- ✅ Has `customer_id` column (assumed, based on query patterns)
- ❓ `company_id` column status unknown (needs schema verification)

**Risk Assessment:**
- **HIGH:** Queries in `CustomersAdmin.jsx` (lines 798, 833, 882) scoped by `customer_id` only
- **MEDIUM:** Relies on `customer_id` → `company_id` relationship integrity
- **LOW:** Admin-only access pattern (no customer/crew access found)

**Required RLS Policies:**

**SELECT:**
- **Admin:** `EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_notes.customer_id AND c.company_id = current_company_id()) AND current_user_role() = 'admin'`

**INSERT:**
- **Admin only:** `EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_notes.customer_id AND c.company_id = current_company_id()) AND current_user_role() = 'admin'`

**UPDATE:**
- **Admin only:** `EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_notes.customer_id AND c.company_id = current_company_id()) AND current_user_role() = 'admin'`

**DELETE:**
- **Admin only:** `EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_notes.customer_id AND c.company_id = current_company_id()) AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required

**Frontend Patches Required:**
- `src/pages/admin/CustomersAdmin.jsx` (lines 798, 833, 882) - Add `.eq('company_id', companyId)` via JOIN or subquery (defense-in-depth, but RLS is primary protection)

**Schema Verification Needed:**
- Check if `customer_notes` table has `company_id` column. If not, consider adding it for performance (or rely on EXISTS subquery in RLS).

---

### 7. **customer_feedback** (REQUIRES_RLS - Partial)

**Current State:**
- ⚠️ Partial RLS: SELECT policy exists, but no INSERT/UPDATE/DELETE policies
- ✅ Has `customer_id` column
- ✅ Has `job_id` column
- ✅ Has `user_id` column

**Risk Assessment:**
- **MEDIUM:** `FeedbackForm.jsx` (line 19) - INSERT without `company_id` in payload
- **MEDIUM:** `JobsAdmin.jsx` (line 535) - Scoped by `job_id` only
- **LOW:** SELECT policy exists but relies on `customer.user_id = auth.uid()` relationship

**Required RLS Policies:**

**SELECT (Already Exists):**
- **Customer (own feedback):** `EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_feedback.customer_id AND c.user_id = auth.uid())`
- **Admin (company feedback):** `EXISTS (SELECT 1 FROM customers c JOIN jobs j ON j.customer_id = c.id WHERE c.id = customer_feedback.customer_id AND j.id = customer_feedback.job_id AND c.company_id = current_company_id() AND j.company_id = current_company_id()) AND current_user_role() = 'admin'`

**INSERT (Missing):**
- **Customer (own feedback):** `EXISTS (SELECT 1 FROM customers c JOIN jobs j ON j.customer_id = c.id WHERE c.id = customer_feedback.customer_id AND j.id = customer_feedback.job_id AND c.user_id = auth.uid() AND c.company_id = current_company_id() AND j.company_id = current_company_id()) AND current_user_role() = 'customer'`
- **Admin:** `EXISTS (SELECT 1 FROM customers c JOIN jobs j ON j.customer_id = c.id WHERE c.id = customer_feedback.customer_id AND j.id = customer_feedback.job_id AND c.company_id = current_company_id() AND j.company_id = current_company_id()) AND current_user_role() = 'admin'`

**UPDATE (Missing):**
- **Customer (own feedback, limited):** `EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_feedback.customer_id AND c.user_id = auth.uid()) AND current_user_role() = 'customer'` (e.g., rating, comment only)
- **Admin:** `EXISTS (SELECT 1 FROM customers c JOIN jobs j ON j.customer_id = c.id WHERE c.id = customer_feedback.customer_id AND j.id = customer_feedback.job_id AND c.company_id = current_company_id() AND j.company_id = current_company_id()) AND current_user_role() = 'admin'`

**DELETE (Missing):**
- **Admin only:** `EXISTS (SELECT 1 FROM customers c JOIN jobs j ON j.customer_id = c.id WHERE c.id = customer_feedback.customer_id AND j.id = customer_feedback.job_id AND c.company_id = current_company_id() AND j.company_id = current_company_id()) AND current_user_role() = 'admin'`

**Helper Functions:**
- `current_company_id()` - Required
- `current_user_role()` - Required

**Frontend Patches Required:**
- `src/components/FeedbackForm.jsx` (line 19) - Ensure `company_id` is included in INSERT payload (defense-in-depth, but RLS is primary protection)
- `src/pages/admin/JobsAdmin.jsx` (line 535) - Add `.eq('company_id', companyId)` via JOIN (defense-in-depth)

---

## Implementation Strategy

### A. Highest-Priority Migration Order (By Risk)

1. **customers** - Launch blocker (UserContext auto-linking vulnerability)
2. **jobs** - Launch blocker (customer/crew access without verification)
3. **recurring_jobs** - Launch blocker (AdminDashboard returns all companies)
4. **customer_notes** - High risk (admin queries rely on relationship)
5. **customer_feedback** - Medium risk (missing INSERT/UPDATE/DELETE policies)
6. **crew_members** - Medium risk (one missing filter)
7. **expenses** - Low risk (all queries already filtered, RLS for defense-in-depth)

### B. Safest Implementation Order (By Dependency)

1. **expenses** - Simplest (admin-only, no relationships)
2. **crew_members** - Simple (direct company_id match)
3. **customers** - Medium complexity (admin + customer roles)
4. **customer_notes** - Medium complexity (relationship-based)
5. **customer_feedback** - Medium complexity (relationship-based, partial RLS exists)
6. **recurring_jobs** - Medium complexity (relationship-based)
7. **jobs** - Most complex (admin + crew + customer roles, multiple relationships)

**Rationale:** Start with simplest tables to validate RLS pattern, then move to relationship-based policies, finally tackle the most complex multi-role table.

### C. Frontend Files to Patch After RLS

**Critical (Launch Blockers):**
1. `src/context/UserContext.jsx` - Fix auto-linking vulnerability
2. `src/CustomerDashboard.jsx` - Fix all customer queries
3. `src/AdminDashboard.jsx` - Fix recurring_jobs query
4. `src/utils/jobGenerators.js` - Fix recurring_jobs update

**High Priority (Defense-in-Depth):**
5. `src/pages/admin/CustomersAdmin.jsx` - Add company_id filters to customer_notes queries
6. `src/pages/crew/CrewJobDetail.jsx` - Add company_id to UPDATE queries
7. `src/pages/customer/JobDetailPage.jsx` - Add company_id to SELECT query
8. `src/components/FeedbackForm.jsx` - Add company_id to INSERT payload

**Medium Priority (Verification):**
9. `src/pages/admin/RecurringJobsAdmin.jsx` - Verify all queries have company_id
10. `src/pages/admin/ExpensesAdmin.jsx` - Verify all queries have company_id (should already be correct)

### D. Tables That Should Be RPC-Only

**Consider RPC-Only (Future Hardening):**
- **payments** - Already RPC-only for INSERT (via `record_payment()`)
- **invoices** - Already RPC-only for UPDATE (via `send_invoice()`, `void_invoice()`)
- **jobs** - Consider RPC for INSERT/UPDATE from customer portal (future)
- **customer_feedback** - Consider RPC for INSERT to ensure company_id is set (future)

**Current RPC-Only Tables:**
- None explicitly enforced, but payments and invoices have RLS that blocks direct INSERT/UPDATE

---

## Migration Naming Convention

Use format: `YYYYMMDDHHMMSS_rls_<table_name>_tenant_isolation.sql`

Example: `20260315000000_rls_customers_tenant_isolation.sql`

---

## Testing Strategy

1. **Unit Tests (Per Table):**
   - Admin can SELECT/INSERT/UPDATE/DELETE own company data
   - Admin cannot access other company data
   - Crew can access assigned jobs only
   - Customer can access own records only
   - Unauthenticated users cannot access any data

2. **Integration Tests:**
   - UserContext auto-linking respects company_id
   - Customer portal queries are scoped correctly
   - Crew portal queries are scoped correctly
   - Admin queries continue to work with explicit company_id filters

3. **Regression Tests:**
   - All existing admin workflows continue to function
   - All existing customer workflows continue to function
   - All existing crew workflows continue to function

---

## Rollback Plan

Each migration should be idempotent and reversible:
- Use `DROP POLICY IF EXISTS` before `CREATE POLICY`
- Use `DO $$ ... END $$` blocks for conditional logic
- Document rollback SQL in migration comments
- Test rollback on staging before production

---

## Next Steps

1. ✅ Complete planning (this document)
2. ⏳ Create migration for `expenses` (simplest, validate pattern)
3. ⏳ Create migration for `crew_members`
4. ⏳ Create migration for `customers`
5. ⏳ Create migration for `customer_notes`
6. ⏳ Create migration for `customer_feedback` (complete partial RLS)
7. ⏳ Create migration for `recurring_jobs`
8. ⏳ Create migration for `jobs` (most complex)
9. ⏳ Patch frontend files (in parallel with migrations)
10. ⏳ Test all workflows
11. ⏳ Deploy to staging
12. ⏳ Deploy to production

---

**Document Version:** 1.0  
**Last Updated:** 2024-03-15  
**Status:** Planning Complete - Ready for Implementation
