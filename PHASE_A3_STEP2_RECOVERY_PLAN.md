# Phase A.3 Step 2 Recovery Plan

**Date**: 2024-03-22  
**Scope**: Failed-event recovery mechanism for Stripe webhook events  
**Status**: DESIGN COMPLETE - READY FOR IMPLEMENTATION

---

## Executive Summary

After inspecting the current webhook architecture, the safest minimal recovery mechanism is:

1. **RPC Function**: `reset_failed_stripe_event(p_event_id text)` - Resets error-state events to 'pending' for retry
2. **Replay Edge Function**: `replay-stripe-event` - Processes events from ledger payload, bypassing signature verification

This approach is safe because:
- Only operates on events in 'error' state
- Preserves idempotency (event already in ledger)
- Uses existing processing logic
- Provides explicit audit trail

---

## Current Architecture Analysis

### A. Event Processing Flow

1. **Signature Verification**: Requires raw request body (not stored in ledger)
2. **Event Claiming**: `claim_stripe_event()` inserts event with 'processing' state, returns NULL if already exists
3. **Event Processing**: Processes event based on type (checkout, subscription, invoice)
4. **State Updates**: Updates ledger to 'success' or 'error'

### B. Failed Event State

- Events in `processing_state = 'error'` are stored in ledger
- Full event payload is stored in `payload` jsonb column
- `processing_error` contains error message
- `processing_attempts` shows how many attempts were made

### C. Recovery Challenges

1. **Signature Verification**: Can't verify signature on replayed events (no raw body)
2. **Event Claiming**: `claim_stripe_event()` returns NULL for existing events
3. **Processing Logic**: Embedded in webhook handler, not easily reusable

### D. Safe Recovery Options

**Option A: Reset + Stripe Retry** (Not viable)
- Reset event to 'pending'
- Rely on Stripe dashboard manual retry
- **Problem**: `claim_stripe_event()` will return NULL, webhook will return 200 (already processed)

**Option B: Reset + Replay from Ledger** (Recommended)
- Reset event to 'pending' or 'processing'
- Create replay mechanism that processes from ledger payload
- Bypasses signature verification (trusted source: our own ledger)
- Bypasses `claim_stripe_event()` (event already exists)
- Uses existing processing logic

**Option C: Reconcile-Billing Delegation** (Not appropriate)
- Use existing `reconcile-billing` function
- **Problem**: Doesn't process webhook events, queries Stripe API directly
- **Problem**: Doesn't use event payload, may miss event-specific context

---

## Recommended Implementation

### Step 1: RPC Function - Reset Failed Event

**Function**: `reset_failed_stripe_event(p_event_id text)`

**Behavior**:
1. Verify event exists and is in 'error' state
2. Reset `processing_state` to 'pending'
3. Increment `processing_attempts`
4. Clear `processing_error`
5. Set `processed_at` to NULL
6. Return success/failure

**Safety**:
- Only operates on 'error' state events
- Atomic operation (single UPDATE)
- Returns error if event not found or not in error state
- Preserves audit trail (attempts incremented)

**SQL Migration**:
```sql
CREATE OR REPLACE FUNCTION public.reset_failed_stripe_event(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_ledger_id uuid;
  v_current_state text;
  v_attempts integer;
BEGIN
  -- Get current state
  SELECT id, processing_state, processing_attempts
  INTO v_ledger_id, v_current_state, v_attempts
  FROM public.stripe_event_ledger
  WHERE event_id = p_event_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EVENT_NOT_FOUND',
      'message', 'Event not found in ledger'
    );
  END IF;

  IF v_current_state != 'error' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', format('Event is in %s state, not error', v_current_state),
      'current_state', v_current_state
    );
  END IF;

  -- Reset to pending state
  UPDATE public.stripe_event_ledger
  SET
    processing_state = 'pending',
    processing_attempts = v_attempts + 1,
    processing_error = NULL,
    processed_at = NULL
  WHERE id = v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'EVENT_RESET',
    'message', 'Event reset to pending state',
    'ledger_id', v_ledger_id,
    'new_attempts', v_attempts + 1
  );
END;
$$;
```

### Step 2: Replay Edge Function

**Function**: `replay-stripe-event` edge function

**Behavior**:
1. Accept `event_id` or `ledger_id` as parameter
2. Load event from ledger (verify it's in 'pending' or 'error' state)
3. Extract event payload from ledger
4. Process event using existing webhook logic (but skip signature verification and claim_stripe_event)
5. Update ledger with final state

**Safety**:
- Only processes events from ledger (trusted source)
- Skips signature verification (we trust our own ledger)
- Skips `claim_stripe_event()` (event already exists)
- Uses existing processing logic (same code path as webhook)
- Preserves idempotency (event already in ledger)

**Implementation Approach**:
- Extract processing logic from webhook handler into shared functions
- Or: Create minimal replay function that calls processing logic directly
- Or: Refactor webhook handler to support both webhook and replay modes

**Simplest Approach** (for Step 2):
- Create new edge function that:
  - Loads event from ledger
  - Calls existing processing functions (findCompany, updateCompany, etc.)
  - Updates ledger state
- Reuses existing helper functions from webhook handler

---

## Implementation Decision

**Recommended**: Implement both RPC and replay edge function

**Rationale**:
1. RPC provides explicit operator control (reset event state)
2. Replay function provides automated recovery (process from ledger)
3. Both are minimal and safe
4. RPC can be used independently (for audit/debugging)
5. Replay function can be called after RPC reset

**Alternative (Minimal)**: RPC only
- Operators reset events to 'pending'
- Use Stripe dashboard to manually retry
- **Problem**: Won't work because `claim_stripe_event()` returns NULL
- **Workaround**: Modify `claim_stripe_event()` to allow resetting 'error' to 'processing'
- **Risk**: Changes core idempotency mechanism

**Recommended Approach**: RPC + Replay Function
- RPC resets event state
- Replay function processes from ledger
- No changes to core webhook flow
- Safe and explicit

---

## Implementation Plan

### Phase A.3 Step 2A: RPC Function

**File**: `supabase/migrations/YYYYMMDDHHMMSS_reset_failed_stripe_event.sql`

**Changes**:
- Create `reset_failed_stripe_event(p_event_id text)` function
- Grant execute to service_role
- Add validation (only 'error' state)
- Increment attempts counter
- Clear error message

**Acceptance**:
- [ ] Function exists and is callable
- [ ] Only resets 'error' state events
- [ ] Increments processing_attempts
- [ ] Returns clear success/failure response
- [ ] Rejects non-error state events

### Phase A.3 Step 2B: Replay Edge Function

**File**: `supabase/functions/replay-stripe-event/index.ts`

**Changes**:
- Create new edge function
- Load event from ledger by event_id or ledger_id
- Extract payload from ledger
- Process event using existing logic (skip signature/claim)
- Update ledger with final state

**Key Design Decisions**:
1. **Signature Verification**: Skip (trusted source: our ledger)
2. **Event Claiming**: Skip (event already exists)
3. **Processing Logic**: Reuse existing functions (findCompany, updateCompany, etc.)
4. **State Management**: Update ledger directly (no claim_stripe_event)

**Acceptance**:
- [ ] Function exists and is callable
- [ ] Only processes events from ledger
- [ ] Skips signature verification
- [ ] Skips claim_stripe_event
- [ ] Uses existing processing logic
- [ ] Updates ledger with final state
- [ ] Handles all event types (checkout, subscription, invoice)

---

## Safety Considerations

### A. Idempotency

- Event already exists in ledger (idempotent by design)
- Replay function processes same event multiple times safely
- Company updates are idempotent (same values, same result)

### B. Duplicate Processing

- Event is already in ledger (prevents duplicate insertion)
- Replay function updates existing ledger entry (no new entry)
- Company updates are safe (same values overwrite same values)

### C. State Corruption

- Only resets 'error' state events (prevents resetting successful events)
- Replay function verifies event state before processing
- Processing logic includes stale-event checks (prevents overwriting newer state)

### D. Audit Trail

- `processing_attempts` is incremented on reset
- Replay function logs all operations
- Ledger maintains full history of state changes

---

## Limitations Intentionally Left for Step 3

1. **Stuck-Processing Recovery**: Events stuck in 'processing' state (webhook crash) - deferred to Step 3
2. **Bulk Recovery**: No bulk reset/replay mechanism - single events only
3. **Automatic Retry**: No automatic retry for failed events - manual operator action required
4. **UI Integration**: No admin UI - RPC/edge function only (can be called via API)
5. **Observability**: No enhanced logging/alerting - deferred to Step 4

---

## Acceptance Criteria

### RPC Function
- [ ] `reset_failed_stripe_event(p_event_id)` exists
- [ ] Only resets events in 'error' state
- [ ] Increments `processing_attempts`
- [ ] Clears `processing_error`
- [ ] Returns clear success/failure response
- [ ] Rejects invalid states (success, processing, ignored)

### Replay Function
- [ ] `replay-stripe-event` edge function exists
- [ ] Accepts `event_id` or `ledger_id` parameter
- [ ] Loads event from ledger
- [ ] Processes event using existing logic
- [ ] Updates ledger with final state
- [ ] Handles all event types
- [ ] Skips signature verification
- [ ] Skips claim_stripe_event

### Integration
- [ ] RPC can be called independently
- [ ] Replay function can be called after RPC reset
- [ ] Both work together for full recovery flow
- [ ] No regressions in webhook handler

---

## Next Steps

1. Implement RPC function (Step 2A)
2. Implement replay edge function (Step 2B)
3. Test recovery flow: reset → replay → verify
4. Document operator usage
5. Proceed to Step 3 (stuck-processing recovery)

---

## Recommendation

**KEEP** - Proceed with implementation

The plan is:
- ✅ Minimal and safe
- ✅ Preserves idempotency
- ✅ Provides explicit recovery path
- ✅ No changes to core webhook flow
- ✅ Clear operator interface

**Implementation Order**:
1. RPC function first (simpler, can be tested independently)
2. Replay function second (depends on RPC for full flow)
