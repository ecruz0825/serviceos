# Stripe Upgrade / Plan-Change Pipeline Audit

**Date:** Investigation Only (No Code Changes)  
**Goal:** Full audit of Stripe upgrade/plan-change pipeline for ServiceOps.

---

## 1. Billing Page Flow

### File: `src/pages/admin/BillingAdmin.jsx`

**Checkout Start (Lines 84-111):**
```jsx
const startCheckout = async () => {
  setActionError("");
  setStartingCheckout(true);
  try {
    const { data, error } = await supabase.functions.invoke("create-billing-checkout-session", {
      body: {},  // ❌ Empty body - no plan selection sent
    });
    // ...
    window.location.assign(data.url);
  } catch (err) {
    // ...
  }
};
```

**Finding:**
- ✅ Checkout is started via `supabase.functions.invoke("create-billing-checkout-session", { body: {} })`
- ❌ **No plan selection sent** - Body is empty object `{}`
- ❌ **No price selection sent** - No price ID or plan code in request
- ❌ **No UI for plan selection** - Page only shows current plan, no dropdown/buttons to choose Starter vs Pro

**Billing Portal (Lines 113-143):**
```jsx
const openPortal = async () => {
  // ...
  const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
    body: {},  // ❌ Empty body - no plan selection
  });
  // ...
  window.location.assign(data.url);
};
```

**Finding:**
- ✅ Billing portal is opened via `create-billing-portal-session` edge function
- ❌ **No plan selection sent** - Body is empty
- ⚠️ **Portal availability** - Only available when `canOpenPortalByStatus` is true (requires active subscription state)

**Current Plan Display (Line 156):**
```jsx
<p className="text-xl font-semibold text-slate-900 capitalize">{plan}</p>
```

**Finding:**
- Plan is displayed as read-only text
- No interactive plan selection UI exists

---

## 2. Checkout Session Function

### File: `supabase/functions/create-billing-checkout-session/index.ts`

**Price ID Selection (Line 71):**
```typescript
const stripePriceId = Deno.env.get("STRIPE_SUBSCRIPTION_PRICE_ID") ?? "";
```

**Finding:**
- ❌ **Single price ID only** - Uses one environment variable `STRIPE_SUBSCRIPTION_PRICE_ID`
- ❌ **No plan selection logic** - Price ID is hardcoded from env var
- ❌ **No multiple plans/prices supported** - Function does not accept plan parameter or choose between prices

**Checkout Session Creation (Lines 157-173):**
```typescript
session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: stripeCustomerId,
  line_items: [{ price: stripePriceId, quantity: 1 }],  // ❌ Single hardcoded price
  success_url: `${siteUrl}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${siteUrl}/admin/billing?checkout=canceled`,
  client_reference_id: company.id,
  metadata: {
    company_id: company.id,
    plan: company.plan ?? "starter",  // ✅ Current plan sent in metadata
  },
  subscription_data: {
    metadata: {
      company_id: company.id,
      // ❌ No plan in subscription_data.metadata
    },
  },
});
```

**Finding:**
- ✅ **Current company.plan sent in checkout metadata** - Line 166: `plan: company.plan ?? "starter"`
- ❌ **No plan in subscription_data.metadata** - Only `company_id` is set
- ❌ **No way to choose Starter vs Pro** - Always uses same `stripePriceId` from env var
- ⚠️ **Plan in checkout metadata** - This is session-level metadata, not subscription-level

**Company Plan Read (Line 119):**
```typescript
.select("id, name, stripe_customer_id, plan")  // ✅ Reads company.plan
```

**Finding:**
- Company's current plan is read from database
- Used only for metadata, not for price selection

---

## 3. Billing Portal Function

### File: `supabase/functions/create-billing-portal-session/index.ts`

**Portal Session Creation (Lines 112-115):**
```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: company.stripe_customer_id,
  return_url: `${siteUrl}/admin/billing`,  // ✅ Correct return URL
});
```

**Finding:**
- ✅ **Return URL is correct** - Returns to `/admin/billing`
- ✅ **Intended for upgrades/downgrades** - Stripe Billing Portal allows customers to change plans
- ⚠️ **Requires active customer/subscription** - Function checks for `stripe_customer_id` (line 103-109)
- ❌ **No plan selection in portal function** - Portal handles plan changes entirely within Stripe UI

**Customer Requirement (Lines 103-109):**
```typescript
if (!company.stripe_customer_id) {
  return errorResponse(
    409,
    "STRIPE_CUSTOMER_MISSING",
    "No Stripe customer is linked yet. Start checkout first.",
  );
}
```

**Finding:**
- Portal requires existing Stripe customer (created during checkout)
- Cannot use portal before first checkout

---

## 4. Webhook Sync

### File: `supabase/functions/stripe-webhook/index.ts`

**Plan Resolution Function (Lines 54-66):**
```typescript
function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
  fallbackPlan: string,
): string {
  const metadataPlan = subscription.metadata?.plan;  // ✅ Priority 1: subscription.metadata.plan
  if (metadataPlan && metadataPlan.trim()) return metadataPlan.trim();

  const firstItem = subscription.items?.data?.[0];
  const lookupKey = firstItem?.price?.lookup_key;  // ✅ Priority 2: price.lookup_key
  if (lookupKey && lookupKey.trim()) return lookupKey.trim();

  return fallbackPlan || "starter";  // ✅ Priority 3: fallback (company.plan or "starter")
}
```

**Finding:**
- ✅ **Plan resolution priority:**
  1. `subscription.metadata.plan` (if present and non-empty)
  2. `subscription.items.data[0].price.lookup_key` (if present and non-empty)
  3. Fallback: `company.plan || "starter"`

**Plan Update in applySubscriptionSnapshot (Line 244):**
```typescript
const plan = resolvePlanFromSubscription(subscription, company.plan || "starter");

await updateCompany(company.id, {
  // ...
  plan,  // ✅ Plan is updated from subscription
  // ...
});
```

**Event Types That Update companies.plan:**

**1. checkout.session.completed (Lines 270-310):**
```typescript
if (eventType === "checkout.session.completed") {
  const session = event.data.object as Stripe.Checkout.Session;
  // ...
  if (stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    await applySubscriptionSnapshot({ company, subscription });  // ✅ Updates plan
  }
}
```

**2. customer.subscription.created (Lines 312-351):**
```typescript
if (
  eventType === "customer.subscription.created" ||
  eventType === "customer.subscription.updated" ||
  eventType === "customer.subscription.deleted"
) {
  const subscription = event.data.object as Stripe.Subscription;
  // ...
  await applySubscriptionSnapshot({ company, subscription });  // ✅ Updates plan
}
```

**3. customer.subscription.updated (Lines 312-351):**
- Same handler as `.created` - updates plan when subscription changes

**4. customer.subscription.deleted (Lines 312-351):**
- Same handler - sets status to "canceled" but still resolves plan

**5. invoice.payment_succeeded (Lines 353-397):**
```typescript
if (eventType === "invoice.payment_failed" || eventType === "invoice.payment_succeeded") {
  // ...
  if (stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    await applySubscriptionSnapshot({ company, subscription });  // ✅ Updates plan
  }
}
```

**6. invoice.payment_failed (Lines 353-397):**
- Same handler - updates plan even on payment failure

**Summary of Plan-Update Events:**
- ✅ `checkout.session.completed` → Updates plan
- ✅ `customer.subscription.created` → Updates plan
- ✅ `customer.subscription.updated` → Updates plan (most important for upgrades)
- ✅ `customer.subscription.deleted` → Updates plan (before canceling)
- ✅ `invoice.payment_succeeded` → Updates plan
- ✅ `invoice.payment_failed` → Updates plan

---

## 5. Current Stripe Plan Model in Code

### Environment Variables

**File: `supabase/functions/create-billing-checkout-session/index.ts` (Line 71):**
```typescript
const stripePriceId = Deno.env.get("STRIPE_SUBSCRIPTION_PRICE_ID") ?? "";
```

**Finding:**
- ❌ **Single price ID env var** - `STRIPE_SUBSCRIPTION_PRICE_ID` (no starter/pro variants found)
- ❌ **No lookup_key usage in checkout** - Checkout doesn't set or read lookup_key
- ❌ **No plan selection env vars** - No `STRIPE_STARTER_PRICE_ID` or `STRIPE_PRO_PRICE_ID`

### Metadata Usage

**Checkout Session Metadata (Line 164-166):**
```typescript
metadata: {
  company_id: company.id,
  plan: company.plan ?? "starter",  // ✅ Current plan in session metadata
},
```

**Subscription Metadata (Line 168-171):**
```typescript
subscription_data: {
  metadata: {
    company_id: company.id,
    // ❌ No plan in subscription metadata
  },
},
```

**Finding:**
- ⚠️ **Plan in session metadata only** - Not in subscription metadata
- ⚠️ **Webhook reads subscription.metadata.plan** - But checkout doesn't set it
- ⚠️ **Mismatch risk** - Webhook will fall back to `price.lookup_key` or `company.plan`

### Plan Selection UI

**Search Results:**
- ❌ **No plan selection UI found** - No dropdowns, buttons, or forms to choose Starter vs Pro
- ❌ **No plan comparison UI** - No pricing table or feature comparison
- ❌ **No upgrade/downgrade buttons** - Only "Start Checkout" and "Open Billing Portal"

**Finding:**
- Plan selection is entirely handled by Stripe Billing Portal (if customer has active subscription)
- No in-app plan selection mechanism exists

---

## 6. Final Section

### A) Does the app currently support more than one Stripe subscription price?

**Answer: ❌ NO**

**Evidence:**
- Single environment variable: `STRIPE_SUBSCRIPTION_PRICE_ID` (line 71 of checkout function)
- Checkout always uses same price ID: `line_items: [{ price: stripePriceId, quantity: 1 }]` (line 160)
- No plan parameter accepted in checkout function
- No price selection logic exists

**Conclusion:** The app currently supports only **one Stripe subscription price**. All checkouts use the same price ID from environment variables.

---

### B) If a company upgrades today, what exact code path updates companies.plan?

**Answer:** Webhook → `applySubscriptionSnapshot` → `resolvePlanFromSubscription` → `updateCompany`

**Exact Code Path:**

1. **User upgrades via Stripe Billing Portal** (outside app)
2. **Stripe sends webhook:** `customer.subscription.updated` (line 314)
3. **Webhook handler (line 335-339):**
   ```typescript
   await applySubscriptionSnapshot({
     company,
     subscription,
     forceStatus: eventType === "customer.subscription.deleted" ? "canceled" : undefined,
   });
   ```
4. **applySubscriptionSnapshot (line 244):**
   ```typescript
   const plan = resolvePlanFromSubscription(subscription, company.plan || "starter");
   ```
5. **resolvePlanFromSubscription (lines 54-66):**
   - Checks `subscription.metadata.plan` (priority 1)
   - Falls back to `subscription.items.data[0].price.lookup_key` (priority 2)
   - Falls back to `company.plan || "starter"` (priority 3)
6. **updateCompany (line 246-258):**
   ```typescript
   await updateCompany(company.id, {
     // ...
     plan,  // ✅ Plan updated here
     // ...
   });
   ```

**Conclusion:** Plan is updated **only via webhook** when Stripe sends `customer.subscription.updated` event. The update happens in `applySubscriptionSnapshot` → `updateCompany`.

---

### C) Is companies.plan truly driven by Stripe after checkout/webhook?

**Answer: ⚠️ PARTIALLY - Depends on Stripe configuration**

**Current Flow:**
1. **Checkout:** Sets `plan: company.plan ?? "starter"` in **session metadata** (line 166), but **NOT in subscription metadata** (line 168-171)
2. **Webhook:** Reads plan from:
   - `subscription.metadata.plan` (if set by Stripe)
   - `price.lookup_key` (if configured in Stripe)
   - Fallback: `company.plan || "starter"`

**Problem:**
- ❌ Checkout doesn't set `subscription_data.metadata.plan`
- ⚠️ Webhook priority 1 (`subscription.metadata.plan`) may be empty
- ⚠️ Webhook priority 2 (`price.lookup_key`) requires Stripe price configuration
- ⚠️ Webhook priority 3 (fallback) uses existing `company.plan`, creating circular dependency

**Conclusion:** `companies.plan` is **intended** to be driven by Stripe, but the current implementation has gaps:
- If Stripe prices have `lookup_key` set to "starter" or "pro", webhook will use that ✅
- If Stripe subscription metadata has `plan`, webhook will use that ✅
- Otherwise, webhook falls back to existing `company.plan`, which may be stale ❌

---

### D) Is there any mismatch risk between Stripe price and companies.plan?

**Answer: ✅ YES - Multiple mismatch risks exist**

**Risk 1: Checkout doesn't set subscription metadata.plan**
- Checkout sets `plan` in session metadata but not subscription metadata
- Webhook reads `subscription.metadata.plan` first, but it may be empty
- **Impact:** Webhook falls back to `price.lookup_key` or existing `company.plan`

**Risk 2: Single price ID means no plan differentiation**
- All checkouts use same `STRIPE_SUBSCRIPTION_PRICE_ID`
- Cannot distinguish Starter vs Pro at checkout time
- **Impact:** If Stripe has multiple prices (starter/pro), checkout always uses same price

**Risk 3: Fallback to existing company.plan**
- If `subscription.metadata.plan` and `price.lookup_key` are both empty, webhook uses existing `company.plan`
- **Impact:** Plan may not update after upgrade if Stripe doesn't set metadata/lookup_key

**Risk 4: Manual plan changes in Stripe dashboard**
- If admin changes subscription in Stripe dashboard, webhook should update `companies.plan`
- But if Stripe doesn't set metadata/lookup_key, webhook may not detect change
- **Impact:** `companies.plan` may be stale after manual Stripe changes

**Conclusion:** **Yes, mismatch risks exist.** The current architecture relies on Stripe price `lookup_key` or subscription metadata, but checkout doesn't ensure these are set correctly.

---

### E) What is the smallest safe architecture to support Starter and Pro upgrades?

**Answer: Minimal changes to support two plans**

**Required Changes:**

**1. Environment Variables:**
- Add `STRIPE_STARTER_PRICE_ID` (or keep single price if Starter is free/trial)
- Add `STRIPE_PRO_PRICE_ID`

**2. Checkout Function (`create-billing-checkout-session/index.ts`):**
- Accept `plan` parameter in request body (optional, default to current `company.plan`)
- Map plan to price ID:
  ```typescript
  const priceIdMap: Record<string, string> = {
    starter: Deno.env.get("STRIPE_STARTER_PRICE_ID") ?? stripePriceId,
    pro: Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "",
  };
  const selectedPriceId = priceIdMap[plan] || stripePriceId;
  ```
- Set `subscription_data.metadata.plan` (not just session metadata):
  ```typescript
  subscription_data: {
    metadata: {
      company_id: company.id,
      plan: plan,  // ✅ Add plan to subscription metadata
    },
  },
  ```

**3. BillingAdmin.jsx (Optional - for in-app selection):**
- Add plan selection UI (radio buttons or dropdown: Starter vs Pro)
- Pass selected plan in checkout request:
  ```jsx
  const { data, error } = await supabase.functions.invoke("create-billing-checkout-session", {
    body: { plan: selectedPlan },  // ✅ Send plan selection
  });
  ```

**4. Stripe Price Configuration (Required in Stripe Dashboard):**
- Set `lookup_key` on each price: "starter" and "pro"
- This provides fallback if subscription metadata is missing

**5. Webhook (No changes needed):**
- Current `resolvePlanFromSubscription` already handles:
  - `subscription.metadata.plan` ✅
  - `price.lookup_key` ✅
  - Fallback ✅

**Smallest Safe Architecture:**
1. ✅ **Two price IDs in env vars** (starter + pro)
2. ✅ **Checkout accepts plan parameter** (defaults to current plan)
3. ✅ **Checkout sets subscription.metadata.plan** (ensures webhook can read it)
4. ✅ **Stripe prices have lookup_key** (fallback for webhook)
5. ⚠️ **Optional: In-app plan selection UI** (can use Stripe Portal instead)

**Alternative (Even Smaller):**
- Skip in-app UI, rely entirely on Stripe Billing Portal for upgrades
- Only fix checkout to set `subscription.metadata.plan`
- Ensure Stripe prices have `lookup_key` set
- Webhook will automatically sync plan changes from Portal

**Conclusion:** The **smallest safe architecture** requires:
- Two price IDs (starter + pro)
- Checkout function accepts plan and sets subscription metadata
- Stripe prices configured with lookup_key
- Webhook already handles this correctly (no changes needed)
