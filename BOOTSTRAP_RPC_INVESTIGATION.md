# Company Bootstrap RPC Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Understand the exact shape of `bootstrap_tenant_for_current_user` RPC before adding automatic 14-day trial start.

---

## 1. Exact SQL Body of `bootstrap_tenant_for_current_user`

**File:** `supabase/migrations/20260310070000_add_tenant_bootstrap_rpc.sql`

**Function Signature (Lines 18-25):**
```sql
CREATE OR REPLACE FUNCTION public.bootstrap_tenant_for_current_user(
  p_company_name text,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
```

**Complete Function Body (Lines 26-146):**
```sql
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_existing_company_id uuid;
  v_existing_role text;
  v_existing_full_name text;
  v_company_id uuid;
  v_company_name text;
  v_display_name text;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Validate company name
  v_company_name := NULLIF(btrim(COALESCE(p_company_name, '')), '');
  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'COMPANY_NAME_REQUIRED';
  END IF;

  v_display_name := NULLIF(btrim(COALESCE(p_display_name, '')), '');
  IF v_display_name IS NULL THEN
    v_display_name := v_company_name;
  END IF;

  -- 3) Load + lock caller profile row
  SELECT
    p.id,
    p.company_id,
    p.role,
    p.full_name
  INTO
    v_profile_id,
    v_existing_company_id,
    v_existing_role,
    v_existing_full_name
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- 4) Idempotency: if already linked, return existing company id
  IF v_existing_company_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_linked',
      'company_id', v_existing_company_id
    );
  END IF;

  -- 5) Create company with required base field
  INSERT INTO public.companies (
    name
  ) VALUES (
    v_company_name
  )
  RETURNING id INTO v_company_id;

  -- 6) Set optional company fields only when those columns exist
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'display_name'
  ) THEN
    UPDATE public.companies
    SET display_name = v_display_name
    WHERE id = v_company_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'onboarding_step'
  ) THEN
    UPDATE public.companies
    SET onboarding_step = 'company'
    WHERE id = v_company_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'setup_completed_at'
  ) THEN
    UPDATE public.companies
    SET setup_completed_at = NULL
    WHERE id = v_company_id;
  END IF;

  -- 7) Link caller profile to company and promote to admin
  UPDATE public.profiles
  SET
    company_id = v_company_id,
    role = 'admin',
    full_name = CASE
      WHEN NULLIF(btrim(COALESCE(full_name, '')), '') IS NULL
           AND NULLIF(btrim(COALESCE(p_display_name, '')), '') IS NOT NULL
      THEN btrim(p_display_name)
      ELSE full_name
    END
  WHERE id = v_profile_id;

  -- 8) Created response
  RETURN jsonb_build_object(
    'ok', true,
    'status', 'created',
    'company_id', v_company_id
  );
END;
$$;
```

**Key Characteristics:**
- Uses `SECURITY DEFINER` (runs with function owner privileges)
- Uses `FOR UPDATE` lock on profile row (prevents race conditions)
- Idempotent: returns early if profile already has `company_id`
- Uses dynamic column checks for optional fields (`display_name`, `onboarding_step`, `setup_completed_at`)

---

## 2. Exact INSERT/UPDATE Statements Touching `public.companies`

### INSERT Statement (Lines 83-88):
```sql
INSERT INTO public.companies (
  name
) VALUES (
  v_company_name
)
RETURNING id INTO v_company_id;
```

**Finding:** Only sets `name` field. All other fields use defaults or are set via subsequent UPDATE statements.

### UPDATE Statements (Conditional, Lines 91-125):

**1. Display Name (Lines 91-101):**
```sql
IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'display_name'
) THEN
  UPDATE public.companies
  SET display_name = v_display_name
  WHERE id = v_company_id;
END IF;
```

**2. Onboarding Step (Lines 103-113):**
```sql
IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'onboarding_step'
) THEN
  UPDATE public.companies
  SET onboarding_step = 'company'
  WHERE id = v_company_id;
END IF;
```

**3. Setup Completed At (Lines 115-125):**
```sql
IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'setup_completed_at'
) THEN
  UPDATE public.companies
  SET setup_completed_at = NULL
  WHERE id = v_company_id;
END IF;
```

**Pattern:** All optional fields use the same pattern:
1. Check if column exists via `information_schema.columns`
2. If exists, perform UPDATE
3. This allows the function to work across different migration states

**Current Billing Fields Status:**
- `subscription_status` - Has default `'inactive'` (from migration `20260309133000_add_companies_billing_fields.sql`)
- `trial_ends_at` - NULL by default (nullable column)
- `billing_updated_at` - NULL by default (nullable column)
- `plan` - Has default `'starter'`
- `billing_grace_until` - NULL by default (nullable column)

**Finding:** None of the billing fields (`subscription_status`, `trial_ends_at`, `billing_updated_at`) are currently set during bootstrap.

---

## 3. Existing RETURN Payload from the RPC

### Return Case 1: Already Linked (Lines 74-80)
```sql
IF v_existing_company_id IS NOT NULL THEN
  RETURN jsonb_build_object(
    'ok', true,
    'status', 'already_linked',
    'company_id', v_existing_company_id
  );
END IF;
```

**Payload:**
```json
{
  "ok": true,
  "status": "already_linked",
  "company_id": "<uuid>"
}
```

### Return Case 2: Created (Lines 140-145)
```sql
RETURN jsonb_build_object(
  'ok', true,
  'status', 'created',
  'company_id', v_company_id
);
```

**Payload:**
```json
{
  "ok": true,
  "status": "created",
  "company_id": "<uuid>"
}
```

**Common Structure:**
- `ok`: boolean (always `true` on success)
- `status`: string (`'created'` or `'already_linked'`)
- `company_id`: uuid (always present)

**No billing fields are returned** in the response payload.

---

## 4. Assumptions in `CompanyBootstrap.jsx` About Returned Fields

**File:** `src/pages/auth/CompanyBootstrap.jsx`

### RPC Call (Lines 55-58):
```jsx
const { data, error: rpcError } = await supabase.rpc('bootstrap_tenant_for_current_user', {
  p_company_name: trimmedCompanyName,
  p_display_name: trimmedDisplayName || null,
})
```

### Response Validation (Lines 75-76):
```jsx
const status = data?.status
if (data?.ok === true && (status === 'created' || status === 'already_linked')) {
```

**Assumptions:**
1. `data?.ok` must be `true` (boolean)
2. `data?.status` must be either `'created'` or `'already_linked'` (string)
3. `data?.company_id` is expected when `status === 'already_linked'` (line 86)

### Usage of `company_id` (Lines 86-101):
```jsx
const companyId = data?.company_id
if (companyId) {
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('onboarding_step, setup_completed_at')
    .eq('id', companyId)
    .maybeSingle()
  // ...
}
```

**Finding:** The frontend does **NOT** assume any billing fields in the RPC response. It:
- Only uses `ok`, `status`, and `company_id` from the RPC response
- Fetches `onboarding_step` and `setup_completed_at` separately via a direct query to `companies` table
- Does not check or use `subscription_status`, `trial_ends_at`, or `billing_updated_at`

**Conclusion:** Adding billing fields to the RPC response would be safe (won't break existing code), but is **not required** since the frontend doesn't use them.

---

## 5. Final Section

### A) Smallest Safe Place to Set `subscription_status = 'trialing'` and `trial_ends_at = now() + interval '14 days'`

**Recommended Location:** Add a new conditional UPDATE block after the `setup_completed_at` UPDATE (after line 125), following the same pattern as other optional fields.

**Exact Location:** After line 125, before line 127 (before the profile UPDATE)

**Rationale:**
1. **Follows existing pattern** - Uses the same conditional column check pattern as `display_name`, `onboarding_step`, and `setup_completed_at`
2. **Safe migration path** - Works even if billing columns don't exist yet (though they should exist based on migration order)
3. **Logical grouping** - All company table updates are together before the profile update
4. **Minimal change** - Only adds one new conditional block, doesn't modify existing logic

**Proposed Code Block:**
```sql
IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'subscription_status'
) AND EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'trial_ends_at'
) THEN
  UPDATE public.companies
  SET
    subscription_status = 'trialing',
    trial_ends_at = now() + interval '14 days'
  WHERE id = v_company_id;
END IF;
```

**Alternative (Simpler, if columns are guaranteed to exist):**
```sql
UPDATE public.companies
SET
  subscription_status = 'trialing',
  trial_ends_at = now() + interval '14 days'
WHERE id = v_company_id;
```

**Recommendation:** Use the conditional check version for safety, even though billing columns should exist. This matches the defensive pattern used elsewhere in the function.

### B) Should `billing_updated_at` Also Be Set During Bootstrap?

**YES, but with nuance:**

**Arguments FOR setting it:**
1. **Consistency** - `stripe-webhook` function always sets `billing_updated_at` when updating billing fields (see `supabase/functions/stripe-webhook/index.ts` line 207)
2. **Audit trail** - Records when the trial was initiated
3. **Debugging** - Helps identify when trial started vs. when it was last synced from Stripe

**Arguments AGAINST:**
1. **Semantic clarity** - `billing_updated_at` might be intended only for Stripe sync timestamps
2. **Not strictly required** - Trial expiration logic in `OnboardingGuard.jsx` doesn't use this field

**Recommendation:** **SET IT** for consistency with the webhook pattern. The webhook function sets `billing_updated_at` on every billing update, so bootstrap should follow the same pattern.

**Updated Code Block:**
```sql
IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'subscription_status'
) AND EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'trial_ends_at'
) THEN
  UPDATE public.companies
  SET
    subscription_status = 'trialing',
    trial_ends_at = now() + interval '14 days',
    billing_updated_at = now()
  WHERE id = v_company_id;
END IF;
```

**Note:** The conditional check for `billing_updated_at` is optional since we're already checking for `subscription_status` and `trial_ends_at`, and all three columns were added in the same migration.

---

## Summary

- **RPC Structure:** Function uses conditional column checks for optional fields, follows idempotent pattern
- **Company INSERT:** Only sets `name` initially, all other fields via UPDATE
- **Return Payload:** Returns `{ok, status, company_id}` - no billing fields
- **Frontend Assumptions:** Only uses `ok`, `status`, `company_id` - no billing field dependencies
- **Smallest Safe Change:** Add conditional UPDATE block after `setup_completed_at` UPDATE (line 125)
- **Recommended Fields:** Set `subscription_status = 'trialing'`, `trial_ends_at = now() + interval '14 days'`, and `billing_updated_at = now()`
