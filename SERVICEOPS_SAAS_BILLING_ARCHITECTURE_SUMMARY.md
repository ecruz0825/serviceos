# ServiceOps SaaS Billing Architecture Summary

**Date:** Architecture Planning Document  
**Purpose:** Comprehensive overview of the billing system for continued development

---

## 1. Stripe Integration Overview

### Edge Functions Related to Stripe

**Location:** `supabase/functions/`

**Functions:**

1. **`create-billing-checkout-session/index.ts`**
   - **Purpose:** Creates Stripe Checkout Sessions for new subscriptions
   - **Method:** POST
   - **Auth:** Requires admin role
   - **Key Features:**
     - Accepts optional `plan` parameter (starter/pro)
     - Creates Stripe customer if missing
     - Maps plan to Stripe price ID
     - Sets plan in both session and subscription metadata

2. **`create-billing-portal-session/index.ts`**
   - **Purpose:** Creates Stripe Billing Portal sessions for existing customers
   - **Method:** POST
   - **Auth:** Requires admin role + existing Stripe customer
   - **Key Features:**
     - Returns portal URL for plan changes, payment updates
     - Requires `stripe_customer_id` to exist

3. **`stripe-webhook/index.ts`**
   - **Purpose:** Handles Stripe webhook events
   - **Method:** POST
   - **Auth:** Validates Stripe signature
   - **Key Features:**
     - Processes subscription lifecycle events
     - Updates `companies` table with billing state
     - Resolves plan from subscription metadata/lookup_key

---

### Files That Create Checkout Sessions

**File:** `supabase/functions/create-billing-checkout-session/index.ts`

**Checkout Session Creation (Lines 199-216):**
```typescript
session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: stripeCustomerId,
  line_items: [{ price: selectedPriceId, quantity: 1 }],
  success_url: `${siteUrl}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${siteUrl}/admin/billing?checkout=canceled`,
  client_reference_id: company.id,
  metadata: {
    company_id: company.id,
    plan: selectedPlan,
  },
  subscription_data: {
    metadata: {
      company_id: company.id,
      plan: selectedPlan,
    },
  },
});
```

**Plan Selection Logic (Lines 140-151):**
- Priority: Request body `plan` → `company.plan` → `"starter"`
- Validates plan is "starter" or "pro"
- Maps to Stripe price ID via environment variables

---

### Files That Handle Stripe Webhooks

**File:** `supabase/functions/stripe-webhook/index.ts`

**Webhook Handler:**
- Validates Stripe signature using `STRIPE_WEBHOOK_SECRET`
- Processes multiple event types (see Section 6)
- Updates `companies` table via `applySubscriptionSnapshot()`

**Event Processing Flow:**
1. Verify webhook signature
2. Parse event type
3. Find company by `company_id` or `stripe_customer_id`
4. Retrieve subscription from Stripe (if needed)
5. Apply subscription snapshot to database

---

### Stripe Portal Session Creation

**File:** `supabase/functions/create-billing-portal-session/index.ts`

**Portal Session Creation (Lines 112-115):**
```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: company.stripe_customer_id,
  return_url: `${siteUrl}/admin/billing`,
});
```

**Requirements:**
- Company must have `stripe_customer_id` (created during checkout)
- Returns portal URL for customer self-service

---

## 2. Billing Data Model

### Companies Table

**Migration:** `supabase/migrations/20260309133000_add_companies_billing_fields.sql`

**Billing Columns:**
```sql
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS billing_updated_at timestamptz NULL;
```

**Constraints:**
- `subscription_status` CHECK constraint: `'inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'`
- Unique indexes on `stripe_customer_id` and `stripe_subscription_id` (nullable)

**Schema Summary:**
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `stripe_customer_id` | text | NULL | Yes | Stripe customer ID |
| `stripe_subscription_id` | text | NULL | Yes | Stripe subscription ID |
| `subscription_status` | text | 'inactive' | No | Current subscription state |
| `plan` | text | 'starter' | No | Plan tier (starter/pro) |
| `trial_ends_at` | timestamptz | NULL | Yes | Trial expiration date |
| `billing_grace_until` | timestamptz | NULL | Yes | Grace period end date |
| `billing_updated_at` | timestamptz | NULL | Yes | Last billing sync timestamp |

---

### Plan Limits Table

**Migration:** `supabase/migrations/20260310080002_plan_limits_table.sql`

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_code text PRIMARY KEY,
  max_crew integer NULL,
  max_customers integer NULL,
  max_jobs_per_month integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed Data:**
- `starter`: max_crew=3, max_customers=100, max_jobs_per_month=200
- `pro`: max_crew=NULL, max_customers=NULL, max_jobs_per_month=NULL (unlimited)

**RLS:** Read-only access for authenticated users

---

### Usage Tracking

**No dedicated usage tracking tables** - Usage is calculated on-demand via:

**Function:** `public.get_company_plan_usage(p_company_id uuid)`

**Returns:**
- `company_id`, `plan_code`
- `max_crew`, `max_customers`, `max_jobs_per_month` (from `plan_limits`)
- `current_crew`, `current_customers`, `current_jobs_this_month` (calculated counts)

**Implementation:** SQL function that joins `companies` → `plan_limits` and counts current usage

---

### Subscriptions Table

**Finding:** ❌ **No dedicated `subscriptions` table**

**Current Model:**
- Subscription data stored directly in `companies` table
- `stripe_subscription_id` links to Stripe subscription
- No local subscription history or audit trail

---

## 3. Plan Enforcement

### Crew Limits

**Enforcement Point:** Database trigger

**File:** `supabase/migrations/20260310080005_enforce_crew_plan_limit.sql`

**Trigger Function:** `public.enforce_crew_plan_limit()`
- **Trigger:** `BEFORE INSERT` on `public.crew_members`
- **Logic:**
  - Queries `get_company_plan_usage(NEW.company_id)`
  - If `max_crew IS NULL` → allow (unlimited)
  - If `current_crew >= max_crew` → raise exception
  - Exception: `CREW_LIMIT_REACHED: {plan_code} plan allows up to {max_crew} crew members. Upgrade to Pro to add more crew members.`

**Frontend Helper:** `src/utils/handlePlanLimitError.jsx`
- Detects `CREW_LIMIT_REACHED` in error message
- Shows toast with Upgrade CTA
- Navigates to `/admin/billing` on click

---

### Customer Limits

**Enforcement Point:** Database trigger

**File:** `supabase/migrations/20260310080004_enforce_customer_plan_limit.sql`

**Trigger Function:** `public.enforce_customer_plan_limit()`
- **Trigger:** `BEFORE INSERT` on `public.customers`
- **Logic:**
  - Queries `get_company_plan_usage(NEW.company_id)`
  - If `max_customers IS NULL` → allow (unlimited)
  - If `current_customers >= max_customers` → raise exception
  - Exception: `CUSTOMER_LIMIT_REACHED: {plan_code} plan allows up to {max_customers} customers. Upgrade to Pro to add more customers.`

**Frontend Helper:** Same `handlePlanLimitError.jsx` handles customer limits

---

### Job Limits

**Enforcement Point:** Database trigger

**File:** `supabase/migrations/20260310080006_enforce_monthly_job_plan_limit.sql`

**Trigger Function:** `public.enforce_monthly_job_plan_limit()`
- **Trigger:** `BEFORE INSERT` on `public.jobs`
- **Logic:**
  - Queries `get_company_plan_usage(NEW.company_id)`
  - Counts jobs created in current month: `created_at >= date_trunc('month', now())`
  - If `max_jobs_per_month IS NULL` → allow (unlimited)
  - If `current_jobs_this_month >= max_jobs_per_month` → raise exception
  - Exception: `JOB_LIMIT_REACHED: {plan_code} plan allows up to {max_jobs_per_month} jobs per month. Upgrade to Pro to create more jobs.`

**Frontend Helper:** Same `handlePlanLimitError.jsx` handles job limits

---

### Enforcement Summary

| Resource | Enforcement Point | Trigger | Frontend Helper |
|----------|------------------|---------|----------------|
| Crew | Database trigger | `BEFORE INSERT` on `crew_members` | `handlePlanLimitError.jsx` |
| Customers | Database trigger | `BEFORE INSERT` on `customers` | `handlePlanLimitError.jsx` |
| Jobs | Database trigger | `BEFORE INSERT` on `jobs` | `handlePlanLimitError.jsx` |

**All triggers:**
- Use `SECURITY DEFINER` to access `plan_limits` table
- Call `get_company_plan_usage()` for current usage
- Raise exceptions with consistent format: `{RESOURCE}_LIMIT_REACHED: {message}`

---

## 4. Stripe Price Configuration

### Environment Variables

**File:** `supabase/functions/create-billing-checkout-session/index.ts` (Lines 71-73)

**Variables:**
```typescript
const stripePriceId = Deno.env.get("STRIPE_SUBSCRIPTION_PRICE_ID") ?? "";  // Legacy/fallback
const stripeStarterPriceId = Deno.env.get("STRIPE_STARTER_PRICE_ID") ?? "";
const stripeProPriceId = Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "";
```

**Usage:**
- `STRIPE_STARTER_PRICE_ID`: Used for "starter" plan checkout
- `STRIPE_PRO_PRICE_ID`: Used for "pro" plan checkout
- `STRIPE_SUBSCRIPTION_PRICE_ID`: Fallback for starter if `STRIPE_STARTER_PRICE_ID` not set

**Price Mapping (Lines 154-157):**
```typescript
const priceIdMap: Record<string, string> = {
  starter: stripeStarterPriceId || stripePriceId,
  pro: stripeProPriceId,
};
```

**Error Handling (Lines 161-167):**
- Returns `PLAN_PRICE_ID_MISSING` error if selected plan has no configured price ID

---

### Frontend Code Usage

**File:** `src/pages/admin/BillingAdmin.jsx`

**No direct price ID usage** - Frontend only sends plan name ("starter" or "pro") to checkout function

**Checkout Request (Line 95):**
```jsx
const { data, error } = await supabase.functions.invoke("create-billing-checkout-session", {
  body: { plan: selectedPlan },
});
```

---

## 5. Billing UI

### Billing Page

**File:** `src/pages/admin/BillingAdmin.jsx`

**Components:**
- `PageHeader` - Title and subtitle
- `Card` - Multiple cards for different sections
- `Button` - Action buttons

**Sections:**

1. **Plan/Status Display Card (Lines 152-177)**
   - Current Plan (read-only)
   - Subscription Status (with color coding)
   - Trial Ends
   - Billing Grace Until
   - Last Billing Sync

2. **Usage & Limits Card (Lines 179-201)**
   - Crew Members: current / limit
   - Customers: current / limit
   - Jobs This Month: current / limit
   - Fetches data via `get_company_plan_usage()` RPC

3. **Stripe Actions Card (Lines 203-234)**
   - Plan selector (Starter/Pro radio buttons)
   - "Start Checkout" button
   - "Open Billing Portal" button
   - Error display area

---

### Upgrade Flow

**File:** `src/pages/admin/BillingAdmin.jsx`

**Flow:**
1. User selects plan (Starter or Pro) via radio buttons
2. Clicks "Start Checkout"
3. `startCheckout()` function:
   - Calls `create-billing-checkout-session` with `{ plan: selectedPlan }`
   - Redirects to Stripe Checkout URL
4. After Stripe checkout:
   - Webhook processes `checkout.session.completed`
   - Database updated with subscription
   - User redirected to `/admin/billing?checkout=success`

---

### Open Billing Portal

**File:** `src/pages/admin/BillingAdmin.jsx` (Lines 113-143)

**Function:** `openPortal()`
- Calls `create-billing-portal-session` edge function
- Redirects to Stripe Billing Portal URL
- Portal allows: plan changes, payment method updates, invoice viewing

**Availability:**
- Only enabled when `canOpenPortalByStatus` is true
- Requires: `subscription_status IN ['active', 'trialing', 'past_due', 'unpaid', 'canceled']`

---

### Start Checkout

**File:** `src/pages/admin/BillingAdmin.jsx` (Lines 90-111)

**Function:** `startCheckout()`
- Sends selected plan to checkout function
- Handles errors with toast notifications
- Redirects to Stripe Checkout URL on success

---

## 6. Webhook Handling

### Webhook Handler Location

**File:** `supabase/functions/stripe-webhook/index.ts`

**Signature Verification:**
- Validates `stripe-signature` header using `STRIPE_WEBHOOK_SECRET`
- Uses `stripe.webhooks.constructEventAsync()` for verification

---

### Stripe Events Handled

**1. `checkout.session.completed` (Lines 270-310)**
- **Purpose:** Initial subscription creation
- **Actions:**
  - Finds company by `session.metadata.company_id` or `session.client_reference_id`
  - Retrieves subscription from Stripe if `session.subscription` exists
  - Calls `applySubscriptionSnapshot()` to update database

**2. `customer.subscription.created` (Lines 312-351)**
- **Purpose:** New subscription created
- **Actions:**
  - Finds company by `subscription.metadata.company_id` or `stripe_customer_id`
  - Calls `applySubscriptionSnapshot()` to update database

**3. `customer.subscription.updated` (Lines 312-351)**
- **Purpose:** Subscription modified (plan change, quantity change, etc.)
- **Actions:**
  - Finds company by `subscription.metadata.company_id` or `stripe_customer_id`
  - Calls `applySubscriptionSnapshot()` to update database
  - **Most important for upgrades** - Updates `companies.plan` when user upgrades via Portal

**4. `customer.subscription.deleted` (Lines 312-351)**
- **Purpose:** Subscription canceled
- **Actions:**
  - Finds company by `subscription.metadata.company_id` or `stripe_customer_id`
  - Calls `applySubscriptionSnapshot()` with `forceStatus: "canceled"`

**5. `invoice.payment_succeeded` (Lines 353-397)**
- **Purpose:** Payment received
- **Actions:**
  - Finds company by `invoice.customer`
  - Retrieves subscription if `invoice.subscription` exists
  - Calls `applySubscriptionSnapshot()` to sync status

**6. `invoice.payment_failed` (Lines 353-397)**
- **Purpose:** Payment failed
- **Actions:**
  - Finds company by `invoice.customer`
  - Sets `subscription_status = 'past_due'`
  - Sets `billing_grace_until = now() + 7 days`

**Unhandled Events:**
- Returns `EVENT_IGNORED` response for other event types

---

### How companies.plan is Updated

**Function:** `resolvePlanFromSubscription()` (Lines 54-66)

**Priority Order:**
1. `subscription.metadata.plan` (if present and non-empty)
2. `subscription.items.data[0].price.lookup_key` (if present and non-empty)
3. Fallback: `company.plan || "starter"`

**Update Location:** `applySubscriptionSnapshot()` (Lines 236-259)
```typescript
const plan = resolvePlanFromSubscription(subscription, company.plan || "starter");

await updateCompany(company.id, {
  // ...
  plan,  // ✅ Plan updated here
  // ...
});
```

**Events That Update Plan:**
- `checkout.session.completed` (if subscription exists)
- `customer.subscription.created`
- `customer.subscription.updated` ⭐ **Most important for upgrades**
- `customer.subscription.deleted`
- `invoice.payment_succeeded` (if subscription exists)
- `invoice.payment_failed` (if subscription exists)

---

### How subscription_status is Updated

**Function:** `mapStripeStatusToAppStatus()` (Lines 38-41)

**Status Mapping:**
```typescript
const STRIPE_STATUS_TO_APP: Record<string, string> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "inactive",
  incomplete_expired: "canceled",
  paused: "past_due",
};
```

**Update Location:** `applySubscriptionSnapshot()` (Lines 243-258)
```typescript
const appStatus = forceStatus || mapStripeStatusToAppStatus(subscription.status);

await updateCompany(company.id, {
  // ...
  subscription_status: appStatus,
  billing_grace_until: appStatus === "past_due" || appStatus === "unpaid"
    ? buildGraceUntil(7)
    : null,
  // ...
});
```

**Special Cases:**
- `invoice.payment_failed` → `forceStatus: "past_due"`
- `customer.subscription.deleted` → `forceStatus: "canceled"`

---

## 7. Current Billing Flow

### Full Lifecycle: User Upgrades → Stripe Checkout → Webhook → Database Update → UI Refresh

**Step 1: User Initiates Upgrade**

**File:** `src/pages/admin/BillingAdmin.jsx`

1. User selects "Pro" plan via radio button
2. Clicks "Start Checkout"
3. `startCheckout()` called:
   ```jsx
   const { data, error } = await supabase.functions.invoke("create-billing-checkout-session", {
     body: { plan: "pro" },
   });
   ```
4. Redirects to `data.url` (Stripe Checkout)

---

**Step 2: Stripe Checkout**

**File:** `supabase/functions/create-billing-checkout-session/index.ts`

1. Receives `{ plan: "pro" }` in request body
2. Maps plan to price ID: `stripeProPriceId` from `STRIPE_PRO_PRICE_ID` env var
3. Creates Stripe customer if missing
4. Creates checkout session:
   - `line_items: [{ price: stripeProPriceId }]`
   - `metadata: { company_id, plan: "pro" }`
   - `subscription_data.metadata: { company_id, plan: "pro" }`
5. Returns checkout URL

---

**Step 3: User Completes Payment**

- User enters payment details in Stripe Checkout
- Stripe processes payment
- Stripe creates subscription with Pro price
- Stripe sends webhook: `checkout.session.completed`

---

**Step 4: Webhook Processing**

**File:** `supabase/functions/stripe-webhook/index.ts`

1. **Event:** `checkout.session.completed` (Line 270)
2. **Company Lookup:**
   - Uses `session.metadata.company_id` or `session.client_reference_id`
   - Falls back to `session.customer` (stripe_customer_id)
3. **Subscription Retrieval:**
   - If `session.subscription` exists, retrieves full subscription object
4. **Plan Resolution:**
   - Calls `resolvePlanFromSubscription(subscription, company.plan)`
   - Checks `subscription.metadata.plan` → finds "pro"
   - Returns "pro"
5. **Database Update:**
   - Calls `applySubscriptionSnapshot({ company, subscription })`
   - Updates `companies` table:
     - `plan = "pro"`
     - `subscription_status = "active"` (or "trialing" if trial)
     - `stripe_subscription_id = subscription.id`
     - `billing_updated_at = now()`

---

**Step 5: UI Refresh**

**File:** `src/pages/admin/BillingAdmin.jsx`

1. User redirected to `/admin/billing?checkout=success`
2. `UserContext` refetches company data (via `useUser()` hook)
3. `BillingAdmin` displays:
   - Updated plan: "Pro"
   - Updated subscription status
   - Updated usage/limits (now unlimited for Pro)

**UserContext Refresh:**
- `UserContext.jsx` loads company data on mount and auth changes
- Fetches: `subscription_status`, `plan`, `trial_ends_at`, `billing_grace_until`
- Makes data available via `useUser()` hook

---

### Alternative Flow: Upgrade via Billing Portal

**Step 1: User Opens Portal**
- Clicks "Open Billing Portal" in BillingAdmin
- Redirected to Stripe Billing Portal

**Step 2: User Changes Plan in Portal**
- Stripe Portal UI handles plan selection
- Stripe updates subscription
- Stripe sends webhook: `customer.subscription.updated`

**Step 3: Webhook Processing**
- Same as Step 4 above, but triggered by `customer.subscription.updated` event
- Plan resolution reads from `subscription.metadata.plan` or `price.lookup_key`

**Step 4: UI Refresh**
- User returns to `/admin/billing`
- UserContext refetches, UI updates

---

## 8. Known Limitations

### Idempotent Webhook Handling

**Status:** ❌ **Not Implemented**

**Current Behavior:**
- Webhook processes events without checking if already processed
- No event ID tracking or deduplication
- Risk: Duplicate webhook deliveries could cause duplicate updates

**Missing:**
- Webhook event log table
- Event ID deduplication logic
- Idempotency keys for updates

**Recommendation:**
- Create `stripe_webhook_events` table with `event_id` (unique)
- Check if event already processed before applying updates
- Log all webhook events for audit trail

---

### Stripe Event Logging

**Status:** ⚠️ **Partial - Console Logging Only**

**Current Behavior:**
- Webhook logs events to `console.log()` (JSON format)
- No persistent storage of webhook events
- No queryable history of billing changes

**Missing:**
- Database table for webhook events
- Event payload storage
- Query interface for event history

**Recommendation:**
- Create `stripe_webhook_events` table:
  - `event_id` (unique, from Stripe)
  - `event_type`
  - `processed_at`
  - `payload` (JSONB)
  - `company_id`
  - `processing_result` (success/error)

---

### Billing Audit History

**Status:** ❌ **Not Implemented**

**Current Behavior:**
- `billing_updated_at` tracks last update timestamp
- No history of plan changes, status changes, or billing events
- Cannot answer: "When did this company upgrade to Pro?"

**Missing:**
- Billing change history table
- Plan change tracking
- Status transition logging
- Who/what triggered the change

**Recommendation:**
- Create `billing_history` table:
  - `company_id`
  - `changed_at`
  - `changed_by` (user_id or 'webhook')
  - `field_name` (plan, subscription_status, etc.)
  - `old_value`, `new_value`
  - `source` ('checkout', 'webhook', 'admin', etc.)

---

### Duplicate Subscription Protection

**Status:** ⚠️ **Partial - Database Constraints Only**

**Current Behavior:**
- Unique index on `stripe_subscription_id` prevents duplicate subscriptions
- No check for multiple active subscriptions per company
- No validation that subscription matches company's current plan

**Missing:**
- Validation that only one active subscription exists per company
- Check that subscription plan matches `companies.plan`
- Handling for orphaned subscriptions (subscription exists but not linked)

**Recommendation:**
- Add validation in webhook: if company has active subscription, verify it matches Stripe
- Add RPC function to sync subscription state
- Add admin tool to reconcile subscription mismatches

---

### Trial Expiration Automation

**Status:** ⚠️ **Function Exists, Not Scheduled**

**Current Behavior:**
- `expire_trials()` function exists (migration: `20260310080001_expire_trials_function.sql`)
- Function updates expired trials to 'inactive'
- **Not scheduled** - Requires manual execution or cron setup

**Missing:**
- `pg_cron` job to run `expire_trials()` daily
- Monitoring/alerting for trial expiration failures

**Recommendation:**
- Create migration to schedule `expire_trials()` via `pg_cron`
- Run daily at midnight UTC
- Add error handling and logging

---

### Plan Limit Enforcement Gaps

**Status:** ⚠️ **Partial Coverage**

**Current Coverage:**
- ✅ Crew limits: Enforced via database trigger
- ✅ Customer limits: Enforced via database trigger
- ✅ Job limits: Enforced via database trigger (monthly)

**Missing:**
- ❌ Bulk import/seed operations (may bypass triggers if using service_role)
- ❌ Direct database access (admin tools, migrations)
- ❌ Edge function operations (if using service_role)

**Recommendation:**
- Add RPC functions for bulk operations that check limits
- Document that service_role operations bypass triggers
- Add validation in edge functions that create resources

---

### Error Handling in Webhook

**Status:** ⚠️ **Basic Error Handling**

**Current Behavior:**
- Returns error response if company not found
- Logs errors to console
- No retry mechanism for failed webhooks

**Missing:**
- Dead letter queue for failed webhooks
- Retry logic for transient failures
- Alerting for webhook processing failures

**Recommendation:**
- Implement webhook retry queue
- Add exponential backoff for retries
- Alert on repeated webhook failures

---

### Subscription Metadata Reliability

**Status:** ⚠️ **Depends on Stripe Configuration**

**Current Behavior:**
- Webhook reads plan from `subscription.metadata.plan` (priority 1)
- Falls back to `price.lookup_key` (priority 2)
- Falls back to existing `company.plan` (priority 3)

**Risk:**
- If Stripe doesn't set `subscription.metadata.plan`, webhook may not detect plan change
- If Stripe prices don't have `lookup_key`, fallback to existing plan may be stale

**Recommendation:**
- Ensure checkout always sets `subscription_data.metadata.plan` ✅ (Already implemented)
- Configure Stripe prices with `lookup_key` = "starter" and "pro"
- Add validation to warn if plan resolution uses fallback

---

## Summary

**Architecture Strengths:**
- ✅ Database-level plan limit enforcement (triggers)
- ✅ Centralized plan usage helper function
- ✅ Clean webhook event handling
- ✅ Plan selection in checkout
- ✅ Trial expiration function (needs scheduling)

**Architecture Gaps:**
- ❌ No webhook event logging/deduplication
- ❌ No billing audit history
- ❌ Trial expiration not scheduled
- ❌ Limited error recovery for webhooks
- ⚠️ Plan resolution depends on Stripe metadata configuration

**Recommended Next Steps:**
1. Add webhook event logging table
2. Schedule trial expiration cron job
3. Add billing history/audit table
4. Implement webhook idempotency
5. Add subscription reconciliation tools
