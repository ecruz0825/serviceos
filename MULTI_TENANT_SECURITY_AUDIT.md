# Multi-Tenant Security Audit Report

**Date**: 2025-01-27  
**Scope**: Read-only analysis of multi-tenant data isolation  
**Status**: CRITICAL issues identified

---

## Executive Summary

This audit identifies **CRITICAL** security vulnerabilities where cross-company data leakage is possible. The application relies heavily on Row Level Security (RLS) policies, but several frontend queries bypass company_id filtering, creating potential data exposure risks.

**Key Findings**:
- **CRITICAL**: 3 queries missing `company_id` filtering
- **RISK**: 8 queries using `.in()` filters without company_id validation
- **RISK**: Client-side filtering in multiple components
- **SAFE**: Edge functions properly verify company_id
- **SAFE**: RLS policies are comprehensive and well-designed

---

## 1. Company_ID Usage Analysis

### ✅ SAFE: Proper Company_ID Filtering

**Location**: Most admin pages correctly filter by `company_id`

**Examples**:
- `src/pages/admin/ScheduleAdmin.jsx:616` - Jobs query with `.eq('company_id', companyId)`
- `src/pages/admin/CustomersAdmin.jsx:215` - Customers query with `.eq('company_id', companyId)`
- `src/pages/admin/PaymentsAdmin.jsx:121` - Payments query with `.eq('company_id', companyId)`
- `src/pages/admin/ExpensesAdmin.jsx:147` - Expenses query with `.eq('company_id', companyId)`

**Pattern**: 
```javascript
const { data } = await supabase
  .from('jobs')
  .select('*')
  .eq('company_id', companyId);
```

**Status**: ✅ **SAFE** - RLS policies provide defense-in-depth, but explicit filtering is correct.

---

## 2. CRITICAL: Queries Missing Company_ID Filtering

### 🔴 CRITICAL: JobsAdmin.jsx - Jobs Query Without Company_ID

**File**: `src/pages/admin/JobsAdmin.jsx:477-494`

**Code**:
```javascript
const { data: jobsData, error: jobsError } = await supabase
  .from('jobs')
  .select(`
    id,
    services_performed,
    status,
    job_cost,
    crew_pay,
    notes,
    customer_id,
    assigned_team_id,
    service_date,
    scheduled_end_date,
    before_image,
    after_image,
    invoice_path,
    invoice_uploaded_at
  `);
// ❌ MISSING: .eq('company_id', companyId)
```

**Risk**: **CRITICAL** - This query fetches ALL jobs across ALL companies. While RLS should prevent this, if RLS is misconfigured or bypassed, this exposes cross-company data.

**Mitigation**: RLS policies on `jobs` table should prevent this, but explicit filtering is required.

**Recommendation**: Add `.eq('company_id', companyId)` immediately after `.select()`.

---

### 🔴 CRITICAL: JobsAdmin.jsx - Customers Query Without Company_ID

**File**: `src/pages/admin/JobsAdmin.jsx:507-509`

**Code**:
```javascript
const { data: customersData, error: customersError } = await supabase
  .from('customers')
  .select('id, full_name, email, address');
// ❌ MISSING: .eq('company_id', companyId)
```

**Risk**: **CRITICAL** - Fetches ALL customers across ALL companies.

**Recommendation**: Add `.eq('company_id', companyId)`.

---

### 🔴 CRITICAL: JobsAdmin.jsx - Customer Feedback Query Without Company_ID

**File**: `src/pages/admin/JobsAdmin.jsx:515-517`

**Code**:
```javascript
const { data: feedbackData, error: feedbackError } = await supabase
  .from('customer_feedback')
  .select('job_id, rating, comment');
// ❌ MISSING: No company_id filtering
```

**Risk**: **CRITICAL** - Fetches feedback for ALL jobs across ALL companies.

**Recommendation**: Join with jobs table or add company_id filter if table has company_id column.

---

### 🟡 RISK: CustomersAdmin.jsx - Jobs Query Without Company_ID (Partial)

**File**: `src/pages/admin/CustomersAdmin.jsx:1591-1595`

**Code**:
```javascript
const { data: jobs, error } = await supabase
  .from('jobs')
  .select('*')
  .eq('customer_id', customerId)
  .order('service_date', { ascending: false });
// ❌ MISSING: .eq('company_id', companyId)
```

**Risk**: **RISK** - If `customerId` is from a different company (unlikely but possible), this could leak jobs. However, since `customerId` is already validated to belong to `companyId` in the parent context, this is lower risk.

**Recommendation**: Add `.eq('company_id', companyId)` for defense-in-depth.

---

### 🟡 RISK: CustomersAdmin.jsx - Recurring Jobs Query Without Company_ID

**File**: `src/pages/admin/CustomersAdmin.jsx:1608-1611`

**Code**:
```javascript
const { data: recurringData } = await supabase
  .from("recurring_jobs")
  .select("start_date, recurrence_type")
  .eq("customer_id", customerId);
// ❌ MISSING: .eq('company_id', companyId)
```

**Risk**: **RISK** - Similar to above, relies on customer_id validation.

**Recommendation**: Add `.eq('company_id', companyId)`.

---

## 3. RISK: Queries Using .in() Without Company_ID Validation

### 🟡 RISK: Payments Queries with .in('job_id')

**Locations**:
- `src/pages/admin/CustomersAdmin.jsx:373-376`
- `src/pages/admin/CustomersAdmin.jsx:924-927`
- `src/pages/admin/JobsAdmin.jsx:534-537`
- `src/pages/admin/PaymentsAdmin.jsx:1008-1009`

**Pattern**:
```javascript
const { data: payments } = await supabase
  .from('payments')
  .select('amount, job_id, status')
  .in('job_id', jobIds)  // ❌ jobIds may contain cross-company IDs
  .eq('status', 'posted');
```

**Risk**: **RISK** - If `jobIds` array contains job IDs from other companies (due to bug or manipulation), this could leak payment data. However, if `jobIds` is derived from a company-scoped query, this is mitigated.

**Mitigation**: 
- Ensure `jobIds` is always derived from company-scoped queries
- Add `.eq('company_id', companyId)` for defense-in-depth
- RLS policies on `payments` table should prevent this

**Status**: 🟡 **RISK** - Relies on upstream validation and RLS.

---

### 🟡 RISK: Team Members Queries with .in('team_id')

**Locations**:
- `src/pages/admin/ScheduleAdmin.jsx:667-670`
- `src/pages/admin/TeamsAdmin.jsx:98`
- `src/pages/admin/AdminDashboard.jsx:143`
- `src/pages/admin/CustomersAdmin.jsx:227-230`
- `src/pages/admin/JobsAdmin.jsx:175-178`

**Pattern**:
```javascript
const { data: teamMembersData } = await supabase
  .from('team_members')
  .select('*, crew_members(id, full_name)')
  .in('team_id', teamIds);  // ❌ teamIds may contain cross-company IDs
```

**Risk**: **RISK** - If `teamIds` contains IDs from other companies, this leaks team membership data.

**Mitigation**: 
- `teamIds` should always be derived from company-scoped team queries
- RLS policies on `team_members` should prevent this

**Status**: 🟡 **RISK** - Relies on upstream validation and RLS.

---

### 🟡 RISK: Schedule Requests Query with .in('job_id')

**File**: `src/pages/admin/JobsAdmin.jsx:542-546`

**Code**:
```javascript
const { data: scheduleRequestsData } = await supabase
  .from('job_schedule_requests')
  .select('id, job_id, requested_date, status')
  .in('job_id', jobIds)  // ❌ jobIds may contain cross-company IDs
  .eq('status', 'requested');
```

**Risk**: **RISK** - Similar to payments queries above.

**Status**: 🟡 **RISK** - Relies on upstream validation and RLS.

---

### 🟡 RISK: Invoices Query with .in('job_id')

**File**: `src/pages/admin/JobsAdmin.jsx:555-558`

**Code**:
```javascript
const { data: invoicesData, error: invoicesError } = await supabase
  .from('invoices')
  .select(INVOICE_SELECT_JOBS_ADMIN)
  .in('job_id', jobIds);  // ❌ jobIds may contain cross-company IDs
```

**Risk**: **RISK** - Could leak invoice data if jobIds contains cross-company IDs.

**Status**: 🟡 **RISK** - Relies on upstream validation and RLS.

---

## 4. Client-Side Filtering vs Server-Side Filtering

### 🟡 RISK: Client-Side Filtering in Multiple Components

**Locations**:
- `src/pages/admin/JobsAdmin.jsx:310-382` - `applyFilters()` function filters jobs client-side
- `src/pages/admin/CustomersAdmin.jsx` - Customer list filtering done client-side
- `src/pages/admin/ScheduleAdmin.jsx` - Job filtering done client-side

**Pattern**:
```javascript
// Fetch ALL jobs for company
const { data: allJobs } = await supabase
  .from('jobs')
  .select('*')
  .eq('company_id', companyId);

// Then filter client-side
const filtered = allJobs.filter(job => {
  if (status && job.status !== status) return false;
  if (crew && job.assigned_team_id !== crew) return false;
  // ... more client-side filters
});
```

**Risk**: **RISK** - While data is company-scoped, client-side filtering:
1. Exposes all company data to client (even if not displayed)
2. Increases payload size
3. Slower performance for large datasets
4. Potential for client-side manipulation

**Recommendation**: Move filtering to server-side using Supabase query filters:
```javascript
let query = supabase
  .from('jobs')
  .select('*')
  .eq('company_id', companyId);
  
if (status) query = query.eq('status', status);
if (crew) query = query.eq('assigned_team_id', crew);
```

**Status**: 🟡 **RISK** - Functional but not optimal. Data is company-scoped, so no cross-company leakage, but exposes more data than necessary.

---

## 5. Direct Table Access vs RPC

### ✅ SAFE: Payments Use RPC for Critical Operations

**Location**: `src/pages/admin/PaymentsAdmin.jsx`, `src/CustomerDashboard.jsx`

**Pattern**:
```javascript
// ✅ SAFE: Uses RPC
await supabase.rpc('record_payment', {
  p_job_id: jobId,
  p_amount: amount,
  p_method: method,
  p_notes: notes
});

// ✅ SAFE: Uses RPC
await supabase.rpc('void_payment', {
  p_payment_id: paymentId,
  p_reason: reason
});
```

**Status**: ✅ **SAFE** - RPCs enforce company_id validation and role checks.

---

### 🟡 RISK: Direct Table Inserts/Updates

**Locations**:
- `src/pages/admin/JobsAdmin.jsx:839` - Direct job update
- `src/pages/admin/JobsAdmin.jsx:875` - Direct job insert
- `src/pages/admin/CustomersAdmin.jsx:1667` - Direct job insert
- `src/pages/admin/ScheduleAdmin.jsx:1082-1084` - Direct job update (assigned_team_id)

**Pattern**:
```javascript
// ❌ Direct update without RPC
const { data, error } = await supabase
  .from('jobs')
  .update(payload)
  .eq('id', editingJob.id)
  .select()
  .single();
```

**Risk**: **RISK** - Direct table access relies entirely on RLS policies. If RLS is misconfigured, updates could affect wrong company's data.

**Mitigation**: 
- RLS policies on `jobs` table should prevent cross-company updates
- `company_id` is included in payload for inserts
- Updates use `.eq('id', jobId)` which should be company-scoped via RLS

**Recommendation**: Consider RPCs for critical mutations (job creation, updates) to add explicit company_id validation.

**Status**: 🟡 **RISK** - Relies on RLS. Functional but not defense-in-depth.

---

### 🟡 RISK: Direct Customer Deletes

**File**: `src/pages/admin/CustomersAdmin.jsx:1266`

**Code**:
```javascript
const { error } = await supabase
  .from('customers')
  .delete()
  .eq('id', id);
// ❌ No explicit company_id check
```

**Risk**: **RISK** - If `id` is manipulated or RLS is misconfigured, could delete wrong company's customer.

**Recommendation**: Add `.eq('company_id', companyId)` for defense-in-depth.

**Status**: 🟡 **RISK** - Relies on RLS.

---

## 6. Edge Functions Company Verification

### ✅ SAFE: invite-user Edge Function

**File**: `supabase/functions/invite-user/index.ts`

**Verification**:
- ✅ Line 76-84: Gets caller profile with company_id
- ✅ Line 86-88: Verifies caller is admin
- ✅ Line 90-92: Verifies caller has company_id
- ✅ Line 100-103: Validates provided company_id matches caller's company_id
- ✅ Line 112-124: Verifies customer belongs to caller's company
- ✅ Line 127-141: Verifies crew member belongs to caller's company

**Status**: ✅ **SAFE** - Comprehensive company verification.

---

### ✅ SAFE: create-customer-login Edge Function

**File**: `supabase/functions/create-customer-login/index.ts`

**Verification**:
- ✅ Line 112-128: Gets caller profile, verifies admin role and company_id
- ✅ Line 136-139: Validates provided company_id matches caller's company_id
- ✅ Line 157-162: Verifies customer belongs to caller's company with `.eq('company_id', callerCompanyId)`

**Status**: ✅ **SAFE** - Proper company verification.

---

### ✅ SAFE: signed-invoice-url Edge Function

**File**: `supabase/functions/signed-invoice-url/index.ts`

**Verification**:
- ✅ Line 101-125: Gets profile and verifies company_id
- ✅ Line 140-151: Validates path contains company_id matching caller's company_id
- ✅ Line 178-193: Verifies job belongs to caller's company
- ✅ Line 254-279: Verifies job belongs to customer for customer role

**Status**: ✅ **SAFE** - Comprehensive company and role-based verification.

---

### ✅ SAFE: extract-expense-receipt Edge Function

**File**: `supabase/functions/extract-expense-receipt/index.ts`

**Verification**:
- ✅ Line 102-126: Gets profile and verifies company_id
- ✅ Line 131-156: Fetches expense and verifies `expense.company_id === callerCompanyId`

**Status**: ✅ **SAFE** - Proper company verification.

---

### ✅ SAFE: auto-generate-recurring-jobs Edge Function

**File**: `supabase/functions/auto-generate-recurring-jobs/index.ts`

**Note**: This function runs as a cron job with service role, so it processes all companies. However:
- ✅ Line 70-73: Only processes companies with `auto_generate_recurring_jobs = true`
- ✅ Line 116-117: Filters recurring jobs to only those from allowed companies
- ✅ Line 164: Inserts jobs with `company_id: row.company_id` from the recurring job

**Status**: ✅ **SAFE** - Service role function that correctly scopes by company_id.

---

### ✅ SAFE: stripe-webhook Edge Function

**File**: `supabase/functions/stripe-webhook/index.ts`

**Note**: This function receives webhooks from Stripe, not from authenticated users. It:
- ✅ Line 197-248: Finds company by `stripe_customer_id` or `company_id` hint
- ✅ Line 336-339: Updates company with explicit `.eq('id', companyId)`

**Status**: ✅ **SAFE** - Webhook function correctly identifies and updates companies.

---

## 7. RLS Policy Coverage

### ✅ SAFE: Comprehensive RLS Policies

**Migration Files Analyzed**:
- `20260126000002_profiles_setup_and_rls.sql` - Profiles RLS
- `20260124190000_payments_ledger_overhaul.sql` - Payments RLS
- Multiple other migrations with RLS policies

**Key RLS Patterns**:
1. **Company Scoping**: Most tables use `company_id = public.current_company_id()`
2. **Role-Based Access**: Different policies for admin, crew, customer roles
3. **Helper Functions**: `current_company_id()`, `current_user_role()` for RLS

**Status**: ✅ **SAFE** - RLS policies are comprehensive and well-designed.

**Note**: RLS provides defense-in-depth, but explicit `company_id` filtering in queries is still recommended for:
- Performance (smaller result sets)
- Clarity (explicit intent)
- Defense-in-depth (multiple layers of security)

---

## 8. Summary of Issues

### 🔴 CRITICAL (3 issues)

1. **JobsAdmin.jsx:477** - Jobs query without `company_id` filter
2. **JobsAdmin.jsx:507** - Customers query without `company_id` filter  
3. **JobsAdmin.jsx:515** - Customer feedback query without `company_id` filter

### 🟡 RISK (11 issues)

1. **CustomersAdmin.jsx:1591** - Jobs query missing `company_id` (relies on customer_id validation)
2. **CustomersAdmin.jsx:1608** - Recurring jobs query missing `company_id`
3. **Multiple locations** - `.in('job_id', jobIds)` queries without `company_id` (8 instances)
4. **Multiple locations** - `.in('team_id', teamIds)` queries without `company_id` (5 instances)
5. **JobsAdmin.jsx:839, 875** - Direct job updates/inserts without RPC
6. **CustomersAdmin.jsx:1667** - Direct job insert without RPC
7. **ScheduleAdmin.jsx:1082** - Direct job update without RPC
8. **CustomersAdmin.jsx:1266** - Direct customer delete without `company_id` check
9. **Multiple locations** - Client-side filtering instead of server-side (performance/security concern)

### ✅ SAFE

- All edge functions properly verify company_id
- RLS policies are comprehensive
- Most queries correctly filter by `company_id`
- Critical operations (payments) use RPCs with company validation

---

## 9. Recommendations

### Immediate Actions (CRITICAL)

1. **Fix JobsAdmin.jsx queries** (Lines 477, 507, 515):
   ```javascript
   // Add .eq('company_id', companyId) to all three queries
   ```

2. **Add company_id filtering to all `.in()` queries**:
   ```javascript
   // Before
   .in('job_id', jobIds)
   
   // After
   .in('job_id', jobIds)
   .eq('company_id', companyId)  // Defense-in-depth
   ```

### High Priority (RISK)

3. **Move client-side filtering to server-side**:
   - Reduces data exposure
   - Improves performance
   - Prevents client-side manipulation

4. **Add company_id to direct updates/deletes**:
   ```javascript
   // Before
   .delete().eq('id', id)
   
   // After
   .delete().eq('id', id).eq('company_id', companyId)
   ```

5. **Consider RPCs for critical mutations**:
   - Job creation/updates
   - Customer deletion
   - Provides explicit company_id validation

### Best Practices

6. **Always include `.eq('company_id', companyId)` in queries**:
   - Even if RLS provides protection
   - Defense-in-depth principle
   - Better performance (smaller result sets)

7. **Validate company_id in all user inputs**:
   - Never trust client-provided company_id
   - Always derive from authenticated user's profile

8. **Use RPCs for complex operations**:
   - Multi-table updates
   - Business logic with company validation
   - Audit logging

---

## 10. Testing Recommendations

1. **Test cross-company data access**:
   - Create two test companies
   - Attempt to access Company B's data while authenticated as Company A
   - Verify RLS prevents access

2. **Test with manipulated IDs**:
   - Try to update/delete records with IDs from other companies
   - Verify operations fail

3. **Test edge functions**:
   - Call with company_id from different company
   - Verify rejection

4. **Load testing**:
   - Test with large datasets
   - Verify client-side filtering doesn't cause performance issues

---

## Conclusion

The application has **strong RLS policies** that provide a safety net, but **explicit `company_id` filtering is missing in critical locations**. The **3 CRITICAL issues** in `JobsAdmin.jsx` must be fixed immediately. The **11 RISK issues** should be addressed to follow defense-in-depth principles.

**Overall Security Posture**: 🟡 **RISK** - Functional but needs hardening.

**Edge Functions**: ✅ **SAFE** - All properly verify company_id.

**RLS Policies**: ✅ **SAFE** - Comprehensive coverage.

**Frontend Queries**: 🔴 **CRITICAL** - Missing company_id filters in key locations.
