# ServiceOps Billing Production Hardening Audit

**Date:** Production Readiness Investigation  
**Purpose:** Identify gaps and requirements for production-grade SaaS billing system

---

## 1. Current Billing Implementation Summary

### 1.1 Edge Functions

#### `supabase/functions/create-billing-checkout-session/index.ts`
- **Function:** `serve()` handler
- **Purpose:** Creates Stripe Checkout Sessions for new subscriptions
- **Auth:** Requires admin role via `callerProfile.role !== "admin"` check (line 109)
- **Key Operations:**
  - Accepts optional `plan` in request body (lines 130-138)
  - Creates Stripe customer if missing (lines 173-195)
  - Maps plan to price ID via env vars: `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID` (lines 154-157)
  - Creates checkout session with metadata: `company_id`, `plan` (lines 206-215)
  - Sets `subscription_data.metadata` with same values (lines 210-214)
- **No Duplicate Protection:** Does not check if company already has active/trialing subscription before creating checkout
- **No Event Logging:** No database writes for checkout session creation

#### `supabase/functions/create-billing-portal-session/index.ts`
- **Function:** `serve()` handler
- **Purpose:** Creates Stripe Billing Portal sessions
- **Auth:** Requires admin role (line 83)
- **Key Operations:**
  - Validates `stripe_customer_id` exists (lines 103-109)
  - Creates portal session (lines 112-115)
  - Returns portal URL
- **No Event Logging:** No database writes for portal session creation

#### `supabase/functions/stripe-webhook/index.ts`
- **Function:** `serve()` handler
- **Purpose:** Processes Stripe webhook events
- **Auth:** Validates Stripe signature via `stripe.webhooks.constructEventAsync()` (lines 129-133)
- **Key Functions:**
  - `findCompany()` (lines 151-202): Looks up company by `companyIdHint` or `stripeCustomerId`
  - `updateCompany()` (lines 204-234): Updates `companies` table with billing fields
  - `applySubscriptionSnapshot()` (lines 236-259): Applies subscription state to company
  - `resolvePlanFromSubscription()` (lines 54-66): Resolves plan from metadata/lookup_key
  - `mapStripeStatusToAppStatus()` (lines 38-41): Maps Stripe status to app status

---

### 1.2 Frontend Components

#### `src/pages/admin/BillingAdmin.jsx`
- **Component:** `BillingAdmin()`
- **Purpose:** Admin UI for billing management
- **Key Functions:**
  - `startCheckout()` (lines 90-117): Invokes `create-billing-checkout-session` with selected plan
  - `openPortal()` (lines 119-149): Invokes `create-billing-portal-session`
- **State Management:**
  - Reads billing state from `useUser()` hook (line 19)
  - Displays: plan, subscription_status, trial_ends_at, billing_grace_until, billing_updated_at
  - Fetches usage via `get_company_plan_usage()` RPC (lines 46-65)

#### `src/context/UserContext.jsx`
- **Function:** `loadUser()` (lines 151-193)
- **Purpose:** Hydrates billing state into frontend
- **Key Operations:**
  - Fetches company billing fields (line 158): `subscription_status, plan, trial_ends_at, billing_grace_until, billing_updated_at`
  - Merges into profile object (lines 167-176)
  - Makes available via `useUser()` hook

---

### 1.3 Database Migrations

#### `supabase/migrations/20260309133000_add_companies_billing_fields.sql`
- **Purpose:** Adds billing columns to `companies` table
- **Columns Added:**
  - `stripe_customer_id text` (nullable, unique index)
  - `stripe_subscription_id text` (nullable, unique index)
  - `subscription_status text NOT NULL DEFAULT 'inactive'` (CHECK constraint)
  - `plan text NOT NULL DEFAULT 'starter'`
  - `trial_ends_at timestamptz NULL`
  - `billing_grace_until timestamptz NULL`
  - `billing_updated_at timestamptz NULL`
- **Constraints:**
  - Unique index on `stripe_customer_id` (WHERE NOT NULL)
  - Unique index on `stripe_subscription_id` (WHERE NOT NULL)
  - CHECK constraint on `subscription_status`: `'inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'`

#### `supabase/migrations/20260310080001_expire_trials_function.sql`
- **Function:** `public.expire_trials()`
- **Purpose:** Expires trials that have ended
- **Status:** Function exists, **NOT scheduled** (no pg_cron job found)

---

## 2. Webhook Analysis

### 2.1 Exact Stripe Events Handled

**File:** `supabase/functions/stripe-webhook/index.ts`

**Events Processed:**

1. **`checkout.session.completed`** (lines 270-310)
   - Extracts: `session.metadata.company_id`, `session.client_reference_id`, `session.customer`, `session.subscription`
   - If subscription exists: Retrieves subscription and calls `applySubscriptionSnapshot()`
   - If no subscription: Updates only `stripe_customer_id`

2. **`customer.subscription.created`** (lines 312-351)
   - Extracts: `subscription.metadata.company_id`, `subscription.customer`
   - Calls `applySubscriptionSnapshot()` with subscription

3. **`customer.subscription.updated`** (lines 312-351)
   - Extracts: `subscription.metadata.company_id`, `subscription.customer`
   - Calls `applySubscriptionSnapshot()` with subscription
   - **Critical for plan upgrades** - Updates `companies.plan` when user changes plan in Portal

4. **`customer.subscription.deleted`** (lines 312-351)
   - Extracts: `subscription.metadata.company_id`, `subscription.customer`
   - Calls `applySubscriptionSnapshot()` with `forceStatus: "canceled"`

5. **`invoice.payment_succeeded`** (lines 353-397)
   - Extracts: `invoice.customer`, `invoice.subscription`
   - If subscription exists: Retrieves subscription and calls `applySubscriptionSnapshot()`
   - If no subscription: Updates `subscription_status = "active"`

6. **`invoice.payment_failed`** (lines 353-397)
   - Extracts: `invoice.customer`, `invoice.subscription`
   - If subscription exists: Retrieves subscription and calls `applySubscriptionSnapshot()` with `forceStatus: "past_due"`
   - If no subscription: Updates `subscription_status = "past_due"`, `billing_grace_until = now() + 7 days`

**Unhandled Events:**
- Returns `EVENT_IGNORED` response (lines 399-403)
- No logging or storage of unhandled events

---

### 2.2 Company Lookup Logic

**Function:** `findCompany()` (lines 151-202)

**Lookup Priority:**
1. If `companyIdHint` provided: Query `companies` by `id = companyIdHint` (lines 163-177)
2. If `stripeCustomerId` provided: Query `companies` by `stripe_customer_id = stripeCustomerId` (lines 179-193)
3. Returns `null` if neither found (lines 195-201)

**Lookup Sources by Event:**
- `checkout.session.completed`: `session.metadata.company_id` OR `session.client_reference_id` OR `session.customer`
- `customer.subscription.*`: `subscription.metadata.company_id` OR `subscription.customer`
- `invoice.*`: `invoice.customer` only

**Failure Handling:**
- Returns `errorResponse(404, "COMPANY_NOT_FOUND", ...)` if company not found (lines 279-289, 323-333, 361-370)
- Logs error to console (JSON format)
- **No event storage** - Event is lost if company lookup fails

---

### 2.3 Idempotency

**Status:** ❌ **NOT IMPLEMENTED**

**Current Behavior:**
- No check for duplicate event processing
- No storage of `event.id` (Stripe event ID)
- No deduplication logic
- **Risk:** Duplicate webhook deliveries will cause duplicate database updates

**Evidence:**
- `event.id` is logged to console (lines 137, 266, 283, 302, etc.) but never stored
- No database table for webhook events
- No `INSERT ... ON CONFLICT` or similar idempotency mechanism

---

### 2.4 Raw Stripe Event ID Storage

**Status:** ❌ **NOT STORED**

**Current Behavior:**
- `event.id` is logged to console only (JSON logs)
- No database persistence
- Cannot query event history
- Cannot detect duplicate deliveries

**Evidence:**
- Console logs include `event_id: event.id` (multiple locations)
- No database INSERT statements for events
- No `stripe_webhook_events` or similar table exists

---

### 2.5 Webhook Processing Atomicity

**Status:** ⚠️ **PARTIALLY ATOMIC**

**Current Behavior:**
- `updateCompany()` performs single UPDATE statement (lines 215-218)
- If `updateCompany()` fails, exception is thrown and caught (lines 404-414)
- **Non-atomic scenarios:**
  - If `stripe.subscriptions.retrieve()` fails (lines 292, 373), error is caught but company may be partially updated
  - If `applySubscriptionSnapshot()` fails, no rollback mechanism
  - Multiple fields updated in single UPDATE, but no transaction wrapper

**Evidence:**
- `updateCompany()` is a single UPDATE (line 215-218)
- No explicit transaction boundaries
- Errors in subscription retrieval are caught but may leave inconsistent state

---

### 2.6 Duplicate Delivery Handling

**Status:** ❌ **NO PROTECTION**

**Current Behavior:**
- Duplicate webhook deliveries will process identically
- Same event ID can be processed multiple times
- No idempotency check
- **Risk:** Out-of-order events can regress state

**Example Scenario:**
1. Event A arrives: `subscription.updated` → plan = "pro"
2. Event B arrives (older): `subscription.updated` → plan = "starter"
3. If B processed after A, state regresses to "starter"

---

### 2.7 Company Lookup Failure Handling

**Status:** ⚠️ **BASIC ERROR RESPONSE**

**Current Behavior:**
- Returns `404 COMPANY_NOT_FOUND` error response (lines 288, 332, 369)
- Logs error to console
- **Event is lost** - No storage for later retry
- No dead letter queue

**Evidence:**
- Error responses returned immediately (lines 288, 332, 369)
- No INSERT into failed events table
- No retry mechanism

---

### 2.8 Subscription Lookup Failure Handling

**Status:** ⚠️ **EXCEPTION CAUGHT**

**Current Behavior:**
- `stripe.subscriptions.retrieve()` calls wrapped in try/catch (implicit via async/await)
- If retrieval fails, exception propagates to outer catch (lines 404-414)
- Returns `500 INTERNAL_ERROR` response
- **Event is lost** - No storage for later retry

**Evidence:**
- Subscription retrieval at lines 292, 373
- No explicit error handling for Stripe API failures
- Outer catch block handles all exceptions (lines 404-414)

---

### 2.9 State Regression Risk

**Status:** ⚠️ **VULNERABLE TO OUT-OF-ORDER EVENTS**

**Current Behavior:**
- Events processed in arrival order
- No timestamp comparison
- No event ordering validation
- **Risk:** Older events can overwrite newer state

**Example:**
- Event 1 (created_at: 10:00): `subscription.updated` → plan = "pro"
- Event 2 (created_at: 09:00, delayed): `subscription.updated` → plan = "starter"
- If Event 2 arrives after Event 1, state regresses

**Evidence:**
- No `event.created` timestamp comparison
- No version/timestamp fields in `companies` table for optimistic locking
- `applySubscriptionSnapshot()` always updates regardless of current state

---

## 3. Checkout + Portal Flow Analysis

### 3.1 Duplicate Active Subscription Protection

**Status:** ❌ **NOT IMPLEMENTED**

**File:** `supabase/functions/create-billing-checkout-session/index.ts`

**Current Behavior:**
- Does not check if company already has active/trialing subscription (lines 119-127)
- Only checks: company exists, caller is admin, plan selection valid
- **Risk:** Multiple active subscriptions can be created for same company

**Evidence:**
- Company query selects: `id, name, stripe_customer_id, plan` (line 121)
- No check for `subscription_status IN ('active', 'trialing')`
- No validation that `stripe_subscription_id` is NULL or subscription is canceled

---

### 3.2 Checkout Blocking Logic

**Status:** ❌ **NO BLOCKING**

**Current Behavior:**
- Checkout proceeds regardless of existing subscription status
- No validation that company is in `'inactive'` or `'canceled'` state
- **Risk:** User can start new checkout while existing subscription is active

**Evidence:**
- No subscription status check in checkout function
- No error returned if `subscription_status = 'active'`

---

### 3.3 Plan Selection Drift Risk

**Status:** ⚠️ **DEPENDS ON STRIPE METADATA**

**File:** `supabase/functions/stripe-webhook/index.ts`

**Plan Resolution Function:** `resolvePlanFromSubscription()` (lines 54-66)

**Priority Order:**
1. `subscription.metadata.plan` (if present and non-empty)
2. `subscription.items.data[0].price.lookup_key` (if present and non-empty)
3. Fallback: `company.plan || "starter"`

**Drift Scenarios:**
- **Scenario 1:** User upgrades via Portal, but Stripe doesn't set `subscription.metadata.plan`
  - Webhook falls back to `lookup_key`
  - If `lookup_key` not set, falls back to existing `company.plan` (stale)
- **Scenario 2:** User downgrades via Portal, but metadata not updated
  - Same fallback chain, may not reflect actual plan

**Evidence:**
- Checkout sets `subscription_data.metadata.plan` (line 213 in checkout function) ✅
- Portal changes may not preserve metadata (depends on Stripe configuration)
- Fallback to `company.plan` can be stale

---

### 3.4 Subscription Metadata Consistency

**Status:** ✅ **CONSISTENT IN CHECKOUT, ⚠️ DEPENDS ON PORTAL**

**Checkout Function:** `supabase/functions/create-billing-checkout-session/index.ts`

**Metadata Set:**
- `session.metadata.company_id` (line 207)
- `session.metadata.plan` (line 208)
- `subscription_data.metadata.company_id` (line 212)
- `subscription_data.metadata.plan` (line 213)

**Portal Function:** `supabase/functions/create-billing-portal-session/index.ts`
- **No metadata control** - Portal is managed by Stripe
- Portal plan changes may or may not preserve metadata (depends on Stripe dashboard configuration)

**Evidence:**
- Checkout consistently sets metadata ✅
- Portal has no metadata control ⚠️
- Webhook relies on metadata for plan resolution

---

## 4. Database State Analysis

### 4.1 Companies Billing Fields

**Table:** `public.companies`

**Fields (from migration `20260309133000_add_companies_billing_fields.sql`):**
- `stripe_customer_id text NULL` - Unique index (WHERE NOT NULL)
- `stripe_subscription_id text NULL` - Unique index (WHERE NOT NULL)
- `subscription_status text NOT NULL DEFAULT 'inactive'` - CHECK constraint
- `plan text NOT NULL DEFAULT 'starter'`
- `trial_ends_at timestamptz NULL`
- `billing_grace_until timestamptz NULL`
- `billing_updated_at timestamptz NULL`

**Constraints:**
- Unique index: `companies_stripe_customer_id_key` (partial, WHERE NOT NULL)
- Unique index: `companies_stripe_subscription_id_key` (partial, WHERE NOT NULL)
- CHECK constraint: `companies_subscription_status_check` (validates status values)

---

### 4.2 Unique Indexes / Constraints

**Existing:**
- ✅ `stripe_customer_id` - Unique (prevents duplicate customer links)
- ✅ `stripe_subscription_id` - Unique (prevents duplicate subscription links)

**Missing:**
- ❌ No constraint preventing multiple active subscriptions per company
- ❌ No check that `stripe_subscription_id` matches active subscription in Stripe
- ❌ No validation that plan matches subscription item

---

### 4.3 Existing Audit/History Tables

**Found:** `public.audit_log` (migration `20260206000008_audit_log_v1.sql`)

**Schema:**
```sql
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  actor_user_id uuid NULL,
  actor_role text NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Reusability:**
- ✅ Can be used for billing audit history
- ✅ Has `company_id`, `metadata` (JSONB), `created_at`
- ⚠️ Designed for entity-specific actions (quote, job, invoice, payment)
- ⚠️ No `entity_type = 'billing'` or `'subscription'` usage found

**Other Log Tables Found:**
- `public.customer_activity_log` - Customer-specific, not suitable
- `public.collections_actions_log` - Collections-specific, not suitable
- `public.rate_limit_events` - Rate limiting, not suitable

---

### 4.4 pg_cron Status

**Status:** ⚠️ **EXTENSION EXISTS, BUT `expire_trials()` NOT SCHEDULED**

**Evidence:**
- `pg_cron` extension referenced in migrations (e.g., `20260212000009_invoice_overdue_eval_ops.sql`)
- `expire_trials()` function exists (migration `20260310080001_expire_trials_function.sql`)
- **No cron job found** for `expire_trials()`
- Function granted to `service_role` only (line 49 of expire_trials migration)

**Existing Cron Jobs (from migrations):**
- `eval_invoices_overdue_all_companies` - Referenced but schedule not found in migrations
- Quote reminders - Referenced but schedule not found

---

## 5. Gap Analysis

### 5.1 Target Architecture Requirements

**Required Components:**
1. `stripe_event_ledger` table - Store all webhook events
2. `billing_subscription_history` table - Track plan/status changes over time
3. `billing_subscriptions` snapshot table (optional) - Current subscription state
4. Idempotent event claim function - Prevent duplicate processing
5. Duplicate active subscription protection - Prevent multiple active subscriptions
6. Reconciliation tooling - Sync state with Stripe

---

### 5.2 Gap Analysis

#### 5.2.1 Stripe Event Ledger

**Status:** ❌ **MISSING**

**Required:**
- Table to store all webhook events
- Columns: `event_id` (unique), `event_type`, `processed_at`, `payload` (JSONB), `company_id`, `processing_result`

**Current State:**
- No event storage
- Events logged to console only
- Cannot query event history
- Cannot detect duplicates

---

#### 5.2.2 Billing Subscription History

**Status:** ❌ **MISSING**

**Required:**
- Table to track plan/status changes over time
- Columns: `company_id`, `changed_at`, `changed_by`, `field_name`, `old_value`, `new_value`, `source`

**Current State:**
- Only current state in `companies` table
- No history of plan changes
- Cannot answer: "When did this company upgrade to Pro?"
- `audit_log` exists but not used for billing

---

#### 5.2.3 Billing Subscriptions Snapshot Table

**Status:** ❌ **MISSING (OPTIONAL)**

**Required (Optional):**
- Table to snapshot current subscription state
- Columns: `company_id`, `stripe_subscription_id`, `plan`, `status`, `current_period_start`, `current_period_end`, `synced_at`

**Current State:**
- Subscription state stored in `companies` table only
- No separate subscription table
- **Note:** This is optional - current approach (companies table) may be sufficient

---

#### 5.2.4 Idempotent Event Claim Function

**Status:** ❌ **MISSING**

**Required:**
- Function to claim event for processing
- Logic: `INSERT INTO stripe_event_ledger (event_id, ...) ... ON CONFLICT (event_id) DO NOTHING RETURNING id`
- Returns event ID if successfully claimed, NULL if already processed

**Current State:**
- No idempotency mechanism
- Duplicate events processed multiple times

---

#### 5.2.5 Duplicate Active Subscription Protection

**Status:** ❌ **MISSING**

**Required:**
- Check in checkout function: `subscription_status NOT IN ('active', 'trialing')`
- Database constraint: Prevent multiple active subscriptions (if using subscriptions table)
- Validation: Ensure `stripe_subscription_id` matches active subscription in Stripe

**Current State:**
- No validation in checkout
- Unique index on `stripe_subscription_id` prevents duplicate links, but doesn't prevent multiple active subscriptions
- No check that subscription is actually active in Stripe

---

#### 5.2.6 Reconciliation Tooling

**Status:** ❌ **MISSING**

**Required:**
- RPC function to sync company state with Stripe
- Logic: Retrieve subscription from Stripe, compare with database, update if mismatch
- Admin tool to trigger reconciliation

**Current State:**
- No reconciliation function
- No way to detect state drift
- Manual intervention required for mismatches

---

## 6. Recommendations

### A. Safe to Keep

**✅ Keep As-Is:**
1. **Companies table billing fields** - Current schema is sufficient
2. **Unique indexes on `stripe_customer_id` and `stripe_subscription_id`** - Prevents duplicate links
3. **Webhook signature verification** - Already implemented correctly
4. **Plan resolution logic** - `resolvePlanFromSubscription()` is sound (needs metadata consistency)
5. **Status mapping** - `mapStripeStatusToAppStatus()` covers all cases
6. **Checkout metadata setting** - Consistently sets `company_id` and `plan` in metadata
7. **Frontend billing UI** - `BillingAdmin.jsx` is functional
8. **UserContext billing hydration** - Correctly loads billing state

**⚠️ Keep But Enhance:**
1. **`audit_log` table** - Can be reused for billing history, but needs `entity_type = 'billing'` support
2. **`expire_trials()` function** - Keep function, but schedule via pg_cron
3. **Webhook event processing logic** - Keep structure, but add idempotency wrapper

---

### B. Must Change

**🔴 Critical Changes Required:**

1. **Add idempotent webhook processing**
   - Create `stripe_event_ledger` table
   - Add event claim function
   - Wrap webhook handler with idempotency check

2. **Add duplicate subscription protection**
   - Check `subscription_status` in checkout function
   - Return error if company has active/trialing subscription
   - Add validation that subscription is actually active in Stripe

3. **Add billing audit history**
   - Create `billing_subscription_history` table OR
   - Extend `audit_log` to support `entity_type = 'billing'`
   - Log all plan/status changes with source (webhook, checkout, portal, admin)

4. **Schedule trial expiration**
   - Create pg_cron job for `expire_trials()`
   - Run daily at midnight UTC

5. **Add event ordering protection**
   - Compare `event.created` timestamp before processing
   - Skip events older than current state timestamp
   - Add `billing_updated_at` comparison in `applySubscriptionSnapshot()`

6. **Add failed event storage**
   - Store events that fail company lookup
   - Store events that fail subscription retrieval
   - Enable retry mechanism

---

### C. Recommended New Tables / Functions / Constraints

#### C.1 New Tables

**1. `stripe_event_ledger`**
```sql
CREATE TABLE public.stripe_event_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,  -- Stripe event ID
  event_type text NOT NULL,
  company_id uuid NULL REFERENCES public.companies(id),
  payload jsonb NOT NULL,
  processed_at timestamptz NULL,
  processing_result text NULL,  -- 'success', 'error', 'ignored'
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**2. `billing_subscription_history`**
```sql
CREATE TABLE public.billing_subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NULL REFERENCES public.profiles(id),  -- NULL for webhook changes
  source text NOT NULL,  -- 'webhook', 'checkout', 'portal', 'admin', 'reconciliation'
  field_name text NOT NULL,  -- 'plan', 'subscription_status', 'stripe_subscription_id'
  old_value text NULL,
  new_value text NULL,
  stripe_event_id text NULL REFERENCES public.stripe_event_ledger(event_id),
  metadata jsonb NOT NULL DEFAULT '{}'
);
```

**3. `billing_subscriptions` (Optional)**
```sql
CREATE TABLE public.billing_subscriptions (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id),
  stripe_subscription_id text NOT NULL UNIQUE,
  plan text NOT NULL,
  status text NOT NULL,
  current_period_start timestamptz NULL,
  current_period_end timestamptz NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
```

#### C.2 New Functions

**1. `claim_stripe_event(event_id text)`**
```sql
CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id uuid;
BEGIN
  INSERT INTO public.stripe_event_ledger (event_id, processed_at, processing_result)
  VALUES (p_event_id, now(), 'processing')
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_ledger_id;
  
  RETURN v_ledger_id;  -- NULL if already processed
END;
$$;
```

**2. `record_billing_change(...)`**
```sql
CREATE OR REPLACE FUNCTION public.record_billing_change(
  p_company_id uuid,
  p_source text,
  p_field_name text,
  p_old_value text,
  p_new_value text,
  p_stripe_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- Inserts into billing_subscription_history
$$;
```

**3. `reconcile_company_subscription(p_company_id uuid)`**
```sql
CREATE OR REPLACE FUNCTION public.reconcile_company_subscription(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- Retrieves subscription from Stripe, compares with database, updates if mismatch
$$;
```

#### C.3 New Constraints

**1. Prevent Multiple Active Subscriptions (if using subscriptions table)**
```sql
-- If using billing_subscriptions table:
CREATE UNIQUE INDEX billing_subscriptions_one_active_per_company
ON public.billing_subscriptions (company_id)
WHERE status IN ('active', 'trialing');
```

**2. Validate Subscription Status Consistency**
```sql
-- Add CHECK constraint or trigger to ensure:
-- If subscription_status IN ('active', 'trialing'), then stripe_subscription_id IS NOT NULL
```

---

### D. Proposed Implementation Order

**Phase 1: Critical Foundation (Week 1)**
1. Create `stripe_event_ledger` table
2. Create `claim_stripe_event()` function
3. Wrap webhook handler with idempotency check
4. Add event storage for all processed events

**Phase 2: Audit History (Week 1-2)**
5. Create `billing_subscription_history` table
6. Create `record_billing_change()` function
7. Update webhook handler to log all changes
8. Update checkout function to log changes

**Phase 3: Duplicate Protection (Week 2)**
9. Add subscription status check in checkout function
10. Add validation that subscription is active in Stripe
11. Add error handling for duplicate subscription attempts

**Phase 4: Event Ordering (Week 2-3)**
12. Add `event.created` timestamp comparison in webhook
13. Add `billing_updated_at` comparison in `applySubscriptionSnapshot()`
14. Skip out-of-order events

**Phase 5: Reconciliation & Scheduling (Week 3)**
15. Create `reconcile_company_subscription()` function
16. Schedule `expire_trials()` via pg_cron
17. Add admin tool to trigger reconciliation

**Phase 6: Optional Enhancements (Week 4)**
18. Create `billing_subscriptions` snapshot table (if needed)
19. Add monitoring/alerting for webhook failures
20. Add retry mechanism for failed events

---

## Summary

**Current State:**
- ✅ Basic billing flow works (checkout, portal, webhook sync)
- ✅ Database schema is sound
- ❌ No idempotency
- ❌ No audit history
- ❌ No duplicate protection
- ❌ No event ordering
- ❌ No reconciliation

**Production Readiness:**
- **Not production-ready** without Phase 1-3 changes
- **Recommended:** Implement all phases for full production hardening

**Risk Level:**
- **High:** Duplicate events, state regression, missing audit trail
- **Medium:** Plan drift, subscription mismatches
- **Low:** UI/UX issues

---

**End of Audit Report**
