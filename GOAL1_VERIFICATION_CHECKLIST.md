# Goal 1 RLS Remediation: Verification Checklist & Test Audit

**Status:** Pre-deployment verification  
**Date:** 2024-03-15  
**Scope:** Phase 1, 2, and 3 RLS implementations + frontend hardening

---

## Executive Summary

This checklist verifies that tenant isolation RLS policies and frontend hardening patches are safe and do not break existing workflows.

**Tables Secured:**
- ✅ `expenses` (Phase 1)
- ✅ `crew_members` (Phase 1)
- ✅ `customers` (Phase 2)
- ✅ `customer_notes` (Phase 2)
- ✅ `customer_feedback` (Phase 3)
- ✅ `recurring_jobs` (Phase 3)
- ✅ `jobs` (Phase 3)

**Frontend Patches:**
- ✅ `UserContext.jsx` - Auto-linking hardening
- ✅ `CustomerDashboard.jsx` - Customer CRUD hardening
- ✅ `FeedbackForm.jsx` - Feedback INSERT hardening
- ✅ `AdminDashboard.jsx` - Recurring jobs query hardening
- ✅ `jobGenerators.js` - Recurring job UPDATE hardening

---

## Highest-Risk Areas (Test First)

### 🔴 CRITICAL - Test Immediately

1. **UserContext Auto-Linking** (Launch Blocker)
   - **Risk:** New users may fail to auto-link to customers
   - **Breakpoint:** Profile lookup fails or company_id missing
   - **Impact:** New customer signups may not link correctly

2. **AdminDashboard Recurring Jobs** (Launch Blocker)
   - **Risk:** Recurring job generation may fail if companyId not loaded
   - **Breakpoint:** `companyId` is null when `fetchAndGenerate` runs
   - **Impact:** Auto-generation of recurring jobs may not work

3. **FeedbackForm INSERT** (Launch Blocker)
   - **Risk:** Feedback submission fails if `job.customer_id` is missing
   - **Breakpoint:** Job object doesn't have `customer_id` property
   - **Impact:** Customers cannot submit feedback

4. **Crew Job Access** (High Risk)
   - **Risk:** Crew may lose access to jobs if team assignment logic is wrong
   - **Breakpoint:** EXISTS subquery doesn't match team membership correctly
   - **Impact:** Crew cannot see/update their assigned jobs

5. **Customer Job Access** (High Risk)
   - **Risk:** Customers may lose access to their own jobs
   - **Breakpoint:** Customer `user_id` not set or company_id mismatch
   - **Impact:** Customer portal shows no jobs

### 🟡 HIGH PRIORITY - Test Before Production

6. **Admin Customer Management** - Verify all CRUD operations work
7. **Admin Job Management** - Verify job creation/editing works
8. **Recurring Jobs Generation** - Verify auto-generation still works
9. **Customer Notes** - Verify admin can add/view notes
10. **Expenses Management** - Verify admin can manage expenses

---

## Detailed Verification Checklist

### 1. Admin Workflows

#### 1.1 Customers Management (`/admin/customers`)

**Test Cases:**

- [ ] **SELECT: View customers list**
  - Navigate to `/admin/customers`
  - Verify: Customers list loads correctly
  - Verify: Only shows customers from your company
  - **Breakpoint Risk:** RLS blocks all customers if `current_company_id()` fails
  - **Test Data:** Ensure test company has at least 2 customers

- [ ] **SELECT: Search/filter customers**
  - Use search bar to filter customers
  - Verify: Search works correctly
  - Verify: Results are still company-scoped
  - **Breakpoint Risk:** None (frontend filtering, RLS still applies)

- [ ] **INSERT: Create new customer**
  - Click "Add Customer" or create new customer
  - Fill in: full_name, address, phone, email
  - Submit
  - Verify: Customer is created successfully
  - Verify: Customer appears in list
  - Verify: `company_id` is set correctly (check in DB if possible)
  - **Breakpoint Risk:** RLS INSERT policy blocks if `current_company_id()` is null

- [ ] **UPDATE: Edit customer**
  - Click edit on an existing customer
  - Change name, address, or other fields
  - Save
  - Verify: Changes are saved
  - Verify: Updated customer still appears in list
  - **Breakpoint Risk:** RLS UPDATE policy blocks if company_id mismatch

- [ ] **DELETE: Delete customer**
  - Delete a test customer
  - Verify: Customer is removed from list
  - Verify: Customer is actually deleted (not just hidden)
  - **Breakpoint Risk:** RLS DELETE policy blocks if company_id mismatch

- [ ] **Customer Detail Drawer: View customer details**
  - Click on a customer to open detail drawer
  - Verify: Customer details load (overview, jobs, notes, timeline, files)
  - **Breakpoint Risk:** None (SELECT already verified)

- [ ] **Customer Notes: View notes**
  - Open customer detail drawer → Notes tab
  - Verify: Existing notes are visible
  - **Breakpoint Risk:** RLS blocks notes if customer relationship check fails

- [ ] **Customer Notes: Add note**
  - Add a new note to a customer
  - Verify: Note is saved
  - Verify: Note appears in notes list
  - **Breakpoint Risk:** RLS INSERT policy blocks if customer doesn't belong to company

- [ ] **Customer Notes: Delete note**
  - Delete an existing note
  - Verify: Note is removed
  - **Breakpoint Risk:** RLS DELETE policy blocks if customer relationship check fails

- [ ] **Cross-Tenant Isolation: Verify other company's customers are hidden**
  - If you have access to multiple companies (support mode), switch companies
  - Verify: Customer list changes to show only new company's customers
  - Verify: Previous company's customers are not visible
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access if `current_company_id()` is wrong

---

#### 1.2 Jobs Management (`/admin/jobs`)

**Test Cases:**

- [ ] **SELECT: View jobs list**
  - Navigate to `/admin/jobs`
  - Verify: Jobs list loads correctly
  - Verify: Only shows jobs from your company
  - **Breakpoint Risk:** RLS blocks all jobs if `current_company_id()` fails

- [ ] **SELECT: Filter jobs by status/team**
  - Use status filter dropdown
  - Use team/crew filter
  - Verify: Filters work correctly
  - Verify: Results are still company-scoped
  - **Breakpoint Risk:** None (frontend filtering, RLS still applies)

- [ ] **SELECT: View job details**
  - Click on a job to open detail drawer
  - Verify: Job details load (info, payments, invoices, feedback)
  - **Breakpoint Risk:** RLS blocks job if company_id mismatch

- [ ] **INSERT: Create new job**
  - Click "Add Job" or create new job
  - Fill in: customer, services, cost, date, team assignment
  - Submit
  - Verify: Job is created successfully
  - Verify: Job appears in list
  - Verify: `company_id` is set correctly
  - **Breakpoint Risk:** RLS INSERT policy blocks if:
     - `current_company_id()` is null
     - Customer doesn't belong to company (EXISTS check fails)

- [ ] **UPDATE: Edit job**
  - Edit an existing job (change status, cost, date, team)
  - Save
  - Verify: Changes are saved
  - Verify: Updated job still appears in list
  - **Breakpoint Risk:** RLS UPDATE policy blocks if company_id mismatch

- [ ] **UPDATE: Update job status**
  - Change job status (e.g., Pending → In Progress → Completed)
  - Verify: Status update works
  - **Breakpoint Risk:** Same as UPDATE above

- [ ] **DELETE: Delete job**
  - Delete a test job
  - Verify: Job is removed from list
  - **Breakpoint Risk:** RLS DELETE policy blocks if company_id mismatch

- [ ] **Customer Feedback: View feedback on jobs**
  - Open job detail drawer
  - Verify: Customer feedback is visible (if any exists)
  - **Breakpoint Risk:** RLS on `customer_feedback` blocks if relationship check fails

- [ ] **Cross-Tenant Isolation: Verify other company's jobs are hidden**
  - Switch companies (if support mode available)
  - Verify: Jobs list changes to show only new company's jobs
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access if `current_company_id()` is wrong

---

#### 1.3 Recurring Jobs Management (`/admin/recurring-jobs`)

**Test Cases:**

- [ ] **SELECT: View recurring jobs list**
  - Navigate to `/admin/recurring-jobs` (if route exists)
  - Or check AdminDashboard auto-generation
  - Verify: Recurring jobs load correctly
  - Verify: Only shows recurring jobs from your company
  - **Breakpoint Risk:** RLS blocks all recurring jobs if `current_company_id()` fails

- [ ] **SELECT: AdminDashboard auto-generation**
  - Navigate to `/admin` (AdminDashboard)
  - Verify: Page loads without errors
  - Verify: Recurring jobs are fetched (check network tab)
  - Verify: Only company's recurring jobs are fetched
  - **Breakpoint Risk:** 
     - `companyId` is null → query doesn't run (by design, but verify it doesn't error)
     - RLS blocks if `current_company_id()` fails

- [ ] **INSERT: Create recurring job**
  - Create a new recurring job template
  - Fill in: customer, start date, recurrence type, services, cost
  - Submit
  - Verify: Recurring job is created
  - Verify: `company_id` is set correctly
  - **Breakpoint Risk:** RLS INSERT policy blocks if:
     - `current_company_id()` is null
     - Customer doesn't belong to company (EXISTS check fails)

- [ ] **UPDATE: Edit recurring job**
  - Edit an existing recurring job
  - Change: recurrence type, cost, services, pause status
  - Save
  - Verify: Changes are saved
  - **Breakpoint Risk:** RLS UPDATE policy blocks if company_id mismatch

- [ ] **UPDATE: Auto-generation updates `last_generated_date`**
  - Wait for or trigger recurring job generation
  - Verify: `last_generated_date` is updated on recurring_jobs table
  - Verify: Update only affects the correct recurring job
  - **Breakpoint Risk:** 
     - Frontend patch missing `company_id` → could update wrong tenant's job
     - RLS UPDATE policy blocks if company_id mismatch

- [ ] **DELETE: Delete recurring job**
  - Delete a test recurring job
  - Verify: Recurring job is removed
  - **Breakpoint Risk:** RLS DELETE policy blocks if company_id mismatch

- [ ] **Cross-Tenant Isolation: Verify other company's recurring jobs are hidden**
  - Switch companies (if support mode available)
  - Verify: Recurring jobs list changes
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access if `current_company_id()` is wrong

---

#### 1.4 Expenses Management (`/admin/expenses`)

**Test Cases:**

- [ ] **SELECT: View expenses list**
  - Navigate to `/admin/expenses`
  - Verify: Expenses list loads correctly
  - Verify: Only shows expenses from your company
  - **Breakpoint Risk:** RLS blocks all expenses if `current_company_id()` fails

- [ ] **INSERT: Create expense**
  - Add a new expense
  - Fill in: amount, category, date, notes
  - Submit
  - Verify: Expense is created
  - Verify: `company_id` is set correctly
  - **Breakpoint Risk:** RLS INSERT policy blocks if `current_company_id()` is null

- [ ] **UPDATE: Edit expense**
  - Edit an existing expense
  - Save
  - Verify: Changes are saved
  - **Breakpoint Risk:** RLS UPDATE policy blocks if company_id mismatch

- [ ] **DELETE: Delete expense**
  - Delete a test expense
  - Verify: Expense is removed
  - **Breakpoint Risk:** RLS DELETE policy blocks if company_id mismatch

---

#### 1.5 Crew Members Management (`/admin/crew`)

**Test Cases:**

- [ ] **SELECT: View crew members list**
  - Navigate to `/admin/crew`
  - Verify: Crew members list loads correctly
  - Verify: Only shows crew from your company
  - **Breakpoint Risk:** RLS blocks all crew if `current_company_id()` fails

- [ ] **INSERT: Create crew member**
  - Add a new crew member
  - Fill in: name, email, phone
  - Submit
  - Verify: Crew member is created
  - Verify: `company_id` is set correctly
  - **Breakpoint Risk:** RLS INSERT policy blocks if `current_company_id()` is null

- [ ] **UPDATE: Edit crew member**
  - Edit an existing crew member
  - Save
  - Verify: Changes are saved
  - **Breakpoint Risk:** RLS UPDATE policy blocks if company_id mismatch

- [ ] **DELETE: Delete crew member**
  - Delete a test crew member
  - Verify: Crew member is removed
  - **Breakpoint Risk:** RLS DELETE policy blocks if company_id mismatch

- [ ] **Crew SELECT: Verify crew can see their own record**
  - Log in as a crew member
  - Verify: Crew member can see their own profile/record
  - **Breakpoint Risk:** RLS `crew_members_select_crew_own` blocks if `user_id` doesn't match

- [ ] **Crew SELECT: Verify crew can see company members**
  - Log in as a crew member
  - Verify: Crew member can see other crew in their company (for team visibility)
  - **Breakpoint Risk:** RLS `crew_members_select_crew_company` blocks if company_id mismatch

---

#### 1.6 Customer Feedback Visibility (Admin)

**Test Cases:**

- [ ] **SELECT: View feedback on jobs**
  - Navigate to `/admin/jobs`
  - Open a job that has customer feedback
  - Verify: Feedback is visible (rating, comment)
  - **Breakpoint Risk:** RLS `customer_feedback_select_admin` blocks if:
     - Company relationship check fails
     - Job/customer don't belong to company

- [ ] **SELECT: View all feedback for company**
  - Check if there's a feedback list/report page
  - Verify: Only company's feedback is shown
  - **Breakpoint Risk:** Same as above

---

### 2. Crew Workflows

#### 2.1 Crew Job Access (`/crew` or `/crew/jobs`)

**Test Cases:**

- [ ] **SELECT: View assigned jobs**
  - Log in as a crew member
  - Navigate to crew portal
  - Verify: Jobs list shows only jobs assigned to crew member's team
  - Verify: Jobs from other teams in same company are NOT visible
  - **Breakpoint Risk:** RLS `jobs_select_crew_assigned` blocks if:
     - Crew member is not on the assigned team
     - Team doesn't belong to company
     - EXISTS subquery fails to match team membership

- [ ] **SELECT: View job details**
  - Click on an assigned job
  - Verify: Job details load (customer info, services, payments, etc.)
  - **Breakpoint Risk:** Same as SELECT above

- [ ] **SELECT: Verify unassigned jobs are NOT visible**
  - Check jobs list
  - Verify: Jobs with `assigned_team_id = null` are NOT visible to crew
  - **Breakpoint Risk:** EXISTS subquery may incorrectly match null team_id

- [ ] **SELECT: Verify other company's jobs are NOT visible**
  - If possible, verify crew cannot see jobs from other companies
  - **Breakpoint Risk:** RLS allows cross-tenant access if `current_company_id()` is wrong

- [ ] **UPDATE: Update job status**
  - Mark a job as "In Progress" or "Completed"
  - Verify: Status update works
  - **Breakpoint Risk:** RLS `jobs_update_crew_assigned` blocks if:
     - Crew member is not on the assigned team
     - Company_id mismatch

- [ ] **UPDATE: Upload before/after images**
  - Upload before image to a job
  - Upload after image to a job
  - Verify: Images are saved
  - Verify: Job record is updated
  - **Breakpoint Risk:** Same as UPDATE above

- [ ] **UPDATE: Mark job complete**
  - Use "Mark Complete" button/action
  - Verify: Job status changes to "Completed"
  - Verify: Completion timestamp is set
  - **Breakpoint Risk:** Same as UPDATE above

- [ ] **UPDATE: Verify crew CANNOT update unassigned jobs**
  - Try to update a job that is not assigned to crew member's team
  - Verify: Update fails or is blocked
  - **Breakpoint Risk:** RLS UPDATE policy incorrectly allows access

- [ ] **UPDATE: Verify crew CANNOT update other company's jobs**
  - If possible, try to update a job from another company
  - Verify: Update is blocked
  - **Breakpoint Risk:** RLS UPDATE policy incorrectly allows cross-tenant access

- [ ] **INSERT: Verify crew CANNOT create jobs**
  - Try to create a new job as crew member
  - Verify: Creation is blocked (should fail with permission error)
  - **Breakpoint Risk:** RLS INSERT policy incorrectly allows crew to create jobs

- [ ] **DELETE: Verify crew CANNOT delete jobs**
  - Try to delete a job as crew member
  - Verify: Deletion is blocked
  - **Breakpoint Risk:** RLS DELETE policy incorrectly allows crew to delete jobs

---

### 3. Customer Workflows

#### 3.1 Customer Portal - Jobs (`/customer/jobs` or `/customer/dashboard`)

**Test Cases:**

- [ ] **SELECT: View own jobs**
  - Log in as a customer
  - Navigate to customer dashboard/jobs page
  - Verify: Jobs list shows only customer's own jobs
  - Verify: Jobs from other customers are NOT visible
  - **Breakpoint Risk:** RLS `jobs_select_customer_own` blocks if:
     - `customer.user_id` doesn't match `auth.uid()`
     - Customer doesn't belong to company
     - EXISTS subquery fails

- [ ] **SELECT: View job details**
  - Click on a job
  - Verify: Job details load (services, cost, payments, invoices, feedback)
  - **Breakpoint Risk:** Same as SELECT above

- [ ] **SELECT: Verify other customer's jobs are NOT visible**
  - Verify: Customer cannot see jobs belonging to other customers
  - **Breakpoint Risk:** RLS allows cross-customer access if relationship check fails

- [ ] **SELECT: Verify other company's jobs are NOT visible**
  - If possible, verify customer cannot see jobs from other companies
  - **Breakpoint Risk:** RLS allows cross-tenant access if `current_company_id()` is wrong

- [ ] **INSERT: Verify customer CANNOT create jobs**
  - Try to create a new job as customer
  - Verify: Creation is blocked
  - **Breakpoint Risk:** RLS INSERT policy incorrectly allows customer to create jobs

- [ ] **UPDATE: Verify customer CANNOT update jobs**
  - Try to update a job as customer (e.g., change status, cost)
  - Verify: Update is blocked (should fail silently or show error)
  - **Breakpoint Risk:** 
     - RLS UPDATE policy incorrectly allows customer updates
     - Note: Customer UPDATE was intentionally disabled per requirements

- [ ] **DELETE: Verify customer CANNOT delete jobs**
  - Try to delete a job as customer
  - Verify: Deletion is blocked
  - **Breakpoint Risk:** RLS DELETE policy incorrectly allows customer to delete jobs

---

#### 3.2 Customer Portal - Feedback Submission

**Test Cases:**

- [ ] **INSERT: Submit feedback on own job**
  - Log in as a customer
  - Navigate to a job detail page
  - Submit feedback (rating + comment)
  - Verify: Feedback is submitted successfully
  - Verify: Feedback appears on job detail page
  - **Breakpoint Risk:** 
     - Frontend patch: `job.customer_id` is missing → INSERT fails
     - RLS INSERT policy blocks if:
        - `customer.user_id` doesn't match `auth.uid()`
        - Job doesn't belong to customer
        - Company relationship check fails

- [ ] **INSERT: Verify feedback includes customer_id**
  - Check network request in browser dev tools
  - Verify: INSERT payload includes `customer_id: job.customer_id`
  - **Breakpoint Risk:** Frontend patch not applied correctly

- [ ] **INSERT: Verify cannot submit feedback on other customer's job**
  - Try to submit feedback on a job that doesn't belong to customer
  - Verify: Submission is blocked
  - **Breakpoint Risk:** RLS INSERT policy incorrectly allows cross-customer feedback

- [ ] **SELECT: View own feedback**
  - View a job where customer has submitted feedback
  - Verify: Feedback is visible (rating, comment)
  - **Breakpoint Risk:** RLS SELECT policy blocks if relationship check fails

- [ ] **UPDATE: Update own feedback (if allowed)**
  - Try to edit previously submitted feedback
  - Verify: Update works (if feature exists)
  - **Breakpoint Risk:** RLS UPDATE policy blocks if relationship check fails

---

#### 3.3 Customer Portal - Invoices/Quotes

**Test Cases:**

- [ ] **SELECT: View own invoices**
  - Navigate to customer invoices page
  - Verify: Only customer's own invoices are shown
  - **Breakpoint Risk:** RLS on `invoices` table (already has RLS) blocks if relationship check fails

- [ ] **SELECT: View own quotes**
  - Navigate to customer quotes page
  - Verify: Only customer's own quotes are shown
  - **Breakpoint Risk:** RLS on `quotes` table (already has RLS) blocks if relationship check fails

- [ ] **SELECT: Verify cannot see other customer's invoices/quotes**
  - Verify: Customer cannot access invoices/quotes from other customers
  - **Breakpoint Risk:** RLS allows cross-customer access if relationship check fails

---

#### 3.4 Customer Portal - Own Customer Record

**Test Cases:**

- [ ] **SELECT: View own customer record**
  - Customer should be able to see their own customer record/profile
  - Verify: Customer details are visible
  - **Breakpoint Risk:** RLS `customers_select_customer_own` blocks if `user_id` doesn't match

- [ ] **UPDATE: Update own customer record**
  - Customer edits their profile (name, address, phone, email)
  - Verify: Changes are saved
  - **Breakpoint Risk:** RLS `customers_update_customer_own` blocks if:
     - `user_id` doesn't match
     - `company_id` mismatch

- [ ] **INSERT: Verify customer CANNOT create other customer records**
  - Try to create a new customer record as customer
  - Verify: Creation is blocked (or only allows self-registration)
  - **Breakpoint Risk:** RLS INSERT policy incorrectly allows customer to create arbitrary records

---

### 4. Cross-Tenant Isolation Tests

#### 4.1 Multi-Company Setup (If Available)

**Prerequisites:** Two test companies with separate data

**Test Cases:**

- [ ] **Company A cannot see Company B's customers**
  - Log in as admin of Company A
  - Navigate to customers page
  - Verify: Only Company A's customers are visible
  - Switch to Company B (if support mode available)
  - Verify: Customer list changes to Company B's customers
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access if `current_company_id()` returns wrong value

- [ ] **Company A cannot see Company B's jobs**
  - Log in as admin of Company A
  - Navigate to jobs page
  - Verify: Only Company A's jobs are visible
  - Switch to Company B
  - Verify: Jobs list changes to Company B's jobs
  - **Breakpoint Risk:** Same as above

- [ ] **Company A cannot see Company B's recurring jobs**
  - Log in as admin of Company A
  - Check recurring jobs (AdminDashboard or recurring jobs page)
  - Verify: Only Company A's recurring jobs are visible
  - **Breakpoint Risk:** 
     - Frontend patch: `companyId` is null → may show all companies
     - RLS SELECT policy allows cross-tenant access

- [ ] **Company A cannot see Company B's expenses**
  - Log in as admin of Company A
  - Navigate to expenses page
  - Verify: Only Company A's expenses are visible
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access

- [ ] **Company A cannot see Company B's crew members**
  - Log in as admin of Company A
  - Navigate to crew page
  - Verify: Only Company A's crew are visible
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access

- [ ] **Company A cannot see Company B's customer notes**
  - Log in as admin of Company A
  - Open a customer detail drawer
  - View notes tab
  - Verify: Only notes for Company A's customers are visible
  - **Breakpoint Risk:** RLS SELECT policy allows cross-tenant access if relationship check fails

- [ ] **Company A cannot INSERT/UPDATE/DELETE Company B's data**
  - Try to create/edit/delete a record that belongs to Company B
  - Verify: Operation is blocked
  - **Breakpoint Risk:** RLS INSERT/UPDATE/DELETE policies allow cross-tenant mutations if `current_company_id()` is wrong

---

### 5. Regression Risks from Frontend Hardening Patches

#### 5.1 UserContext Auto-Linking (`src/context/UserContext.jsx`)

**Test Cases:**

- [ ] **New user signup with matching customer email**
  - Create a new user account with email that matches an existing unlinked customer
  - Verify: User is automatically linked to customer record
  - Verify: Link only happens if customer belongs to user's company
  - **Breakpoint Risk:** 
     - Profile lookup fails → auto-link doesn't run
     - `company_id` filter too strict → no customer found
     - UPDATE query fails if company_id mismatch

- [ ] **New user signup with NO matching customer**
  - Create a new user account with email that doesn't match any customer
  - Verify: Signup succeeds (no error)
  - Verify: User can still log in
  - **Breakpoint Risk:** Auto-link logic throws error and breaks signup flow

- [ ] **Existing user with already-linked customer**
  - Log in as user who already has linked customer
  - Verify: Login works normally
  - Verify: No duplicate linking attempts
  - **Breakpoint Risk:** Auto-link tries to link already-linked customer

- [ ] **User with profile but no company_id**
  - Log in as user whose profile has `company_id = null`
  - Verify: Auto-link doesn't run (early return)
  - Verify: User can still log in (may have limited functionality)
  - **Breakpoint Risk:** Auto-link throws error if profile lookup fails

- [ ] **Cross-tenant email match**
  - Create user with email that matches customer from DIFFERENT company
  - Verify: Auto-link does NOT happen (customer should not be linked)
  - **Breakpoint Risk:** `company_id` filter missing → wrong customer gets linked

---

#### 5.2 AdminDashboard Recurring Jobs Query (`src/AdminDashboard.jsx`)

**Test Cases:**

- [ ] **AdminDashboard loads with companyId**
  - Navigate to `/admin` as admin user
  - Verify: Page loads without errors
  - Verify: Recurring jobs are fetched (check network tab)
  - Verify: Only company's recurring jobs are fetched
  - **Breakpoint Risk:** 
     - `companyId` is null → query doesn't run (by design, but verify no errors)
     - Profile lookup fails → `companyId` stays null → no recurring jobs fetched

- [ ] **AdminDashboard with delayed companyId**
  - Navigate to `/admin` immediately after login
  - Verify: Page loads, then recurring jobs fetch when `companyId` becomes available
  - Verify: No errors in console
  - **Breakpoint Risk:** Race condition where query runs before `companyId` is set

- [ ] **AdminDashboard recurring job generation**
  - Ensure there are active recurring jobs
  - Navigate to `/admin`
  - Verify: Recurring jobs are generated (if due today)
  - Verify: Only company's recurring jobs are generated
  - **Breakpoint Risk:** 
     - Query returns all companies → generates jobs for wrong company
     - `companyId` is null → no jobs generated

- [ ] **AdminDashboard with no recurring jobs**
  - Navigate to `/admin` when company has no recurring jobs
  - Verify: Page loads without errors
  - Verify: No errors in console
  - **Breakpoint Risk:** Query fails if RLS blocks all rows incorrectly

---

#### 5.3 FeedbackForm INSERT Payload (`src/components/FeedbackForm.jsx`)

**Test Cases:**

- [ ] **Submit feedback with job that has customer_id**
  - Navigate to job detail page as customer
  - Job object should have `customer_id` property
  - Submit feedback
  - Verify: Feedback is submitted successfully
  - Verify: INSERT payload includes `customer_id` (check network tab)
  - **Breakpoint Risk:** 
     - `job.customer_id` is undefined → INSERT fails
     - RLS INSERT policy blocks if `customer_id` doesn't match relationship

- [ ] **Submit feedback with job missing customer_id**
  - If possible, test with a job object that doesn't have `customer_id`
  - Verify: INSERT fails gracefully (shows error message)
  - Verify: Error message is user-friendly
  - **Breakpoint Risk:** 
     - Code crashes if `job.customer_id` is undefined
     - INSERT fails silently

- [ ] **Submit feedback on own job**
  - Customer submits feedback on their own job
  - Verify: Feedback is saved
  - Verify: Feedback appears on job detail page
  - **Breakpoint Risk:** RLS INSERT policy blocks if relationship check fails

- [ ] **Submit feedback on other customer's job (should fail)**
  - Try to submit feedback on a job that doesn't belong to customer
  - Verify: Submission is blocked
  - **Breakpoint Risk:** RLS INSERT policy incorrectly allows cross-customer feedback

---

#### 5.4 JobGenerators Recurring Job UPDATE (`src/utils/jobGenerators.js`)

**Test Cases:**

- [ ] **Auto-generate jobs updates last_generated_date**
  - Trigger recurring job generation (or wait for scheduled run)
  - Verify: `last_generated_date` is updated on recurring_jobs table
  - Verify: Only the correct recurring job is updated
  - **Breakpoint Risk:** 
     - Frontend patch missing → could update wrong tenant's recurring job
     - RLS UPDATE policy blocks if company_id mismatch

- [ ] **Auto-generate with multiple recurring jobs**
  - Have multiple recurring jobs from same company
  - Trigger generation
  - Verify: All eligible recurring jobs have `last_generated_date` updated
  - Verify: Only company's recurring jobs are updated
  - **Breakpoint Risk:** UPDATE query affects wrong recurring jobs

- [ ] **Auto-generate with recurring job missing company_id**
  - If possible, test with recurring job where `job.company_id` is null
  - Verify: UPDATE fails gracefully
  - **Breakpoint Risk:** Code crashes if `job.company_id` is undefined

---

### 6. Edge Cases & Error Scenarios

#### 6.1 Null/Missing company_id

**Test Cases:**

- [ ] **User with null company_id**
  - Log in as user whose profile has `company_id = null`
  - Verify: User can still log in
  - Verify: Data access is blocked (expected - user has no company context)
  - **Breakpoint Risk:** App crashes or shows confusing errors

- [ ] **Profile lookup fails**
  - Simulate profile lookup failure (e.g., network error)
  - Verify: App handles error gracefully
  - Verify: User sees appropriate error message
  - **Breakpoint Risk:** App crashes or shows blank screen

---

#### 6.2 Role-Based Access

**Test Cases:**

- [ ] **Admin accessing as crew**
  - Log in as admin, but verify RLS still enforces admin policies
  - Verify: Admin can access all company data
  - **Breakpoint Risk:** RLS incorrectly blocks admin access

- [ ] **Crew accessing as admin**
  - Log in as crew, verify RLS enforces crew policies
  - Verify: Crew can only access assigned jobs
  - **Breakpoint Risk:** RLS incorrectly allows crew to access all jobs

- [ ] **Customer accessing as admin**
  - Log in as customer, verify RLS enforces customer policies
  - Verify: Customer can only access own data
  - **Breakpoint Risk:** RLS incorrectly allows customer to access all company data

---

#### 6.3 Relationship Integrity

**Test Cases:**

- [ ] **Job with customer from different company**
  - If possible, test with data integrity issue (job.customer_id points to wrong company)
  - Verify: RLS blocks access to such jobs
  - **Breakpoint Risk:** RLS allows access if relationship check doesn't verify company match

- [ ] **Job with team from different company**
  - If possible, test with data integrity issue (job.assigned_team_id points to wrong company)
  - Verify: RLS blocks crew access to such jobs
  - **Breakpoint Risk:** RLS allows access if relationship check doesn't verify company match

- [ ] **Customer feedback with job/customer mismatch**
  - If possible, test with data integrity issue
  - Verify: RLS blocks access to such feedback
  - **Breakpoint Risk:** RLS allows access if relationship check doesn't verify company match

---

## Test Execution Order

### Phase 1: Critical Path (Do First)
1. UserContext auto-linking (new user signup)
2. AdminDashboard recurring jobs query
3. FeedbackForm INSERT with customer_id
4. Crew job access (SELECT and UPDATE)
5. Customer job access (SELECT)

### Phase 2: Admin Workflows (Do Second)
6. Admin customers CRUD
7. Admin jobs CRUD
8. Admin recurring jobs management
9. Admin expenses management
10. Admin crew members management
11. Admin customer notes management

### Phase 3: Cross-Tenant Isolation (Do Third)
12. Multi-company isolation tests
13. Role-based access verification
14. Relationship integrity tests

### Phase 4: Edge Cases (Do Last)
15. Null company_id scenarios
16. Profile lookup failures
17. Data integrity edge cases

---

## Likely Breakpoints Introduced by RLS

### High Probability Breakpoints

1. **`current_company_id()` returns NULL**
   - **Symptom:** All queries return empty results
   - **Cause:** User profile missing `company_id` or profile lookup fails
   - **Affected:** All tables with RLS
   - **Mitigation:** Ensure all users have valid `company_id` in profiles

2. **Crew team membership not matching**
   - **Symptom:** Crew cannot see assigned jobs
   - **Cause:** `team_members` relationship not set up correctly, or crew member not on team
   - **Affected:** `jobs` table SELECT/UPDATE for crew
   - **Mitigation:** Verify team_members records exist and are correct

3. **Customer `user_id` not set**
   - **Symptom:** Customer cannot see their own jobs/feedback
   - **Cause:** Customer record not linked to user account
   - **Affected:** `jobs`, `customer_feedback` SELECT for customers
   - **Mitigation:** Ensure customer auto-linking works or manually link customers

4. **FeedbackForm missing `customer_id`**
   - **Symptom:** Feedback submission fails
   - **Cause:** Job object doesn't have `customer_id` property
   - **Affected:** `customer_feedback` INSERT
   - **Mitigation:** Ensure job objects always include `customer_id`

5. **AdminDashboard `companyId` not loaded**
   - **Symptom:** Recurring jobs not generated
   - **Cause:** Profile lookup fails or `companyId` state not set
   - **Affected:** Recurring job auto-generation
   - **Mitigation:** Verify `companyId` is loaded before query runs

### Medium Probability Breakpoints

6. **EXISTS subquery performance**
   - **Symptom:** Slow queries, especially on large datasets
   - **Cause:** EXISTS subqueries in RLS policies not optimized
   - **Affected:** `jobs`, `customer_feedback`, `customer_notes` queries
   - **Mitigation:** Monitor query performance, add indexes if needed

7. **Team assignment edge cases**
   - **Symptom:** Crew cannot access jobs assigned to their team
   - **Cause:** Team-of-one scenarios, or team_members relationship not set up
   - **Affected:** `jobs` SELECT/UPDATE for crew
   - **Mitigation:** Verify team_members records for all crew

8. **Customer relationship verification**
   - **Symptom:** Customer cannot access their own data
   - **Cause:** `customers.user_id` doesn't match `auth.uid()`
   - **Affected:** `jobs`, `customer_feedback` SELECT for customers
   - **Mitigation:** Verify customer auto-linking works correctly

---

## Pre-Deployment Checklist

- [ ] All Phase 1 critical path tests pass
- [ ] All Phase 2 admin workflow tests pass
- [ ] All Phase 3 cross-tenant isolation tests pass
- [ ] No console errors in browser dev tools
- [ ] No RLS policy violations in Supabase logs
- [ ] Query performance is acceptable (< 500ms for list queries)
- [ ] All user roles (admin, crew, customer) can access their expected data
- [ ] No data leakage between companies (verified manually)
- [ ] Frontend patches work correctly (companyId loaded, customer_id included)
- [ ] Edge cases handled gracefully (null company_id, missing relationships)

---

## Post-Deployment Monitoring

**Monitor for 24-48 hours after deployment:**

1. **Supabase Logs:**
   - Check for RLS policy violations
   - Check for query errors
   - Monitor query performance

2. **User Reports:**
   - Watch for "no data" reports (likely RLS blocking)
   - Watch for "permission denied" errors
   - Watch for auto-linking failures

3. **Error Tracking:**
   - Monitor Sentry/error tracking for RLS-related errors
   - Watch for `current_company_id()` returning null
   - Watch for EXISTS subquery failures

---

## Rollback Plan

If critical issues are found:

1. **Immediate Rollback:**
   - Revert migrations in reverse order:
     - `20260315000006_rls_jobs_tenant_isolation.sql`
     - `20260315000005_rls_recurring_jobs_tenant_isolation.sql`
     - `20260315000004_rls_customer_feedback_tenant_isolation.sql`
     - `20260315000003_rls_customer_notes_tenant_isolation.sql`
     - `20260315000002_rls_customers_tenant_isolation.sql`
     - `20260315000001_rls_crew_members_tenant_isolation.sql`
     - `20260315000000_rls_expenses_tenant_isolation.sql`

2. **Frontend Patches:**
   - Frontend patches are safe to leave (they add defense-in-depth)
   - Only revert if they cause specific issues

3. **Investigation:**
   - Check Supabase logs for specific policy violations
   - Verify `current_company_id()` function works correctly
   - Verify user profiles have valid `company_id` values

---

**Document Version:** 1.0  
**Last Updated:** 2024-03-15  
**Status:** Ready for Testing
