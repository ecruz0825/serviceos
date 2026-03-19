# Phase A.3 Webhook Reliability Audit

**Date**: 2024-03-22  
**Scope**: Stripe webhook reliability assessment for Service Ops SaaS billing flow  
**Status**: READ-ONLY AUDIT COMPLETE

---

## Executive Summary

This audit evaluates the production-readiness of the Stripe webhook processing flow with respect to signature verification, idempotency, duplicate delivery, retry safety, event ordering, reconciliation, and failure observability.

**Overall Assessment**: The webhook implementation demonstrates **strong foundational reliability** with proper signature verification, idempotency mechanisms, and stale-event protection. However, several **P1 and P2 risks** require remediation before production launch, particularly around retry handling, partial-failure recovery, and observability gaps.

**Top 5 Risks**:
1. **P0**: No automatic retry mechanism for transient failures (Stripe retries, but we don't handle partial-success scenarios)
2. **P1**: Partial-failure risk: history logging failures are non-blocking, but company update failures can leave inconsistent state
3. **P1**: No dead-letter queue or manual retry mechanism for permanently failed events
4. **P2**: Limited observability: console.log only, no structured alerting for webhook error spikes
5. **P2**: Reconciliation function doesn't handle webhook event replay scenarios

---

## A. Current Webhook Flow Map

### A.1 Event Types Handled

#### 1. `checkout.session.completed`
- **Lookup Path**: 
  - Primary: `session.metadata.company_id` or `session.client_reference_id`
  - Fallback: `session.customer` (Stripe customer ID)
- **Fields Updated**:
  - `stripe_customer_id`
  - `stripe_subscription_id` (if present)
  - `subscription_status` (from subscription snapshot)
  - `plan` (from subscription metadata/lookup_key)
  - `trial_ends_at` (from subscription)
  - `billing_grace_until` (if past_due/unpaid)
  - `billing_updated_at` (always)
- **Idempotency Path**: `claim_stripe_event(event.id)` → returns `null` if already processed
- **Logging Path**: 
  - Structured JSON logs via `console.log/error`
  - `stripe_event_ledger` table with `processing_state`, `processing_error`
  - `billing_subscription_history` table (non-blocking)
- **Failure Path**: 
  - Company not found → `processing_state: "error"`, returns 404
  - Stale event → `processing_state: "ignored"`, returns 200
  - Update failure → `processing_state: "error"`, throws exception, returns 500

#### 2. `customer.subscription.created` / `updated` / `deleted`
- **Lookup Path**:
  - Primary: `subscription.metadata.company_id`
  - Fallback: `subscription.customer` (Stripe customer ID)
- **Fields Updated**: Same as `checkout.session.completed`
- **Idempotency Path**: Same as above
- **Logging Path**: Same as above
- **Failure Path**: Same as above
- **Special Handling**: `deleted` events force `subscription_status: "canceled"`

#### 3. `invoice.payment_succeeded` / `invoice.payment_failed`
- **Lookup Path**: `invoice.customer` (Stripe customer ID only, no company_id hint)
- **Fields Updated**: 
  - `subscription_status` (forced to `past_due` on failure, `active` on success)
  - `billing_grace_until` (7 days on failure)
  - `stripe_customer_id` (if missing)
  - `billing_updated_at` (always)
- **Idempotency Path**: Same as above
- **Logging Path**: Same as above
- **Failure Path**: Same as above
- **Special Handling**: If `invoice.subscription` exists, retrieves full subscription snapshot

### A.2 Idempotency Mechanism

**Implementation**: `claim_stripe_event(p_event_id)` RPC function

**Flow**:
1. Webhook handler calls `claim_stripe_event(event.id)` immediately after signature verification
2. Function attempts `INSERT INTO stripe_event_ledger (event_id, processing_state) VALUES (p_event_id, 'processing')`
3. `ON CONFLICT (event_id) DO NOTHING` ensures atomic idempotency
4. Returns `ledger_id` (UUID) if event is new, `NULL` if already exists
5. If `NULL`, webhook returns 200 with `EVENT_ALREADY_PROCESSED` code

**Strengths**:
- Atomic operation via `ON CONFLICT`
- Event ID is Stripe's unique identifier (`evt_xxx`)
- No race conditions possible (database-level uniqueness)

**Weaknesses**:
- No distinction between "already processed successfully" vs "currently processing"
- If webhook crashes mid-processing, event remains in `processing` state indefinitely
- No automatic retry for events stuck in `processing` state

### A.3 Stale Event Protection

**Implementation**: `isStaleEvent(event, company)` function

**Logic**:
- Compares `event.created` (Unix timestamp) to `company.billing_updated_at` (ISO timestamp)
- If `event.created < company.billing_updated_at`, event is marked as stale
- Stale events are marked `processing_state: "ignored"` and return 200

**Strengths**:
- Prevents older events from overwriting newer billing state
- Handles out-of-order delivery gracefully

**Weaknesses**:
- Relies on `billing_updated_at` being updated atomically with other fields
- If `billing_updated_at` update fails but other fields succeed, stale check becomes unreliable
- No handling for events that arrive significantly out of order (e.g., 24+ hours)

### A.4 Company Lookup Robustness

**Implementation**: `findCompany()` helper function

**Flow**:
1. If `companyIdHint` provided, queries `companies` by `id`
2. If not found or no hint, queries by `stripe_customer_id`
3. Returns `null` if neither lookup succeeds

**Strengths**:
- Dual lookup paths provide redundancy
- Handles both checkout flow (company_id in metadata) and subscription events (customer_id only)

**Weaknesses**:
- No fuzzy matching or case-insensitive lookup
- No handling for companies with multiple Stripe customer IDs (edge case)
- If `stripe_customer_id` is NULL in database but present in webhook, lookup fails

---

## B. Reliability Assessment

### B.1 Signature Verification

**Status**: ✅ **CORRECT**

**Implementation**:
```typescript
const rawBodyBuffer = await req.arrayBuffer();
const rawBody = new Uint8Array(rawBodyBuffer);
event = await stripe.webhooks.constructEventAsync(rawBody, signature, stripeWebhookSecret);
```

**Assessment**:
- Uses Stripe's official `constructEventAsync()` method
- Preserves raw body as `Uint8Array` (required for signature verification)
- Verifies signature before any processing
- Returns 400 on signature failure (prevents processing invalid events)

**Risks**: None identified

### B.2 Raw Body Handling

**Status**: ✅ **CORRECT**

**Implementation**:
- Reads body as `arrayBuffer()` before parsing
- Converts to `Uint8Array` for Stripe verification
- Never parses JSON before signature verification

**Assessment**:
- Correctly preserves raw body for signature verification
- No risk of body corruption from JSON parsing

**Risks**: None identified

### B.3 Duplicate-Event Safety

**Status**: ✅ **CORRECT**

**Implementation**:
- `claim_stripe_event()` uses `ON CONFLICT (event_id) DO NOTHING`
- Returns `NULL` for duplicate events
- Webhook returns 200 with `EVENT_ALREADY_PROCESSED` code

**Assessment**:
- Database-level uniqueness constraint prevents duplicates
- Idempotent processing guaranteed
- Stripe's retry mechanism is safe (duplicate events are ignored)

**Risks**: None identified

### B.4 Retry Safety

**Status**: ⚠️ **PARTIAL**

**Current Behavior**:
- Stripe automatically retries failed webhooks (returns non-2xx)
- Webhook returns 200 for already-processed events (safe for retries)
- Webhook returns 500 for internal errors (triggers Stripe retry)

**Gaps**:
1. **No automatic retry for transient failures**: If database update fails due to transient lock/timeout, event is marked `error` and Stripe retries, but we don't distinguish transient vs permanent failures
2. **No manual retry mechanism**: Events stuck in `error` state require manual intervention (no admin UI or RPC to retry)
3. **No exponential backoff**: Stripe retries, but we don't implement our own backoff logic
4. **Processing state stuck**: If webhook crashes mid-processing, event remains in `processing` state with no automatic recovery

**Risks**:
- **P0**: Transient database failures (connection pool exhaustion, deadlocks) cause permanent `error` state
- **P1**: No way to manually retry failed events without direct database access
- **P2**: Events stuck in `processing` state require manual cleanup

### B.5 Ordering Sensitivity

**Status**: ✅ **CORRECT** (with caveats)

**Implementation**:
- Stale event check prevents older events from overwriting newer state
- `billing_updated_at` timestamp tracks last update

**Assessment**:
- Handles out-of-order delivery correctly
- Prevents race conditions from concurrent webhook processing

**Gaps**:
- If two events arrive simultaneously (same `created` timestamp), both may process (no strict ordering)
- No handling for events that arrive days/weeks late (e.g., webhook endpoint was down)

**Risks**:
- **P2**: Simultaneous events with same timestamp may process out of order (rare edge case)
- **P2**: Very stale events (days old) may be incorrectly ignored if `billing_updated_at` was updated manually

### B.6 Partial-Failure Risk

**Status**: ⚠️ **MODERATE RISK**

**Current Behavior**:
- Company update is atomic (single `UPDATE` statement)
- History logging is non-blocking (failures are logged but don't throw)
- Ledger update is non-blocking (failures are logged but don't throw)

**Gaps**:
1. **History logging failure**: If `billing_subscription_history` insert fails, company update still succeeds (audit trail lost, but state is correct)
2. **Ledger update failure**: If `stripe_event_ledger` update fails after company update, event is marked `error` but company state may be correct
3. **Product event logging failure**: If `product_events` insert fails, no impact on billing state (acceptable)

**Risks**:
- **P1**: If history logging fails, audit trail is incomplete (state is correct, but diagnostics are harder)
- **P1**: If ledger update fails after company update, event appears failed but state is actually correct (confusing for diagnostics)
- **P2**: No transaction wrapping company update + history logging (acceptable trade-off for performance)

### B.7 Company Lookup Robustness

**Status**: ✅ **GOOD** (with minor gaps)

**Implementation**:
- Dual lookup paths (company_id hint, stripe_customer_id)
- Handles both checkout and subscription events

**Gaps**:
- No handling for companies with multiple Stripe customer IDs (edge case)
- No case-insensitive matching (if customer_id is stored with different casing)
- No fuzzy matching for typos in metadata

**Risks**:
- **P2**: Edge case where company has multiple Stripe customers (shouldn't happen in normal flow)
- **P2**: Case sensitivity issues if customer_id is stored inconsistently

### B.8 Consistency with Reconciliation Flow

**Status**: ✅ **GOOD**

**Reconciliation Function**: `reconcile-billing` edge function

**Behavior**:
- Queries Stripe API directly for current subscription state
- Compares to database state and updates discrepancies
- Records changes in `billing_subscription_history` with `source: "reconciliation"`
- Updates `billing_updated_at` timestamp

**Alignment**:
- Uses same status mapping (`STRIPE_STATUS_TO_APP`)
- Uses same plan resolution logic (`resolvePlanFromSubscription`)
- Updates same fields as webhook
- Records history with different source (allows distinguishing webhook vs manual reconciliation)

**Gaps**:
- Reconciliation doesn't check `stripe_event_ledger` for recent webhook events (may overwrite webhook updates if run immediately after)
- No mechanism to replay failed webhook events through reconciliation

**Risks**:
- **P2**: Reconciliation may overwrite webhook updates if run concurrently (rare, but possible)
- **P2**: No way to "replay" a failed webhook event through reconciliation (would require manual Stripe API query)

---

## C. Risk Inventory

### P0 - Must Fix Before Launch

#### C.1 No Automatic Retry for Transient Failures
- **Severity**: P0
- **Impact**: Transient database failures (connection pool exhaustion, deadlocks) cause events to be permanently marked `error`
- **Location**: `supabase/functions/stripe-webhook/index.ts` (error handling)
- **Fix**: Implement retry logic with exponential backoff for transient failures (database connection errors, deadlocks)
- **Workaround**: Manual reconciliation via `reconcile-billing` function

#### C.2 No Dead-Letter Queue or Manual Retry Mechanism
- **Severity**: P0
- **Impact**: Events stuck in `error` state require manual database intervention
- **Location**: `supabase/functions/stripe-webhook/index.ts`, admin UI
- **Fix**: Create admin UI or RPC to retry failed events, or implement automatic retry with max attempts
- **Workaround**: Manual SQL update to reset `processing_state` and trigger retry

### P1 - Should Fix

#### C.3 Partial-Failure Risk: History Logging Non-Blocking
- **Severity**: P1
- **Impact**: If `billing_subscription_history` insert fails, audit trail is lost (state is correct, but diagnostics are harder)
- **Location**: `supabase/functions/stripe-webhook/index.ts` (line 302-315)
- **Fix**: Wrap company update + history logging in transaction, or implement retry for history logging
- **Workaround**: Manual reconciliation can restore history (but loses original event context)

#### C.4 Partial-Failure Risk: Ledger Update After Company Update
- **Severity**: P1
- **Impact**: If ledger update fails after company update, event appears failed but state is actually correct
- **Location**: `supabase/functions/stripe-webhook/index.ts` (ledger update calls)
- **Fix**: Update ledger state before company update, or wrap in transaction
- **Workaround**: Manual verification of company state vs ledger state

#### C.5 No Observability for Webhook Error Spikes
- **Severity**: P1
- **Impact**: No alerting or structured logging for webhook error spikes (rely on console.log only)
- **Location**: `supabase/functions/stripe-webhook/index.ts` (logging)
- **Fix**: Integrate with structured logging service (e.g., Sentry, Datadog) or implement alerting on `webhook_errors` metric
- **Workaround**: Manual monitoring of `stripe_event_ledger` table for `processing_state = 'error'`

### P2 - Can Defer

#### C.6 Events Stuck in `processing` State
- **Severity**: P2
- **Impact**: If webhook crashes mid-processing, event remains in `processing` state indefinitely
- **Location**: `supabase/functions/stripe-webhook/index.ts`, `claim_stripe_event()` RPC
- **Fix**: Implement timeout mechanism or background job to reset stuck events
- **Workaround**: Manual SQL update to reset `processing_state`

#### C.7 No Handling for Very Stale Events
- **Severity**: P2
- **Impact**: Events that arrive days/weeks late may be incorrectly ignored
- **Location**: `supabase/functions/stripe-webhook/index.ts` (`isStaleEvent()` function)
- **Fix**: Add configurable staleness threshold (e.g., ignore events older than 7 days)
- **Workaround**: Manual reconciliation can correct state

#### C.8 Reconciliation Doesn't Check Recent Webhook Events
- **Severity**: P2
- **Impact**: Reconciliation may overwrite webhook updates if run concurrently
- **Location**: `supabase/functions/reconcile-billing/index.ts`
- **Fix**: Check `stripe_event_ledger` for recent events before reconciling, or add timestamp check
- **Workaround**: Avoid running reconciliation immediately after webhook events

#### C.9 No Case-Insensitive Company Lookup
- **Severity**: P2
- **Impact**: Edge case where `stripe_customer_id` is stored with different casing
- **Location**: `supabase/functions/stripe-webhook/index.ts` (`findCompany()` function)
- **Fix**: Use case-insensitive comparison or normalize customer IDs
- **Workaround**: Manual data cleanup

---

## D. Reconciliation Relationship

### D.1 How Reconciliation Complements Webhook Flow

**Reconciliation Function**: `reconcile-billing` edge function

**Purpose**:
- Manual recovery mechanism for webhook failures
- Corrects discrepancies between Stripe API and database state
- Provides audit trail via `billing_subscription_history` with `source: "reconciliation"`

**Strengths**:
- Queries Stripe API directly (source of truth)
- Uses same status mapping and plan resolution as webhook
- Updates same fields as webhook
- Records history with different source (allows distinguishing webhook vs manual)

**Limitations**:
- Requires manual trigger (admin action)
- Doesn't check `stripe_event_ledger` for recent webhook events
- No automatic retry for failed webhook events
- No mechanism to "replay" a specific webhook event

### D.2 Operational Recovery Assessment

**Is Reconciliation Strong Enough for Operational Recovery?**

**Answer**: ⚠️ **PARTIAL**

**Strengths**:
- Can correct any billing state discrepancy
- Provides full audit trail
- Uses same logic as webhook (consistent behavior)

**Gaps**:
- No automatic retry for failed webhook events (requires manual reconciliation)
- No way to "replay" a specific webhook event (would require manual Stripe API query)
- No alerting when reconciliation is needed (requires manual detection)

**Recommendation**:
- Reconciliation is sufficient for **manual recovery** but not for **automatic recovery**
- Should implement automatic retry mechanism for transient failures (P0)
- Should implement dead-letter queue or manual retry UI (P0)
- Should add alerting for webhook error spikes (P1)

---

## E. Recommended Implementation Plan

### E.1 Execution Sequence

**Phase A.3 Step 1: Automatic Retry for Transient Failures**
- **Scope**: Add retry logic with exponential backoff for transient database failures
- **Files**: `supabase/functions/stripe-webhook/index.ts`
- **Changes**:
  - Wrap company update in try-catch with retry logic
  - Distinguish transient failures (connection errors, deadlocks) from permanent failures (validation errors)
  - Implement exponential backoff (max 3 retries)
  - Update `processing_attempts` counter on each retry
- **Acceptance**: Events with transient failures are automatically retried and succeed

**Phase A.3 Step 2: Dead-Letter Queue and Manual Retry**
- **Scope**: Create admin UI or RPC to retry failed events
- **Files**: 
  - New: Admin UI component or RPC function
  - Modify: `supabase/functions/stripe-webhook/index.ts` (add retry endpoint or make idempotent)
- **Changes**:
  - Create RPC function `retry_stripe_event(p_ledger_id uuid)` or admin UI
  - Reset `processing_state` to `pending` and trigger webhook replay
  - Or: Create separate retry endpoint that processes events from ledger
- **Acceptance**: Failed events can be manually retried via admin UI or RPC

**Phase A.3 Step 3: Enhanced Observability**
- **Scope**: Add structured logging and alerting for webhook errors
- **Files**: 
  - `supabase/functions/stripe-webhook/index.ts` (logging)
  - New: Alerting configuration or integration
- **Changes**:
  - Integrate with structured logging service (Sentry, Datadog) or implement alerting
  - Add alerting on `webhook_errors` metric (from `get_platform_metrics()`)
  - Add structured error context (event_id, company_id, error_type)
- **Acceptance**: Webhook error spikes trigger alerts

**Phase A.3 Step 4: Transaction Wrapping for Atomicity**
- **Scope**: Wrap company update + history logging in transaction (optional, performance trade-off)
- **Files**: `supabase/functions/stripe-webhook/index.ts`
- **Changes**:
  - Use Supabase transaction API to wrap company update + history logging
  - Or: Implement retry for history logging failures
- **Acceptance**: History logging failures don't cause audit trail gaps

**Phase A.3 Step 5: Stuck Event Recovery**
- **Scope**: Implement timeout mechanism or background job to reset stuck events
- **Files**: 
  - `supabase/functions/stripe-webhook/index.ts`
  - New: Background job or cron function
- **Changes**:
  - Add timeout check: if event in `processing` state for > 5 minutes, reset to `pending`
  - Or: Create background job to reset stuck events
- **Acceptance**: Events stuck in `processing` state are automatically recovered

### E.2 Deferred Items

- **Very stale event handling**: Can defer (rare edge case)
- **Case-insensitive company lookup**: Can defer (edge case)
- **Reconciliation webhook event check**: Can defer (rare race condition)
- **Strict event ordering**: Can defer (simultaneous events with same timestamp are rare)

---

## F. Acceptance Checklist

### F.1 Signature Verification
- [x] Signature verified before processing
- [x] Raw body preserved for verification
- [x] Invalid signatures return 400 (no processing)

### F.2 Idempotency
- [x] Duplicate events are detected and ignored
- [x] Database-level uniqueness prevents duplicates
- [x] Already-processed events return 200 (safe for Stripe retries)

### F.3 Retry Safety
- [ ] Transient failures are automatically retried (P0 - **MISSING**)
- [ ] Permanent failures are marked `error` (not retried indefinitely)
- [ ] Manual retry mechanism exists for failed events (P0 - **MISSING**)

### F.4 Event Ordering
- [x] Stale events are detected and ignored
- [x] Out-of-order delivery is handled gracefully
- [ ] Very stale events (days old) are handled (P2 - **DEFERRED**)

### F.5 Partial-Failure Recovery
- [ ] Company update + history logging are atomic (P1 - **PARTIAL**)
- [ ] Ledger update failures don't cause false error states (P1 - **PARTIAL**)
- [x] Product event logging failures are non-blocking (acceptable)

### F.6 Company Lookup
- [x] Dual lookup paths (company_id hint, stripe_customer_id)
- [x] Handles both checkout and subscription events
- [ ] Case-insensitive lookup (P2 - **DEFERRED**)

### F.7 Reconciliation
- [x] Reconciliation function exists and works correctly
- [x] Uses same logic as webhook (consistent behavior)
- [ ] Checks recent webhook events before reconciling (P2 - **DEFERRED**)

### F.8 Observability
- [x] Structured JSON logging via console.log/error
- [x] Event state tracked in `stripe_event_ledger`
- [x] History tracked in `billing_subscription_history`
- [ ] Alerting for webhook error spikes (P1 - **MISSING**)
- [ ] Structured error context (event_id, company_id, error_type) (P1 - **PARTIAL**)

### F.9 Diagnostics
- [x] Platform admin can query billing history
- [x] Platform admin can query webhook events
- [x] `webhook_errors` metric available in platform metrics
- [ ] Admin UI to retry failed events (P0 - **MISSING**)

---

## Summary

**Overall Status**: ⚠️ **GOOD FOUNDATION, REQUIRES P0/P1 FIXES**

**Strengths**:
- ✅ Signature verification is correct
- ✅ Idempotency is properly implemented
- ✅ Stale event protection prevents overwrites
- ✅ Reconciliation function provides manual recovery

**Critical Gaps**:
- ❌ No automatic retry for transient failures (P0)
- ❌ No dead-letter queue or manual retry mechanism (P0)
- ⚠️ Partial-failure risks in history logging (P1)
- ⚠️ Limited observability and alerting (P1)

**Recommendation**: 
- **KEEP** current implementation as foundation
- **FIX** P0 items (automatic retry, manual retry mechanism) before launch
- **FIX** P1 items (partial-failure recovery, observability) in first sprint post-launch
- **DEFER** P2 items (stale event handling, case-insensitive lookup) to future sprints

**Next Step**: Proceed with Phase A.3 Step 1 (Automatic Retry for Transient Failures)
