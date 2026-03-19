# Phase A.3 Implementation Plan V2

**Date**: 2024-03-22  
**Scope**: Webhook reliability remediation - refined execution sequence  
**Status**: PLAN REFINEMENT COMPLETE

---

## Executive Summary

This plan refines the Phase A.3 webhook reliability remediation into a schema-aware, implementation-safe execution sequence. The first step is narrowly scoped to add in-request retry logic for transient database failures, using existing schema fields and avoiding migrations.

**Key Decisions**:
- **Step 1**: In-request retry for transient failures only (no schema changes, no replay mechanism)
- **Step 2**: Failed-event replay/recovery (deferred)
- **Step 3**: Stuck-processing recovery (deferred)
- **Step 4**: Observability improvements (deferred)

---

## A. Current Constraints

### A.1 Stripe Event Ledger Schema

**Table**: `stripe_event_ledger`

**Relevant Columns**:
- `id` (uuid, PRIMARY KEY)
- `event_id` (text, UNIQUE) - Stripe event ID (`evt_xxx`)
- `event_type` (text, NOT NULL)
- `company_id` (uuid, nullable)
- `payload` (jsonb, NOT NULL)
- `processing_state` (text, NOT NULL, DEFAULT 'pending')
  - Valid values: `'pending' | 'processing' | 'success' | 'error' | 'ignored'`
- `processing_attempts` (integer, NOT NULL, DEFAULT 0) ✅ **EXISTS**
- `processing_error` (text, nullable)
- `processed_at` (timestamptz, nullable)
- `created_at` (timestamptz, NOT NULL, DEFAULT now())

**Indexes**:
- `stripe_event_ledger_company_idx` on `company_id`
- `stripe_event_ledger_created_idx` on `created_at DESC`
- `stripe_event_ledger_processing_state_idx` on `processing_state` (partial: `WHERE processing_state IN ('pending', 'error')`)

**RLS**: Enabled, service_role only

### A.2 Claim Stripe Event Function

**Function**: `claim_stripe_event(p_event_id text)`

**Current Behavior**:
1. Attempts `INSERT INTO stripe_event_ledger (event_id, processing_state) VALUES (p_event_id, 'processing')`
2. Uses `ON CONFLICT (event_id) DO NOTHING` for idempotency
3. Returns `uuid` (ledger row id) if insert succeeded (new event)
4. Returns `NULL` if event already exists (already processed)

**Important**: 
- Does NOT set `processing_attempts` (remains at default 0)
- Does NOT set `payload` or `event_type` (set later by webhook)
- Sets `processing_state` to `'processing'` immediately

**Interaction with Retries**:
- If event is already claimed (exists in ledger), function returns `NULL`
- Webhook returns 200 with `EVENT_ALREADY_PROCESSED` (safe for Stripe retries)
- **Gap**: No mechanism to reset `processing_state` from `'error'` back to `'processing'` for retry

### A.3 Current Webhook Function Structure

**File**: `supabase/functions/stripe-webhook/index.ts`

**Current Flow**:
1. Signature verification (raw body preserved)
2. `claim_stripe_event(event.id)` → get `ledgerId`
3. If `ledgerId` is null → return 200 (already processed)
4. Update ledger: `event_type`, `payload`, `processing_attempts: 1`
5. Process event (find company, update company, record history)
6. Update ledger: `processing_state: 'success'` or `'error'`

**Error Handling**:
- `updateCompany()` throws on database error
- Outer try-catch catches all errors
- Updates ledger with `processing_state: 'error'`, `processing_error: message`
- Returns 500 to Stripe (triggers Stripe retry)

**Current Retry Behavior**:
- Stripe automatically retries on non-2xx responses
- Webhook returns 200 for already-processed events (safe)
- Webhook returns 500 for errors (triggers Stripe retry)
- **Gap**: No distinction between transient (retryable) and permanent (non-retryable) errors
- **Gap**: No in-request retry logic (each Stripe retry is a new webhook invocation)

**Safe for In-Request Retries**:
- ✅ Event is already claimed (idempotent)
- ✅ `processing_attempts` field exists and can be incremented
- ✅ `updateCompany()` can be wrapped in retry logic
- ✅ Ledger updates are non-blocking (can update attempts counter)

---

## B. Problem Separation

### B.1 Transient In-Request Retry

**Definition**: Retry logic within a single webhook invocation for transient database failures.

**Why Distinct**:
- Happens during live webhook processing (same request)
- Uses existing `processing_attempts` counter
- No schema changes required
- No external state management needed

**Minimal Remediation**:
- Wrap `updateCompany()` call in retry loop (max 3 attempts)
- Distinguish transient errors (connection pool, deadlocks, timeouts) from permanent errors (validation, not found)
- Increment `processing_attempts` on each retry
- Exponential backoff between retries (100ms, 200ms, 400ms)
- Update ledger with final state after all retries exhausted

**Scope**: `supabase/functions/stripe-webhook/index.ts` only

### B.2 Failed-Event Replay/Recovery

**Definition**: Mechanism to retry events that are already marked `processing_state: 'error'` in the ledger.

**Why Distinct**:
- Requires resetting ledger state from `'error'` to `'processing'`
- May require new RPC function or admin UI
- Events are already in ledger (not new webhook invocations)
- May need to handle events that failed due to permanent errors (should not retry)

**Minimal Remediation**:
- RPC function: `retry_stripe_event(p_ledger_id uuid)` or `retry_stripe_event_by_event_id(p_event_id text)`
- Resets `processing_state` from `'error'` to `'processing'`
- Resets `processing_error` to NULL
- Increments `processing_attempts`
- Re-processes event payload from ledger
- Or: Admin UI button to trigger retry

**Scope**: New RPC function or admin UI component

### B.3 Stuck-Processing Recovery

**Definition**: Mechanism to recover events stuck in `processing_state: 'processing'` (webhook crashed mid-processing).

**Why Distinct**:
- Events are in `'processing'` state (not `'error'`)
- No error message to guide retry decision
- Requires timeout detection (e.g., events in `'processing'` for > 5 minutes)
- May need background job or cron function

**Minimal Remediation**:
- Background job or cron function
- Queries: `SELECT * FROM stripe_event_ledger WHERE processing_state = 'processing' AND created_at < now() - interval '5 minutes'`
- Resets `processing_state` to `'pending'` or `'error'`
- Or: Admin UI to manually reset stuck events

**Scope**: New background job or admin UI component

### B.4 Observability Improvements

**Definition**: Enhanced logging, alerting, and diagnostics for webhook errors.

**Why Distinct**:
- Does not change webhook processing logic
- Focuses on monitoring and alerting
- May require external service integration (Sentry, Datadog)
- May require new admin UI for diagnostics

**Minimal Remediation**:
- Structured error context (event_id, company_id, error_type, attempt_number)
- Integration with logging service (Sentry, Datadog) or alerting
- Alert on `webhook_errors` metric spike (from `get_platform_metrics()`)
- Admin UI to view failed events with retry button

**Scope**: Logging/alerting configuration, optional admin UI

---

## C. Recommended Execution Sequence

### Phase A.3 Step 1: In-Request Retry for Transient Failures
- **Scope**: Add retry logic within webhook function for transient database errors
- **Files**: `supabase/functions/stripe-webhook/index.ts` only
- **Schema Changes**: None (uses existing `processing_attempts` field)
- **Risk**: Low (narrow scope, no external dependencies)

### Phase A.3 Step 2: Failed-Event Replay/Recovery
- **Scope**: Create RPC function or admin UI to retry events marked `'error'`
- **Files**: New RPC function or admin UI component
- **Schema Changes**: None (uses existing fields)
- **Risk**: Low (separate from webhook processing)

### Phase A.3 Step 3: Stuck-Processing Recovery
- **Scope**: Create background job or admin UI to reset stuck events
- **Files**: New background job or admin UI component
- **Schema Changes**: None (uses existing fields)
- **Risk**: Low (separate from webhook processing)

### Phase A.3 Step 4: Observability Improvements
- **Scope**: Enhanced logging, alerting, and diagnostics
- **Files**: Logging configuration, optional admin UI
- **Schema Changes**: None
- **Risk**: Low (non-blocking improvements)

---

## D. Step 1 Scope Recommendation

### D.1 What Step 1 Should Include

**Core Functionality**:
1. **Retry wrapper for `updateCompany()`**: Wrap the `updateCompany()` call in retry logic
2. **Transient error detection**: Distinguish transient errors (connection pool, deadlocks, timeouts) from permanent errors (validation, not found)
3. **Attempt counter**: Increment `processing_attempts` on each retry attempt
4. **Exponential backoff**: Wait between retries (100ms, 200ms, 400ms)
5. **Ledger updates**: Update ledger with `processing_attempts` after each retry, final state after all retries

**Error Classification**:
- **Transient (retryable)**:
  - Supabase connection errors (connection pool exhausted, network timeouts)
  - Database deadlocks (`40P01` PostgreSQL error code)
  - Database lock timeouts (`55P03` PostgreSQL error code)
  - Transient network errors
- **Permanent (non-retryable)**:
  - Validation errors (invalid data, constraint violations)
  - Not found errors (company not found)
  - Authorization errors
  - Business logic errors

**Implementation Pattern**:
```typescript
async function updateCompanyWithRetry(...) {
  const maxAttempts = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await updateCompany(...);
      // Success - update ledger with success state
      return;
    } catch (error) {
      lastError = error;
      if (isTransientError(error) && attempt < maxAttempts) {
        // Update ledger with attempt number
        await updateLedger(ledgerId, { processing_attempts: attempt });
        // Exponential backoff
        await sleep(Math.pow(2, attempt - 1) * 100);
        continue;
      } else {
        // Permanent error or max attempts reached
        throw error;
      }
    }
  }
}
```

### D.2 What Step 1 Should NOT Include

**Explicitly Deferred**:
1. ❌ **Failed-event replay/recovery**: No RPC function or admin UI to retry events already marked `'error'`
2. ❌ **Stuck-processing recovery**: No background job or admin UI to reset stuck events
3. ❌ **Observability improvements**: No structured logging service integration or alerting
4. ❌ **Schema changes**: No migrations (uses existing `processing_attempts` field)
5. ❌ **Retry for other operations**: Only retry `updateCompany()`, not `findCompany()`, `recordBillingHistory()`, etc.
6. ❌ **Manual retry mechanism**: No admin UI or RPC to manually trigger retries

**Rationale**:
- Step 1 is narrowly scoped to handle transient failures during live webhook processing
- Replay/recovery requires separate mechanism (Step 2)
- Stuck-processing requires separate mechanism (Step 3)
- Observability is non-blocking improvement (Step 4)

---

## E. Existing Primitives and Schema Review

### E.1 What Already Exists

#### Schema Fields (✅ Available)
- `processing_attempts` (integer, default 0) - **EXISTS**, can be incremented
- `processing_state` (text) - **EXISTS**, can be updated
- `processing_error` (text, nullable) - **EXISTS**, can store error message
- `processed_at` (timestamptz, nullable) - **EXISTS**, can be set on completion

#### Functions (✅ Available)
- `claim_stripe_event(p_event_id text)` - **EXISTS**, handles idempotency
- `updateLedger(ledgerId, updates)` - **EXISTS**, updates ledger state
- `updateCompany(companyId, patch, ...)` - **EXISTS**, throws on error (can be wrapped)

#### Diagnostics (✅ Available)
- `get_platform_metrics()` - **EXISTS**, includes `webhook_errors` count
- `get_platform_company_billing_events(p_company_id, p_limit)` - **EXISTS**, queries ledger
- `get_platform_company_billing_history(p_company_id, p_limit)` - **EXISTS**, queries history

#### Reconciliation (✅ Available)
- `reconcile-billing` edge function - **EXISTS**, can manually correct state

### E.2 What Is Missing

#### Retry Logic (❌ Missing)
- No in-request retry wrapper for `updateCompany()`
- No transient error detection function
- No exponential backoff implementation

#### Replay/Recovery (❌ Missing - Deferred to Step 2)
- No RPC function to retry failed events
- No admin UI to trigger retries
- No mechanism to reset `processing_state` from `'error'` to `'processing'`

#### Stuck-Processing Recovery (❌ Missing - Deferred to Step 3)
- No background job to detect stuck events
- No timeout mechanism for `'processing'` state
- No admin UI to manually reset stuck events

#### Observability (❌ Missing - Deferred to Step 4)
- No structured logging service integration
- No alerting on webhook error spikes
- No admin UI to view failed events with context

---

## F. Deferred Items

### F.1 Manual Retry UI (Deferred to Step 2)

**Why Deferred**:
- Requires admin UI component or RPC function
- Separate concern from in-request retry
- Can be built after Step 1 validates retry logic

**Impact**: Low - reconciliation function provides manual recovery path

### F.2 Dead-Letter Queue (Deferred to Step 2)

**Why Deferred**:
- Requires separate mechanism (RPC function or admin UI)
- Events already tracked in ledger (`processing_state: 'error'`)
- Can query failed events via existing diagnostics RPCs

**Impact**: Low - existing ledger table serves as dead-letter queue

### F.3 Stuck-Processing Sweeper (Deferred to Step 3)

**Why Deferred**:
- Requires background job or cron function
- Separate concern from in-request retry
- Rare edge case (webhook crashes mid-processing)

**Impact**: Low - rare occurrence, can be handled manually via SQL

### F.4 Observability Upgrades (Deferred to Step 4)

**Why Deferred**:
- Non-blocking improvement
- Requires external service integration or alerting configuration
- Current console.log + ledger table provides basic observability

**Impact**: Low - current logging is sufficient for initial launch

---

## G. Acceptance Criteria for Step 1

### G.1 Retry Logic

- [ ] `updateCompany()` is wrapped in retry logic with max 3 attempts
- [ ] Transient errors (connection pool, deadlocks, timeouts) are detected and retried
- [ ] Permanent errors (validation, not found) are not retried
- [ ] Exponential backoff is implemented (100ms, 200ms, 400ms)
- [ ] `processing_attempts` is incremented on each retry attempt

### G.2 Error Classification

- [ ] Supabase connection errors are classified as transient
- [ ] Database deadlocks (`40P01`) are classified as transient
- [ ] Database lock timeouts (`55P03`) are classified as transient
- [ ] Validation errors are classified as permanent (not retried)
- [ ] Not found errors are classified as permanent (not retried)

### G.3 Ledger Updates

- [ ] `processing_attempts` is updated after each retry attempt
- [ ] Final `processing_state` is set to `'success'` if retry succeeds
- [ ] Final `processing_state` is set to `'error'` if all retries fail
- [ ] `processing_error` contains error message from final attempt
- [ ] `processed_at` is set on completion (success or failure)

### G.4 Behavior Preservation

- [ ] Already-processed events still return 200 (idempotency preserved)
- [ ] Stale events are still detected and ignored
- [ ] Company lookup failures still return 404 (not retried)
- [ ] History logging failures are still non-blocking
- [ ] Product event logging failures are still non-blocking

### G.5 No Regressions

- [ ] No schema changes introduced
- [ ] No new external dependencies
- [ ] No changes to `claim_stripe_event()` function
- [ ] No changes to reconciliation function
- [ ] No changes to diagnostics RPCs

### G.6 Logging

- [ ] Retry attempts are logged with attempt number
- [ ] Transient vs permanent error classification is logged
- [ ] Final success/failure is logged with total attempts
- [ ] Error messages are preserved in logs

---

## Summary

**Overall Status**: ✅ **IMPLEMENTATION-READY**

**Step 1 Scope**:
- ✅ Narrow: In-request retry for transient failures only
- ✅ Safe: Uses existing schema fields, no migrations
- ✅ Focused: Only wraps `updateCompany()`, no other changes
- ✅ Deferred: Replay/recovery, stuck-processing, observability to later steps

**Key Decisions**:
1. **Step 1**: In-request retry only (no replay mechanism)
2. **Step 2**: Failed-event replay/recovery (RPC function or admin UI)
3. **Step 3**: Stuck-processing recovery (background job or admin UI)
4. **Step 4**: Observability improvements (logging/alerting)

**Next Step**: Proceed with Phase A.3 Step 1 implementation

---

## Recommended First Code Prompt

**EXECUTION MODE — PHASE A.3 / STEP 1**

**Task**: Add in-request retry logic for transient database failures in the Stripe webhook handler.

**Scope in this prompt is LIMITED to**:
1. `supabase/functions/stripe-webhook/index.ts` only

**Do NOT**:
- Modify schema or create migrations
- Create new RPC functions
- Create admin UI components
- Modify reconciliation function
- Add external logging service integration
- Change event processing logic beyond retry wrapper

**Goal**: Wrap `updateCompany()` calls in retry logic that automatically retries transient database failures (connection pool, deadlocks, timeouts) up to 3 times with exponential backoff, while preserving existing behavior for permanent errors.

**Required Changes**:
1. Create `isTransientError(error)` helper function to classify errors
2. Create `updateCompanyWithRetry()` wrapper that:
   - Calls `updateCompany()` with retry logic
   - Increments `processing_attempts` on each retry
   - Implements exponential backoff (100ms, 200ms, 400ms)
   - Updates ledger with attempt count after each retry
   - Throws permanent errors immediately (no retry)
3. Replace all `updateCompany()` calls with `updateCompanyWithRetry()`
4. Preserve all existing error handling and logging

**Validation Required**:
- Retry logic only triggers for transient errors
- Permanent errors are not retried
- `processing_attempts` is correctly incremented
- Ledger state is correctly updated
- No regressions in existing behavior
