# Company Creation and Trial Handling Investigation

## 1. Company Creation Logic

### Primary Company Creation: bootstrap_tenant_for_current_user RPC

**FILE PATH:** `supabase/migrations/20260310070000_add_tenant_bootstrap_rpc.sql`

**RELEVANT SNIPPET:**
```sql
-- Lines 83-88: Company INSERT
INSERT INTO public.companies (
  name
) VALUES (
  v_company_name
)
RETURNING id INTO v_company_id;
```

**Called From:**
- `src/pages/auth/CompanyBootstrap.jsx` line 55:
```jsx
const { data, error: rpcError } = await supabase.rpc('bootstrap_tenant_for_current_user', {
  p_company_name: trimmedCompanyName,
  p_display_name: trimmedDisplayName || null,
})
```

**Company Creation Flow:**
1. User visits `/bootstrap/company` (admin without company_id)
2. `CompanyBootstrap.jsx` calls `bootstrap_tenant_for_current_user` RPC
3. RPC creates company with only `name` field (line 83-88)
4. RPC updates company with optional fields if columns exist:
   - `display_name` (lines 98-100)
   - `onboarding_step = 'company'` (lines 110-112)
   - `setup_completed_at = NULL` (lines 122-124)
5. RPC updates caller's profile to link to company and set role='admin' (lines 128-138)

**Billing Fields Set on Creation:**
- **NONE** - Company is created with default values:
  - `subscription_status` = 'inactive' (default from migration)
  - `plan` = 'starter' (default from migration)
  - `trial_ends_at` = NULL (default)
  - `billing_grace_until` = NULL (default)

**Evidence:**
- `supabase/migrations/20260309133000_add_companies_billing_fields.sql` line 10-14:
```sql
ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz NULL,
```

---

## 2. Profile Creation Logic

### Automatic Profile Creation: handle_new_user Trigger

**FILE PATH:** `supabase/migrations/20260221120002_harden_handle_new_user.sql`

**RELEVANT SNIPPET:**
```sql
-- Lines 119-126: Profile INSERT
INSERT INTO public.profiles (id, email, full_name, role, company_id)
VALUES (
  NEW.id,
  NEW.email,
  v_full_name,
  v_role,
  v_company_id
)
ON CONFLICT (id) DO NOTHING;
```

**Trigger:** Fires automatically on `auth.users` INSERT (line 80-83 in `20260126000002_profiles_setup_and_rls.sql`)

**Profile Linking to Company:**
1. **Via Bootstrap RPC:** `bootstrap_tenant_for_current_user` updates profile (lines 128-138):
```sql
UPDATE public.profiles
SET
  company_id = v_company_id,
  role = 'admin',
  full_name = CASE ... END
WHERE id = v_profile_id;
```

2. **Via Auto-link Customer:** `src/context/UserContext.jsx` lines 60-67:
```jsx
const { error: profileError } = await supabase
  .from('profiles')
  .insert({
    id: userId,
    company_id: customer.company_id,
    role: 'customer',
    full_name: customer.full_name || null
  });
```

3. **Via Invite Function:** `supabase/functions/invite-user/index.ts` creates/updates profiles with company_id from metadata

---

## 3. Trial Handling

### Search Results for trial_ends_at and subscription_status = 'trialing'

**FILE PATH:** `supabase/functions/stripe-webhook/index.ts`

**RELEVANT SNIPPET:**
```typescript
// Line 254: trial_ends_at set from Stripe subscription
trial_ends_at: toIsoOrNull(subscription.trial_end),

// Line 252: subscription_status set from Stripe status
subscription_status: appStatus,

// Line 17: Status mapping includes 'trialing'
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

**Trial Logic Location:**
- **ONLY in Stripe webhook handler** (`stripe-webhook/index.ts`)
- **NO automatic trial start** in company creation
- **NO trial logic** in bootstrap RPC
- **NO trial logic** in checkout session creation

**How Trial is Set:**
1. Stripe subscription has `trial_end` timestamp
2. Stripe subscription status is `trialing`
3. Webhook receives `customer.subscription.created` or `customer.subscription.updated` event
4. `applySubscriptionSnapshot` function (lines 236-259) updates company:
   - `subscription_status` = 'trialing' (mapped from Stripe status)
   - `trial_ends_at` = converted from `subscription.trial_end` Unix timestamp

**Evidence:**
- `supabase/functions/stripe-webhook/index.ts` line 243:
```typescript
const appStatus = forceStatus || mapStripeStatusToAppStatus(subscription.status);
```
- Line 254: `trial_ends_at: toIsoOrNull(subscription.trial_end)`

**Conclusion:** Trial status is **reactive** - only set when Stripe webhook reports a subscription with trial status. No proactive trial start on company creation.

---

## 4. Stripe Trial Configuration

### Checkout Session Creation

**FILE PATH:** `supabase/functions/create-billing-checkout-session/index.ts`

**RELEVANT SNIPPET:**
```typescript
// Lines 157-173: Checkout session creation
session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: stripeCustomerId,
  line_items: [{ price: stripePriceId, quantity: 1 }],
  success_url: `${siteUrl}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${siteUrl}/admin/billing?checkout=canceled`,
  client_reference_id: company.id,
  metadata: {
    company_id: company.id,
    plan: company.plan ?? "starter",
  },
  subscription_data: {
    metadata: {
      company_id: company.id,
    },
  },
});
```

**Trial Configuration Analysis:**
- **NO `trial_period_days` parameter** in checkout session creation
- **NO `subscription_data.trial_period_days`** set
- **NO trial configuration** in checkout session

**Trial Control:**
- Trial must be configured **in Stripe dashboard** on the Price/Product level
- OR trial must be set via Stripe API when creating subscription (not done in checkout session)
- Trial behavior is **Stripe-controlled**, not application-controlled

**Evidence:**
- Checkout session only sets:
  - `mode: "subscription"`
  - `line_items: [{ price: stripePriceId, quantity: 1 }]`
  - Metadata for company tracking
- No trial-related parameters in checkout session creation

---

## 5. Final Section

### A) Does a new company automatically start a trial today?

**Answer: NO**

**Evidence:**
1. `bootstrap_tenant_for_current_user` RPC (lines 83-88) creates company with:
   - `subscription_status` = 'inactive' (default)
   - `trial_ends_at` = NULL (default)
   - No trial initialization code

2. No trial start logic in:
   - Company creation RPC
   - OnboardingWizard
   - CompanyBootstrap component
   - Any migration or trigger

3. Trial status only set via Stripe webhook when subscription is created with trial

**Conclusion:** New companies start with `subscription_status = 'inactive'` and `trial_ends_at = NULL`. Trial only begins when:
- Admin creates Stripe checkout session
- Stripe Price/Product has trial configured
- Subscription is created with trial period
- Webhook updates company with trial status

---

### B) Is trial logic handled in Stripe or database?

**Answer: BOTH (Stripe controls trial, database reflects status)**

**Stripe Side:**
- Trial period configured on Stripe Price/Product
- Trial start/end managed by Stripe
- Trial status reported via webhooks

**Database Side:**
- `trial_ends_at` stores trial end timestamp (from Stripe)
- `subscription_status` = 'trialing' reflects Stripe status
- Updated reactively via webhook events

**Evidence:**
- `supabase/functions/stripe-webhook/index.ts` line 254: `trial_ends_at: toIsoOrNull(subscription.trial_end)`
- Database is **read-only** for trial - it mirrors Stripe state, doesn't control it

---

### C) Is trial enforcement implemented anywhere in the UI?

**Answer: NO (trial is treated same as active billing)**

**Evidence:**
1. `src/components/OnboardingGuard.jsx` line 108-109:
```javascript
const hasActiveBilling =
  billingStatus === "trialing" || billingStatus === "active" || hasValidGrace;
```

2. Trial status allows full admin access (same as active)
3. No special trial UI warnings or restrictions
4. No trial countdown or expiration warnings in UI

**Conclusion:** Trial is treated as "active billing" - no special enforcement or restrictions. Companies with `subscription_status = 'trialing'` have full access.

---

### D) What code path creates the first admin + company workspace?

**Answer: bootstrap_tenant_for_current_user RPC**

**Complete Flow:**

1. **User Registration:**
   - User signs up via Supabase Auth
   - `handle_new_user` trigger creates profile (no company_id initially)

2. **Admin Without Company:**
   - Admin user logs in
   - `OnboardingGuard.jsx` line 80-82 redirects to `/bootstrap/company` if no company_id

3. **Company Bootstrap:**
   - User visits `/bootstrap/company`
   - `src/pages/auth/CompanyBootstrap.jsx` renders form
   - User enters company name
   - Line 55: Calls `supabase.rpc('bootstrap_tenant_for_current_user', {...})`

4. **RPC Execution:**
   - `supabase/migrations/20260310070000_add_tenant_bootstrap_rpc.sql`
   - Line 83-88: **Creates company** with name
   - Line 98-100: Sets display_name (if column exists)
   - Line 110-112: Sets onboarding_step = 'company'
   - Line 128-138: **Links profile to company** and sets role='admin'

5. **Post-Bootstrap:**
   - `CompanyBootstrap.jsx` line 81: Redirects to `/admin/onboarding`
   - User completes onboarding wizard
   - `OnboardingWizard.jsx` line 492-500: Sets `setup_completed_at` when finished

**Key Files:**
- **Company Creation:** `supabase/migrations/20260310070000_add_tenant_bootstrap_rpc.sql` lines 83-88
- **Profile Linking:** Same file, lines 128-138
- **UI Entry Point:** `src/pages/auth/CompanyBootstrap.jsx` line 55
- **Redirect Logic:** `src/components/OnboardingGuard.jsx` line 80-82

**Billing Status After Creation:**
- `subscription_status` = 'inactive'
- `plan` = 'starter'
- `trial_ends_at` = NULL
- No trial started automatically
