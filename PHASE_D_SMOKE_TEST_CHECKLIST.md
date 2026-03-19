# Phase D: Smoke Test Checklist
**Service Ops SaaS - Launch Smoke Tests**

**Purpose**: Verify critical workflows function correctly before launch  
**Time Estimate**: 4-6 hours for complete checklist  
**Prerequisites**: Test environment with sample data

---

## Test Environment Setup

### Before Starting
- [ ] Test database with sample companies
- [ ] Test Stripe account (test mode)
- [ ] Test users for each role (admin, manager, dispatcher, crew, customer)
- [ ] Sample data: customers, jobs, quotes, invoices, routes
- [ ] Browser dev tools open (console, network)

### Test Accounts Needed
- [ ] Admin user (Company A)
- [ ] Manager user (Company A)
- [ ] Dispatcher user (Company A)
- [ ] Crew user (Company A)
- [ ] Customer user (Company A)
- [ ] Admin user (Company B) - for multi-tenant testing
- [ ] Platform admin user

---

## 1. Admin Portal Tests

### 1.1 Authentication & Landing
- [ ] **Test**: Admin login
  - **Steps**: Navigate to `/login`, enter admin credentials
  - **Expected**: Redirects to `/admin` (Admin Dashboard)
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Admin dashboard loads
  - **Steps**: Verify dashboard displays KPIs and navigation
  - **Expected**: Dashboard shows jobs, revenue, teams data
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.2 Customer Management
- [ ] **Test**: Create customer
  - **Steps**: Navigate to Customers, click "Add Customer", fill form, save
  - **Expected**: Customer created, appears in list
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Edit customer
  - **Steps**: Click customer, edit details, save
  - **Expected**: Changes saved, reflected in list
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Customer address validation
  - **Steps**: Create customer with address, verify address displays
  - **Expected**: Address stored and displayed correctly
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.3 Job Management
- [ ] **Test**: Create job
  - **Steps**: Navigate to Jobs, click "Add Job", fill form, save
  - **Expected**: Job created, appears in list
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Assign job to team
  - **Steps**: Edit job, select team from dropdown, save
  - **Expected**: Job assigned, team displayed in job list
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Update job status
  - **Steps**: Edit job, change status to "Completed", save
  - **Expected**: Status updated, job shows as completed
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Job filtering
  - **Steps**: Use filter dropdowns (status, team, date)
  - **Expected**: Jobs filtered correctly
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.4 Quote → Job Conversion
- [ ] **Test**: Create quote
  - **Steps**: Navigate to Quotes, create quote, add line items, save
  - **Expected**: Quote created, status "Draft"
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Send quote to customer
  - **Steps**: Open quote, click "Send Quote", enter customer email
  - **Expected**: Quote sent, status "Sent", customer receives email
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Customer accepts quote (see Customer Portal tests)
  - **Steps**: Customer logs in, views quote, accepts
  - **Expected**: Quote status "Accepted", job created automatically
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Verify job created from quote
  - **Steps**: Navigate to Jobs, verify job exists with quote data
  - **Expected**: Job created with correct customer, services, cost
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.5 Invoice Management
- [ ] **Test**: Generate invoice from job
  - **Steps**: Open job, click "Generate Invoice"
  - **Expected**: Invoice created, status "Draft"
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Send invoice
  - **Steps**: Open invoice, click "Send Invoice"
  - **Expected**: Invoice sent, status "Sent", customer receives email
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Invoice balance calculation
  - **Steps**: Record payment for job, verify invoice balance updates
  - **Expected**: Balance decreases by payment amount
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.6 Payment Recording
- [ ] **Test**: Record payment
  - **Steps**: Navigate to Payments or Revenue Hub, record payment for job
  - **Expected**: Payment recorded, job balance updated
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Overpayment protection
  - **Steps**: Try to record payment exceeding job cost
  - **Expected**: Error message, payment not recorded
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Multiple payments per job
  - **Steps**: Record multiple payments for same job
  - **Expected**: All payments recorded, balance calculated correctly
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.7 Route Generation
- [ ] **Test**: Generate route (single team/date)
  - **Steps**: Navigate to Operations > Routes, select team and date, click "Generate Route"
  - **Expected**: Route generated, stops displayed in order
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route optimization
  - **Steps**: Generate route with multiple jobs, verify stop order
  - **Expected**: Stops ordered optimally (nearest-neighbor)
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route status display
  - **Steps**: View route, verify status badge (draft/published)
  - **Expected**: Status displayed with tooltip
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Pre-generation validation
  - **Steps**: Generate route, verify validation summary appears
  - **Expected**: Validation shows job counts, missing addresses/coordinates
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.8 Dispatch Center
- [ ] **Test**: View today's operations
  - **Steps**: Navigate to Operations > Today
  - **Expected**: Shows today's jobs, crew load, unassigned jobs, route status
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Assign unassigned job
  - **Steps**: In Dispatch Center, select team for unassigned job
  - **Expected**: Job assigned, removed from unassigned list
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route mismatch detection
  - **Steps**: Create route mismatch (assign job after route generated)
  - **Expected**: Warning appears with "Regenerate Route" button
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route regeneration
  - **Steps**: Click "Regenerate Route" on mismatch warning
  - **Expected**: Route regenerated, mismatch resolved
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.9 Recurring Jobs
- [ ] **Test**: Create recurring schedule
  - **Steps**: Navigate to Recurring Jobs, create schedule
  - **Expected**: Schedule created, appears in list
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Generate jobs from recurring
  - **Steps**: Navigate to Operations > Automation, click "Generate Scheduled Jobs"
  - **Expected**: Jobs generated for due schedules
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Bulk route generation
  - **Steps**: Click "Generate Today's Draft Routes"
  - **Expected**: Routes generated for all teams with assigned jobs
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 1.10 Billing
- [ ] **Test**: View billing page
  - **Steps**: Navigate to Billing
  - **Expected**: Shows current plan, usage, limits
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Plan limit warning
  - **Steps**: Try to create customer/crew/job when at limit
  - **Expected**: Warning modal appears with upgrade CTA
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Checkout flow (Stripe test mode)
  - **Steps**: Click "Upgrade Plan", select plan, complete checkout
  - **Expected**: Redirects to Stripe, returns after payment, subscription active
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Billing portal access
  - **Steps**: Click "Manage Billing", verify portal opens
  - **Expected**: Stripe billing portal opens, allows subscription management
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 2. Crew Portal Tests

### 2.1 Authentication & Landing
- [ ] **Test**: Crew login
  - **Steps**: Navigate to `/login`, enter crew credentials
  - **Expected**: Redirects to `/crew` (Crew Portal)
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Crew portal loads
  - **Steps**: Verify portal displays jobs and route
  - **Expected**: Shows assigned jobs and today's route
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 2.2 Route Viewing
- [ ] **Test**: View today's route
  - **Steps**: Verify "Today's Route" section displays
  - **Expected**: Route shows ordered stops with customer names and addresses
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route stop order
  - **Steps**: Verify stops are in correct order
  - **Expected**: Stops ordered optimally (nearest-neighbor)
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Google Maps link
  - **Steps**: Click "Map" button on route stop
  - **Expected**: Opens Google Maps with address
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 2.3 Job Management
- [ ] **Test**: View assigned jobs
  - **Steps**: Verify jobs list displays
  - **Expected**: Shows jobs assigned to crew's team
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Job filtering
  - **Steps**: Use filter dropdowns (today, needs photos, etc.)
  - **Expected**: Jobs filtered correctly
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Upload before photo
  - **Steps**: Open job, upload before photo
  - **Expected**: Photo uploaded, displayed in job
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Upload after photo
  - **Steps**: Upload after photo
  - **Expected**: Photo uploaded, job ready to complete
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Complete job
  - **Steps**: Mark job as "Completed"
  - **Expected**: Status updated, job shows as completed
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 2.4 Payment Recording
- [ ] **Test**: Record payment
  - **Steps**: Open job, record payment
  - **Expected**: Payment recorded, balance updated
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Overpayment protection
  - **Steps**: Try to record payment exceeding job cost
  - **Expected**: Error message, payment not recorded
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Multiple payment methods
  - **Steps**: Record payments with different methods (Cash, Card, Check)
  - **Expected**: All methods work correctly
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 2.5 Access Control
- [ ] **Test**: Cannot access other teams' jobs
  - **Steps**: Verify crew only sees jobs for their team
  - **Expected**: Only team-assigned jobs visible
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Cannot access admin pages
  - **Steps**: Try to navigate to `/admin` pages
  - **Expected**: Redirected or access denied
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 3. Customer Portal Tests

### 3.1 Authentication & Landing
- [ ] **Test**: Customer login
  - **Steps**: Navigate to `/customer/login`, enter credentials
  - **Expected**: Redirects to `/customer/dashboard`
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Customer dashboard loads
  - **Steps**: Verify dashboard displays
  - **Expected**: Shows customer's jobs, quotes, invoices
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 3.2 Quote Viewing & Acceptance
- [ ] **Test**: View quotes
  - **Steps**: Navigate to Quotes
  - **Expected**: Shows customer's quotes
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: View quote details
  - **Steps**: Click quote, verify details display
  - **Expected**: Shows line items, total, status
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Accept quote
  - **Steps**: Click "Accept Quote"
  - **Expected**: Quote status "Accepted", job created
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Public quote access
  - **Steps**: Open public quote link (no auth)
  - **Expected**: Quote displays without login
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 3.3 Job Viewing
- [ ] **Test**: View jobs
  - **Steps**: Navigate to Jobs
  - **Expected**: Shows customer's jobs
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: View job details
  - **Steps**: Click job, verify details display
  - **Expected**: Shows services, status, cost, photos
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 3.4 Invoice Viewing
- [ ] **Test**: View invoices
  - **Steps**: Navigate to Invoices
  - **Expected**: Shows customer's invoices
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: View invoice details
  - **Steps**: Click invoice, verify details display
  - **Expected**: Shows line items, total, balance, status
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Download invoice
  - **Steps**: Click "Download Invoice"
  - **Expected**: PDF downloads with invoice details
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 3.5 Access Control
- [ ] **Test**: Cannot access other customers' data
  - **Steps**: Verify customer only sees their own data
  - **Expected**: Only customer's own jobs/quotes/invoices visible
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Cannot access admin pages
  - **Steps**: Try to navigate to `/admin` pages
  - **Expected**: Redirected or access denied
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 4. Billing Tests

### 4.1 Plan Selection
- [ ] **Test**: View available plans
  - **Steps**: Navigate to Billing, verify plans display
  - **Expected**: Shows Starter, Pro, Enterprise with features/limits
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: View current plan and usage
  - **Steps**: Verify current plan, usage counts, limits display
  - **Expected**: Shows plan name, usage vs limits
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 4.2 Checkout Flow (Stripe Test Mode)
- [ ] **Test**: Start checkout
  - **Steps**: Click "Upgrade Plan", select plan
  - **Expected**: Redirects to Stripe checkout
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Complete checkout
  - **Steps**: Use Stripe test card (4242 4242 4242 4242), complete payment
  - **Expected**: Returns to app, subscription active
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Verify subscription status
  - **Steps**: Check Billing page, verify subscription status "active"
  - **Expected**: Status updated, plan changed
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 4.3 Plan Limits
- [ ] **Test**: Limit enforcement (crew)
  - **Steps**: Try to create crew member when at limit
  - **Expected**: Warning modal, upgrade CTA, creation blocked
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Limit enforcement (customers)
  - **Steps**: Try to create customer when at limit
  - **Expected**: Warning modal, upgrade CTA, creation blocked
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Limit enforcement (jobs/month)
  - **Steps**: Try to create job when monthly limit reached
  - **Expected**: Warning modal, upgrade CTA, creation blocked
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 4.4 Billing Portal
- [ ] **Test**: Access billing portal
  - **Steps**: Click "Manage Billing"
  - **Expected**: Stripe billing portal opens
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Update payment method
  - **Steps**: In billing portal, update payment method
  - **Expected**: Payment method updated
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 4.5 Webhook Processing
- [ ] **Test**: Subscription created webhook
  - **Steps**: Complete checkout, verify webhook processed
  - **Expected**: Subscription status updated in database
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Subscription updated webhook
  - **Steps**: Change plan in Stripe, verify webhook processed
  - **Expected**: Plan updated in database
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Webhook idempotency
  - **Steps**: Resend webhook event, verify no duplicate processing
  - **Expected**: Event processed once, no duplicates
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 5. Routing Tests

### 5.1 Route Generation
- [ ] **Test**: Generate route (single team/date)
  - **Steps**: Operations > Routes, select team/date, generate
  - **Expected**: Route created with stops in optimal order
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Bulk route generation
  - **Steps**: Operations > Automation, generate today's routes
  - **Expected**: Routes created for all teams with assigned jobs
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route with missing addresses
  - **Steps**: Generate route with jobs missing addresses
  - **Expected**: Validation shows warning, route still generated
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route with missing coordinates
  - **Steps**: Generate route with jobs missing coordinates
  - **Expected**: Validation shows warning, route uses fallback ordering
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 5.2 Route Status
- [ ] **Test**: Route status display
  - **Steps**: View route, verify status badge
  - **Expected**: Status (draft/published) displayed with tooltip
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route status in Dispatch Center
  - **Steps**: View Dispatch Center, verify route status per team
  - **Expected**: Status displayed for each team's route
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 5.3 Route Mismatch
- [ ] **Test**: Route mismatch detection
  - **Steps**: Assign job after route generated
  - **Expected**: Warning appears in Dispatch Center
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route regeneration
  - **Steps**: Click "Regenerate Route" on mismatch
  - **Expected**: Route regenerated, mismatch resolved
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 5.4 Crew Route Access
- [ ] **Test**: Crew views route
  - **Steps**: Crew logs in, views today's route
  - **Expected**: Route displays with ordered stops
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route stop order
  - **Steps**: Verify stops in correct order
  - **Expected**: Stops ordered optimally
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 6. Support Mode Tests

### 6.1 Support Mode Entry
- [ ] **Test**: Platform admin enters support mode
  - **Steps**: Platform admin selects company, enters support mode
  - **Expected**: Support mode banner appears, read-only mode active
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Support mode banner
  - **Steps**: Verify banner displays "Support Mode — Read Only"
  - **Expected**: Banner visible on all admin pages
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 6.2 Read-Only Enforcement
- [ ] **Test**: Mutation buttons disabled
  - **Steps**: Verify all mutation buttons disabled in support mode
  - **Expected**: Buttons disabled with tooltips
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Route generation blocked
  - **Steps**: Try to generate route in support mode
  - **Expected**: Error toast, route not generated
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Job assignment blocked
  - **Steps**: Try to assign job in support mode
  - **Expected**: Error toast, assignment not saved
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Payment recording blocked
  - **Steps**: Try to record payment in support mode
  - **Expected**: Error toast, payment not recorded
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 6.3 Diagnostic Actions
- [ ] **Test**: Billing reconciliation
  - **Steps**: In support mode, click "Reconcile Billing"
  - **Expected**: Reconciliation runs, shows results
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: View company metrics
  - **Steps**: View company details in support mode
  - **Expected**: Metrics display, no mutations allowed
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 6.4 Multi-Tenant Isolation
- [ ] **Test**: No cross-tenant data access
  - **Steps**: In support mode for Company A, verify no Company B data visible
  - **Expected**: Only Company A data visible
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Support mode exit
  - **Steps**: Exit support mode, verify normal access restored
  - **Expected**: Banner disappears, mutations allowed
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 7. Error Handling Tests

### 7.1 User-Friendly Errors
- [ ] **Test**: Invalid input errors
  - **Steps**: Submit form with invalid data
  - **Expected**: User-friendly error message displayed
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Network error handling
  - **Steps**: Disconnect network, try action
  - **Expected**: Error message displayed, app doesn't crash
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Permission error handling
  - **Steps**: Try unauthorized action
  - **Expected**: Clear error message, action blocked
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 7.2 Error Tracking
- [ ] **Test**: Sentry error capture
  - **Steps**: Trigger error, verify Sentry receives it
  - **Expected**: Error appears in Sentry dashboard
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Product event logging
  - **Steps**: Perform key actions (create job, generate route)
  - **Expected**: Events logged in product_events table
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## 8. Multi-Tenant Isolation Tests

### 8.1 Data Isolation
- [ ] **Test**: Company A cannot see Company B data
  - **Steps**: Login as Company A admin, verify no Company B data visible
  - **Expected**: Only Company A data visible
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

- [ ] **Test**: Company B cannot see Company A data
  - **Steps**: Login as Company B admin, verify no Company A data visible
  - **Expected**: Only Company B data visible
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

### 8.2 RLS Enforcement
- [ ] **Test**: Direct database query (if possible)
  - **Steps**: Try to query other company's data directly
  - **Expected**: RLS blocks access
  - **Result**: [ ] Pass [ ] Fail [ ] Notes: _______________

---

## Test Summary

### Overall Results
- **Total Tests**: _______________
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________

### Critical Issues Found
1. _______________
2. _______________
3. _______________

### Notes
_______________
_______________
_______________

### Tester Signature
- **Name**: _______________
- **Date**: _______________
- **Approval**: [ ] Approved [ ] Needs Fixes

---

## Next Steps

### If All Tests Pass
- [ ] Proceed to launch approval
- [ ] Final documentation review
- [ ] Launch day preparation

### If Issues Found
- [ ] Document all issues
- [ ] Prioritize fixes (P0/P1/P2)
- [ ] Fix P0/P1 issues
- [ ] Re-test fixed issues
- [ ] Proceed to launch approval

---

*This checklist should be completed before launch. All critical tests must pass.*
