# Plan Limit Error UX Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Design a shared SaaS upgrade-prompt UX for plan limit errors.

---

## 1. Current Error Handling for Create Actions

### CustomersAdmin.jsx

**File:** `src/pages/admin/CustomersAdmin.jsx`

**Create Submit Handler Location:** Lines 1121-1151

**Error Handling Pattern:**
```jsx
const { data: inserted, error } = await supabase
  .from('customers')
  .insert([{
    ...form,
    tags: normalizedTags,
    company_id: companyId,
    user_id: null,
  }])
  .select();

if (!error && inserted?.length) {
  // Success path: toast.success('Customer added!');
} 
// ❌ No explicit error handling - errors are silently ignored
```

**Finding:** Errors are not explicitly handled. If `error` exists, the success path is skipped, but no error message is shown to the user.

**Error Display Method:** Currently **NONE** - errors are silently ignored.

---

### CrewAdmin.jsx

**File:** `src/pages/admin/CrewAdmin.jsx`

**Create Submit Handler Location:** Lines 51-84 (`saveCrew` function)

**Error Handling Pattern:**
```jsx
const { error } = await supabase
  .from('crew_members')
  .insert([{
    full_name: form.full_name,
    email: form.email || null,
    phone: form.phone || null,
    role: form.role || 'crew',
    company_id: companyId
  }]);
if (error) toast.error(error.message);
else toast.success('Worker added');
```

**Error Display Method:** `toast.error(error.message)` - **Toast notification**

**Exact Code Excerpt:**
```jsx
// Lines 68-78
const { error } = await supabase
  .from('crew_members')
  .insert([{
    full_name: form.full_name,
    email: form.email || null,
    phone: form.phone || null,
    role: form.role || 'crew',
    company_id: companyId
  }]);
if (error) toast.error(error.message);
else toast.success('Worker added');
```

---

### JobsAdmin.jsx

**File:** `src/pages/admin/JobsAdmin.jsx`

**Create Submit Handler Location:** Lines 761-908 (`saveJob` function)

**Error Handling Pattern:**
```jsx
try {
  // ... image upload logic ...
  
  const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
  if (error) throw error;
  savedJob = data;
  
  // Success path...
} finally {
  setIsSaving(false);
}
// ❌ No catch block - errors bubble up unhandled
```

**Error Display Method:** Currently **NONE** - errors are thrown but not caught, so they would appear in console only.

**Exact Code Excerpt:**
```jsx
// Lines 874-876
} else {
  const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
  if (error) throw error;
  savedJob = data;
```

**Note:** The function uses `try/finally` but no `catch`, so errors would bubble up unhandled.

---

### BillingAdmin.jsx

**File:** `src/pages/admin/BillingAdmin.jsx`

**Not Applicable:** BillingAdmin does not create customers, crew, or jobs. It only manages billing/subscription actions.

---

## 2. Existing Reusable UI Primitives

### ConfirmModal Component

**File:** `src/components/ui/ConfirmModal.jsx`

**Summary:** Professional confirmation dialog with backdrop, title, message, and action buttons.

**Props:**
- `open: boolean`
- `title: string`
- `message: string | ReactNode`
- `confirmText: string` (default: "Confirm")
- `cancelText: string` (default: "Cancel")
- `confirmVariant: "danger" | "primary" | "secondary"` (default: "danger")
- `onConfirm: function`
- `onCancel: function`
- `loading: boolean`

**Usage Pattern:**
```jsx
// Via useConfirm hook
const { confirm, ConfirmDialog } = useConfirm();

const confirmed = await confirm({
  title: 'Delete worker?',
  message: 'This action cannot be undone.',
  confirmText: 'Delete',
  confirmVariant: 'danger'
});

// In JSX:
<ConfirmDialog />
```

**Finding:** ✅ **Appropriate for upgrade prompts** - Can be used to show limit reached message with "Upgrade" CTA button.

---

### useConfirm Hook

**File:** `src/hooks/useConfirm.jsx`

**Summary:** Hook that wraps ConfirmModal with promise-based API.

**Return Value:**
```jsx
{
  confirm: (options) => Promise<boolean>,
  ConfirmDialog: React.Component
}
```

**Finding:** ✅ **Can be adapted** - Could create similar `useUpgradePrompt` hook, or reuse `confirm` with custom options.

---

### Toast (react-hot-toast)

**Package:** `react-hot-toast`

**Usage Pattern:**
```jsx
import toast from 'react-hot-toast';

toast.error('Error message');
toast.success('Success message');
toast.custom((t) => (
  <div>Custom toast content</div>
));
```

**Finding:** ✅ **Currently used** - All three admin pages use `toast.error()` for errors. Can be used for simple limit error messages, but less ideal for upgrade CTAs.

**Example from CrewAdmin (Line 77):**
```jsx
if (error) toast.error(error.message);
```

---

### Card Component

**File:** `src/components/ui/Card.jsx`

**Summary:** Simple card container with optional clickable styling.

**Finding:** ⚠️ **Not appropriate** - Card is a layout component, not for error/alert display.

---

### Alert Banner Component

**Finding:** ❌ **Not found** - No dedicated alert banner component exists in the codebase.

---

### Empty State Component

**File:** `src/components/customer/EmptyState.jsx` (referenced in JobsAdmin)

**Finding:** ⚠️ **Not appropriate** - EmptyState is for empty lists, not error messages.

---

## 3. Billing Navigation Path

### Route Definition

**File:** `src/App.jsx`

**Billing Route:** Line 160
```jsx
<Route
  path="/admin/billing"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <BillingAdmin />
    </ProtectedRoute>
  }
/>
```

**Finding:** ✅ **Route exists** - `/admin/billing` is the correct path for billing/upgrade page.

---

### BillingAdmin Component

**File:** `src/pages/admin/BillingAdmin.jsx`

**Summary:** Displays current plan, subscription status, usage & limits, and Stripe checkout/portal actions.

**Finding:** ✅ **Ready for upgrade flow** - BillingAdmin already shows plan info and has "Start Checkout" button for subscription management.

---

## 4. Error String Handling

### Existing Error Parsing Patterns

**Pattern 1: String includes() checks**

**File:** `src/pages/admin/RevenueHub.jsx` (Multiple instances)
```jsx
if (error.message?.includes('FORBIDDEN')) {
  // Handle forbidden error
}
```

**File:** `src/pages/admin/PaymentsAdmin.jsx` (Lines 1071-1080)
```jsx
if (error.message?.includes('PAYMENT_ALREADY_VOIDED') || error.message?.includes('already voided')) {
  // Handle specific error
} else if (error.message?.includes('REASON_REQUIRED') || error.message?.includes('reason')) {
  // Handle another error
}
```

**File:** `src/pages/crew/CrewPortalMobile.jsx` (Line 499)
```jsx
if (error.message?.includes('JOB_ALREADY_COMPLETED')) {
  // Handle error
}
```

**Pattern 2: Direct error.message access**

**File:** `src/pages/admin/CrewAdmin.jsx` (Line 77)
```jsx
if (error) toast.error(error.message);
```

**File:** `src/pages/admin/BillingAdmin.jsx` (Line 79)
```jsx
const getInvokeErrorMessage = (data, error, fallback) => {
  if (error?.message) return error.message;
  if (data?.message) return data.message;
  return fallback;
};
```

**Pattern 3: Error code checks**

**File:** `src/pages/admin/JobsAdmin.jsx` (Line 567)
```jsx
if (invoicesError.code !== '42P01' && !invoicesError.message.includes('does not exist')) {
  console.error('Error fetching invoices:', invoicesError);
}
```

**File:** `src/pages/admin/PaymentsAdmin.jsx` (Line 585)
```jsx
if (invoiceError.code !== 'PGRST116') {
  // Handle error
}
```

---

### Plan Limit Error Strings from Migrations

**File:** `supabase/migrations/20260310080004_enforce_customer_plan_limit.sql` (Line 49-51)
```sql
RAISE EXCEPTION 'CUSTOMER_LIMIT_REACHED' USING
  MESSAGE = format(
    'CUSTOMER_LIMIT_REACHED: %s plan allows up to %s customers. Upgrade to Pro to add more customers.',
    v_usage.plan_code,
    v_usage.max_customers
  );
```

**File:** `supabase/migrations/20260310080005_enforce_crew_plan_limit.sql` (Line 49-51)
```sql
RAISE EXCEPTION 'CREW_LIMIT_REACHED' USING
  MESSAGE = format(
    'CREW_LIMIT_REACHED: %s plan allows up to %s crew members. Upgrade to Pro to add more crew members.',
    v_usage.plan_code,
    v_usage.max_crew
  );
```

**File:** `supabase/migrations/20260310080006_enforce_monthly_job_plan_limit.sql` (Line 49-51)
```sql
RAISE EXCEPTION 'JOB_LIMIT_REACHED' USING
  MESSAGE = format(
    'JOB_LIMIT_REACHED: %s plan allows up to %s jobs per month. Upgrade to Pro to create more jobs.',
    v_usage.plan_code,
    v_usage.max_jobs_per_month
  );
```

**Error Message Format:**
- Prefix: `CUSTOMER_LIMIT_REACHED:`, `CREW_LIMIT_REACHED:`, `JOB_LIMIT_REACHED:`
- Content: `"{plan_code} plan allows up to {limit} {resource}. Upgrade to Pro to {action}."`
- Example: `"CUSTOMER_LIMIT_REACHED: starter plan allows up to 100 customers. Upgrade to Pro to add more customers."`

**Finding:** ✅ **Consistent format** - All limit errors use a prefix pattern that can be parsed with `error.message?.includes('CUSTOMER_LIMIT_REACHED')` or similar.

---

## 5. Final Section: Recommended UX Pattern

### Current State Summary

1. **Error Handling:**
   - CrewAdmin: ✅ Uses `toast.error(error.message)`
   - CustomersAdmin: ❌ No error handling (silently ignored)
   - JobsAdmin: ❌ Errors thrown but not caught

2. **Available UI Components:**
   - ✅ `ConfirmModal` - Professional modal with actions
   - ✅ `useConfirm` hook - Promise-based modal API
   - ✅ `toast` - Simple notification (currently used)

3. **Billing Route:**
   - ✅ `/admin/billing` exists and is accessible

4. **Error Detection:**
   - ✅ Error messages have consistent prefixes: `CUSTOMER_LIMIT_REACHED`, `CREW_LIMIT_REACHED`, `JOB_LIMIT_REACHED`

---

### Recommended: Toast with Upgrade CTA Button

**Rationale:**
1. **Minimal change** - Reuses existing `toast` infrastructure already used in CrewAdmin
2. **Consistent with current patterns** - Other errors use toast
3. **Non-blocking** - User can dismiss and continue working
4. **Actionable** - Can include button to navigate to `/admin/billing`

**Implementation Pattern:**
```jsx
// Helper function (can be shared)
const handleLimitError = (error, navigate) => {
  if (error?.message?.includes('CUSTOMER_LIMIT_REACHED') || 
      error?.message?.includes('CREW_LIMIT_REACHED') || 
      error?.message?.includes('JOB_LIMIT_REACHED')) {
    
    toast.custom((t) => (
      <div className="bg-white border border-amber-200 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
        <span className="text-amber-800 flex-1">{error.message}</span>
        <Button
          variant="primary"
          onClick={() => {
            navigate('/admin/billing');
            toast.dismiss(t.id);
          }}
        >
          Upgrade
        </Button>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    ), {
      duration: 8000, // Longer duration for actionable toast
    });
    
    return true; // Error handled
  }
  return false; // Not a limit error
};

// Usage in create handlers:
const { error } = await supabase.from('customers').insert([...]);
if (error) {
  if (!handleLimitError(error, navigate)) {
    toast.error(error.message); // Fallback for other errors
  }
}
```

**Why Not Modal?**
- Modals are blocking and interrupt workflow more than toast
- Current codebase uses modals only for confirmations (delete actions)
- Toast is lighter weight and matches existing error patterns

**Why Not Inline Alert?**
- No existing inline alert component
- Would require creating new component
- Toast is already established pattern

---

### Alternative: Enhanced useConfirm Hook

If a more prominent upgrade prompt is desired, `useConfirm` could be adapted:

```jsx
const { showUpgradePrompt, UpgradeDialog } = useUpgradePrompt();

// In error handler:
if (error?.message?.includes('CUSTOMER_LIMIT_REACHED')) {
  await showUpgradePrompt({
    title: 'Customer Limit Reached',
    message: error.message,
    upgradeText: 'Upgrade to Pro',
    onUpgrade: () => navigate('/admin/billing')
  });
}
```

**Trade-off:** More prominent but requires new hook/component creation.

---

### Summary Recommendation

**Smallest Safe UX Pattern:** ✅ **Toast with Upgrade CTA Button**

**Implementation Steps:**
1. Create shared `handleLimitError()` helper function
2. Update CustomersAdmin to handle errors (currently missing)
3. Update JobsAdmin to catch and handle errors (currently missing)
4. Update CrewAdmin to use shared helper (already has error handling)
5. Use `toast.custom()` with Button component for upgrade CTA
6. Navigate to `/admin/billing` on button click

**Benefits:**
- Minimal code changes
- Reuses existing patterns
- Non-blocking UX
- Actionable upgrade path
- Consistent across all three pages
