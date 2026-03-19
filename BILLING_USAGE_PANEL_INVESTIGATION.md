# Billing Usage Panel Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Understand BillingAdmin.jsx structure to add a SaaS usage panel.

---

## 1. Current Structure of BillingAdmin.jsx

### Main Sections

**File:** `src/pages/admin/BillingAdmin.jsx`

**Structure (Lines 122-189):**
```jsx
return (
  <div className="space-y-6">
    <PageHeader
      title="Billing"
      subtitle="Current subscription state for your company workspace."
    />

    <Card>
      {/* Plan/Status Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-slate-600 mb-1">Current Plan</p>
          <p className="text-xl font-semibold text-slate-900 capitalize">{plan}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Subscription Status</p>
          <span className={`inline-block px-2 py-1 text-sm font-medium rounded ${statusTone}`}>
            {STATUS_LABELS[status] || status}
          </span>
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Trial Ends</p>
          <p className="text-slate-900">{formatDateTime(trialEndsAt)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Billing Grace Until</p>
          <p className="text-slate-900">{formatDateTime(billingGraceUntil)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-sm text-slate-600 mb-1">Last Billing Sync</p>
          <p className="text-slate-900">{formatDateTime(billingUpdatedAt)}</p>
        </div>
      </div>
    </Card>

    <Card>
      {/* Stripe Actions */}
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Stripe Actions</h2>
      ...
    </Card>
  </div>
);
```

### Plan/Status Display Location

**Lines 129-154:** First `Card` component contains:
- Current Plan (line 133)
- Subscription Status (lines 135-139)
- Trial Ends (lines 141-144)
- Billing Grace Until (lines 145-148)
- Last Billing Sync (lines 149-152)

**Layout:** Uses `grid grid-cols-1 md:grid-cols-2 gap-4` for responsive 2-column layout on medium+ screens.

### Best Insertion Point for "Usage & Limits" Panel

**Recommended:** Insert a new `Card` between the first Card (plan/status) and the Stripe Actions Card.

**Exact Location:** After line 154 (closing `</Card>` of plan/status), before line 156 (opening `<Card>` of Stripe Actions).

**Rationale:**
1. **Logical grouping** - Usage data is related to plan/status, so placing it immediately after makes sense
2. **Visual flow** - Plan info → Usage → Actions (natural reading order)
3. **Consistent spacing** - Uses existing `space-y-6` container, so new Card will have proper spacing
4. **No disruption** - Doesn't change existing card structure or behavior

**Alternative:** Could also place after Stripe Actions Card, but less logical grouping.

---

## 2. BillingAdmin Access to Required Data

### From UserContext

**File:** `src/pages/admin/BillingAdmin.jsx` (Line 19):
```jsx
const { profile } = useUser();
```

**File:** `src/context/UserContext.jsx` (Lines 218-230):
```jsx
const value = {
  session,
  profile,
  loading,
  role: profile?.role || null,
  companyId: profile?.company_id || null,  // ✅ Available
  fullName: profile?.full_name || null,
  subscriptionStatus: profile?.subscription_status || "inactive",  // ✅ Available
  plan: profile?.plan || "starter",  // ✅ Available
  trialEndsAt: profile?.trial_ends_at || null,
  billingGraceUntil: profile?.billing_grace_until || null,
  billingUpdatedAt: profile?.billing_updated_at || null,
};
```

**BillingAdmin Usage (Lines 24-28):**
```jsx
const status = profile?.subscription_status || "inactive";  // ✅ Uses subscription_status
const plan = profile?.plan || "starter";  // ✅ Uses plan
const trialEndsAt = profile?.trial_ends_at || null;
const billingGraceUntil = profile?.billing_grace_until || null;
const billingUpdatedAt = profile?.billing_updated_at || null;
```

### Access Summary

**✅ `company_id`:** Available via:
- `profile?.company_id` (direct from profile object)
- `companyId` (from useUser hook destructuring: `const { companyId } = useUser()`)

**✅ `plan`:** Available via:
- `profile?.plan` (direct from profile object)
- `plan` (already extracted on line 25)

**✅ `subscription_status`:** Available via:
- `profile?.subscription_status` (direct from profile object)
- `status` (already extracted on line 24)

**Conclusion:** BillingAdmin already has access to all required data via `useUser()` hook. No additional data fetching needed for basic plan/status info.

---

## 3. Existing Reusable UI Components

### Card Component

**File:** `src/components/ui/Card.jsx`
```jsx
export default function Card({ children, clickable = false, onClick }) {
  return (
    <div
      className={`
        bg-white border border-slate-200 rounded-xl shadow-sm p-6
        ${clickable ? "transition hover:shadow-md cursor-pointer" : ""}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
```

**Usage in BillingAdmin:** Already imported (line 6) and used for both existing cards.

**Finding:** Card component is simple and flexible - can contain any children. No built-in stat/usage display patterns.

### PageHeader Component

**File:** `src/components/ui/PageHeader.jsx`
```jsx
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

**Usage in BillingAdmin:** Already used (lines 124-127).

### Other Admin Pages Pattern

**File:** `src/pages/admin/AdminDashboard.jsx` (Lines 71-94):
- Uses `Card` component for KPI displays
- Uses simple grid layouts: `grid grid-cols-1 md:grid-cols-3 gap-4`
- Displays stats in format: label + value (similar to BillingAdmin's plan/status card)

**File:** `src/pages/admin/ReportsAdmin.jsx` (Lines 71-94):
- Uses `bg-white shadow rounded p-4` (similar styling to Card)
- Displays: `<h3>` label + `<p>` value with color coding

**Finding:** No dedicated usage/progress bar components exist. Admin pages use simple Card + grid layouts with label/value pairs.

---

## 4. Final Section

### A) Smallest Safe UI Change to Add a "Usage & Limits" Card

**Insertion Point:** After line 154 (after first Card closes), before line 156 (before Stripe Actions Card).

**Minimal Implementation:**
```jsx
{/* After line 154, before line 156 */}
<Card>
  <h2 className="text-lg font-semibold text-slate-900 mb-4">Usage & Limits</h2>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div>
      <p className="text-sm text-slate-600 mb-1">Crew Members</p>
      <p className="text-slate-900">
        {usage?.current_crew ?? '—'} / {usage?.max_crew ?? 'Unlimited'}
      </p>
    </div>
    <div>
      <p className="text-sm text-slate-600 mb-1">Customers</p>
      <p className="text-slate-900">
        {usage?.current_customers ?? '—'} / {usage?.max_customers ?? 'Unlimited'}
      </p>
    </div>
    <div>
      <p className="text-sm text-slate-600 mb-1">Jobs This Month</p>
      <p className="text-slate-900">
        {usage?.current_jobs_this_month ?? '—'} / {usage?.max_jobs_per_month ?? 'Unlimited'}
      </p>
    </div>
  </div>
</Card>
```

**Required Changes:**
1. Add state: `const [usage, setUsage] = useState(null);`
2. Add useEffect to fetch usage data (see section B)
3. Insert new Card component at recommended location
4. Follow existing grid pattern (matches plan/status card style)

**No changes needed to:**
- Existing Card components
- PageHeader
- Stripe Actions section
- UserContext usage

### B) Should BillingAdmin Call `public.get_company_plan_usage(company_id)` Directly?

**YES.** BillingAdmin should call the RPC directly from the page.

**Rationale:**
1. **Usage data is page-specific** - Not needed globally, so doesn't belong in UserContext
2. **Real-time accuracy** - Usage counts change frequently (new customers/crew/jobs), so fetching on page load ensures current data
3. **Single responsibility** - UserContext handles user/profile data; usage is billing/plan data
4. **Existing pattern** - Other admin pages (AdminDashboard, ReportsAdmin) fetch their own data via useEffect

**Implementation Pattern:**
```jsx
// Add state
const [usage, setUsage] = useState(null);
const [usageLoading, setUsageLoading] = useState(false);
const { companyId } = useUser();  // Get company_id

// Add useEffect
useEffect(() => {
  if (!companyId) return;
  
  const fetchUsage = async () => {
    setUsageLoading(true);
    const { data, error } = await supabase.rpc('get_company_plan_usage', {
      p_company_id: companyId
    });
    
    if (error) {
      console.error('Error fetching plan usage:', error);
      setUsage(null);
    } else {
      setUsage(data?.[0] || null);  // RPC returns table, get first row
    }
    setUsageLoading(false);
  };
  
  fetchUsage();
}, [companyId]);
```

**Note:** The RPC returns a TABLE (RETURNS TABLE), so the result will be an array. Use `data?.[0]` to get the single row.

**Error Handling:** Should handle gracefully - if RPC fails, show "—" or loading state, don't break the page.

---

## Summary

- **Structure:** BillingAdmin has PageHeader + 2 Cards (plan/status + Stripe actions)
- **Best Insertion:** New Card between plan/status Card and Stripe Actions Card
- **Data Access:** ✅ Has company_id, plan, subscription_status via useUser()
- **UI Components:** Card component available; no usage-specific components (use simple grid pattern)
- **RPC Call:** ✅ Should call `get_company_plan_usage(company_id)` directly from page via useEffect
- **Minimal Change:** Add state + useEffect + new Card component following existing grid pattern
