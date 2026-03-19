# Precise Billing Gate Behavior Audit

## 1. Routes Reachable When Subscription is Inactive

### Analysis of OnboardingGuard.jsx Logic Flow

**Key Logic Points:**
- Line 30-34: Non-admin paths bypass all checks → return children
- Line 38: `isInternalRole = ["admin", "manager", "dispatcher"]`
- Line 74-77: **Critical bypass** - Non-admin users return children immediately, skipping billing check
- Line 99-152: Billing enforcement **only reached for admin users**

### Routes by Role (subscription_status = "inactive")

#### profile.role = "admin" (subscription inactive)

**Reachable Routes:**
- `/admin/billing` - In `billingAllowedRoutes` (line 112)
- `/admin/settings` - In `billingAllowedRoutes` (line 113)
- `/admin/onboarding` - In `billingAllowedRoutes` (line 114)
- `/bootstrap/company` - In `billingAllowedRoutes` (line 115)

**Blocked Routes:**
- `/admin` - Shows "Billing Access Required" (line 121-151)
- `/admin/jobs` - Shows "Billing Access Required"
- `/admin/revenue-hub` - Shows "Billing Access Required"
- All other `/admin/*` routes - Shows "Billing Access Required"

**Why:** OnboardingGuard line 74 sets `isAdminUser = true`, so billing check executes (line 99-152). Only routes in `billingAllowedRoutes` array are allowed when `hasActiveBilling = false`.

#### profile.role = "manager" (subscription inactive)

**Reachable Routes:**
- `/admin/revenue-hub` - **Bypasses billing check** (OnboardingGuard line 75-76)
- All non-admin routes (crew, customer, public) - Bypass OnboardingGuard entirely (line 30-34)

**Blocked Routes:**
- `/admin` - ProtectedRoute rejects (allowedRoles: `['admin']` only)
- `/admin/jobs` - ProtectedRoute rejects
- `/admin/billing` - ProtectedRoute rejects
- `/admin/settings` - ProtectedRoute rejects
- All other `/admin/*` routes except `/admin/revenue-hub` - ProtectedRoute rejects

**Why:** OnboardingGuard line 74 sets `isAdminUser = false`, so line 75-76 returns children immediately, **bypassing billing check**. However, ProtectedRoute in App.jsx restricts most admin routes to `allowedRoles={['admin']}`. Only `/admin/revenue-hub` allows `['admin', 'manager', 'dispatcher']` (App.jsx line 262).

#### profile.role = "dispatcher" (subscription inactive)

**Reachable Routes:**
- `/admin/revenue-hub` - **Bypasses billing check** (OnboardingGuard line 75-76)
- All non-admin routes (crew, customer, public) - Bypass OnboardingGuard entirely (line 30-34)

**Blocked Routes:**
- `/admin` - ProtectedRoute rejects (allowedRoles: `['admin']` only)
- `/admin/jobs` - ProtectedRoute rejects
- `/admin/billing` - ProtectedRoute rejects
- `/admin/settings` - ProtectedRoute rejects
- All other `/admin/*` routes except `/admin/revenue-hub` - ProtectedRoute rejects

**Why:** Same as manager - OnboardingGuard bypasses billing check, but ProtectedRoute restricts access.

#### profile.role = "crew" (subscription inactive)

**Reachable Routes:**
- `/crew` - OnboardingGuard bypass (line 30-34), ProtectedRoute allows `['crew', 'admin']`
- `/crew/jobs` - OnboardingGuard bypass, ProtectedRoute allows
- `/crew/job/:id` - OnboardingGuard bypass, ProtectedRoute allows
- `/crew/help` - OnboardingGuard bypass, ProtectedRoute allows
- All public routes - No protection

**Blocked Routes:**
- All `/admin/*` routes - ProtectedRoute rejects (not in allowedRoles)
- All `/customer/*` routes - ProtectedRoute rejects (not in allowedRoles)

**Why:** OnboardingGuard line 30-34 returns children for non-admin paths, so billing check never executes. ProtectedRoute only checks role, not billing.

#### profile.role = "customer" (subscription inactive)

**Reachable Routes:**
- `/customer` - OnboardingGuard bypass (line 30-34), ProtectedRoute allows `['customer']`
- `/customer/dashboard` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/jobs` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/jobs/:id` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/quotes` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/quotes/:id` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/invoices` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/invoices/:id` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/schedule` - OnboardingGuard bypass, ProtectedRoute allows
- `/customer/profile` - OnboardingGuard bypass, ProtectedRoute allows
- All public routes - No protection

**Blocked Routes:**
- All `/admin/*` routes - ProtectedRoute rejects (not in allowedRoles)
- All `/crew/*` routes - ProtectedRoute rejects (not in allowedRoles)

**Why:** Same as crew - OnboardingGuard bypasses billing check for non-admin paths.

---

## 2. Does OnboardingGuard Apply Billing Gating to manager/dispatcher on /admin/revenue-hub?

**Answer: NO**

**Evidence:**
- `src/components/OnboardingGuard.jsx` line 74: `const isAdminUser = profile.role === "admin";`
- Line 75-76: `if (!isAdminUser) { return children; }`
- Line 99-152: Billing enforcement code is **only reached if `isAdminUser === true`**

**Flow for manager/dispatcher on `/admin/revenue-hub`:**
1. Line 31: `isAdminRoute = true` (path starts with `/admin`)
2. Line 38: `isInternalRole = true` (manager/dispatcher in array)
3. Line 39-49: Check company_id (passes if company_id exists)
4. Line 54-69: Check onboarding (passes if onboarding complete)
5. Line 74: `isAdminUser = false` (role is manager/dispatcher, not admin)
6. Line 75-76: **Returns children immediately, bypassing billing check**
7. Line 99-152: **Never reached** for manager/dispatcher

**Conclusion:** Manager and dispatcher roles **bypass billing enforcement entirely** when accessing `/admin/revenue-hub` or any admin route they're allowed to access.

---

## 3. Route Mismatches and Loopholes

### Route: `/` (root)

**App.jsx line 289-295:**
```jsx
<Route
  path="/"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <CustomerDashboard />
    </ProtectedRoute>
  }
/>
```

**OnboardingGuard behavior:**
- Line 31: `isAdminRoute = false` (doesn't start with `/admin`)
- Line 32-33: Returns children immediately (bypasses billing check)

**Issue:** Route requires admin role but renders `CustomerDashboard` component. If admin with inactive billing accesses `/`, they bypass billing check because path doesn't start with `/admin`.

**Loophole:** Admin can access root route even with inactive billing (though component is wrong).

### Route: `/admin`

**App.jsx line 419-427:**
```jsx
<Route
  path="/admin"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminShell title="Admin Dashboard">
        <AdminDashboard />
      </AdminShell>
    </ProtectedRoute>
  }
/>
```

**OnboardingGuard behavior:**
- Line 31: `isAdminRoute = true`
- Line 74: `isAdminUser = true`
- Line 99-152: Billing check executes
- Line 121: Blocks if billing inactive (not in `billingAllowedRoutes`)

**Status:** ✅ Correctly gated

### Route: `/admin/revenue-hub`

**App.jsx line 259-267:**
```jsx
<Route
  path="/admin/revenue-hub"
  element={
    <ProtectedRoute allowedRoles={['admin', 'manager', 'dispatcher']}>
      <AdminShell title="Revenue Hub">
        <RevenueHub />
      </AdminShell>
    </ProtectedRoute>
  }
/>
```

**OnboardingGuard behavior for manager/dispatcher:**
- Line 31: `isAdminRoute = true`
- Line 74: `isAdminUser = false`
- Line 75-76: Returns children (bypasses billing check)

**Issue:** Manager/dispatcher can access `/admin/revenue-hub` even with inactive billing.

**Loophole:** Billing enforcement not applied to manager/dispatcher roles.

### Route: `/admin/billing`

**App.jsx line 159-167:**
```jsx
<Route
  path="/admin/billing"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminShell title="Billing">
        <BillingAdmin />
      </AdminShell>
    </ProtectedRoute>
  }
/>
```

**OnboardingGuard behavior:**
- Line 31: `isAdminRoute = true`
- Line 74: `isAdminUser = true`
- Line 111-119: Route in `billingAllowedRoutes` array
- Line 121: Allows access even if billing inactive

**Status:** ✅ Correctly gated (allowed when billing inactive)

### Route: `/admin/settings`

**App.jsx line 149-157:**
```jsx
<Route
  path="/admin/settings"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminShell title="Settings">
        <Settings />
      </AdminShell>
    </ProtectedRoute>
  }
/>
```

**OnboardingGuard behavior:**
- Line 31: `isAdminRoute = true`
- Line 74: `isAdminUser = true`
- Line 111-119: Route in `billingAllowedRoutes` array
- Line 121: Allows access even if billing inactive

**Status:** ✅ Correctly gated (allowed when billing inactive)

### Route: `/admin/onboarding`

**App.jsx line 270-276:**
```jsx
<Route
  path="/admin/onboarding"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <OnboardingWizard />
    </ProtectedRoute>
  }
/>
```

**OnboardingGuard behavior:**
- Line 31: `isAdminRoute = true`
- Line 74: `isAdminUser = true`
- Line 91-92: Explicit check allows `/admin/onboarding` if onboarding incomplete
- Line 111-119: Route also in `billingAllowedRoutes` array
- Line 121: Allows access even if billing inactive

**Status:** ✅ Correctly gated (allowed when billing inactive)

### Route: `/bootstrap/company`

**App.jsx line 279:**
```jsx
<Route path="/bootstrap/company" element={<CompanyBootstrap />} />
```

**OnboardingGuard behavior:**
- Line 31: `isAdminRoute = false` (doesn't start with `/admin`)
- Line 32-33: Returns children immediately
- Line 111-119: Route in `billingAllowedRoutes` array (but never checked because path doesn't start with `/admin`)

**Status:** ✅ Correctly accessible (no protection needed, public route)

---

## 4. Route Outcome Matrix

| Route | Role | Billing Inactive Result | Why |
|-------|------|------------------------|-----|
| `/` | admin | ✅ Access granted | Path doesn't start with `/admin`, OnboardingGuard bypasses (line 30-34) |
| `/` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin` | admin | ❌ Blocked (billing message) | OnboardingGuard line 121 blocks (not in billingAllowedRoutes) |
| `/admin` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/revenue-hub` | admin | ❌ Blocked (billing message) | OnboardingGuard line 121 blocks (not in billingAllowedRoutes) |
| `/admin/revenue-hub` | manager | ✅ Access granted | OnboardingGuard line 75-76 bypasses billing check |
| `/admin/revenue-hub` | dispatcher | ✅ Access granted | OnboardingGuard line 75-76 bypasses billing check |
| `/admin/revenue-hub` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin', 'manager', 'dispatcher']`) |
| `/admin/revenue-hub` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin', 'manager', 'dispatcher']`) |
| `/admin/billing` | admin | ✅ Access granted | Route in billingAllowedRoutes (line 112) |
| `/admin/billing` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/billing` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/billing` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/billing` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/settings` | admin | ✅ Access granted | Route in billingAllowedRoutes (line 113) |
| `/admin/settings` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/settings` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/settings` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/settings` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/onboarding` | admin | ✅ Access granted | Route in billingAllowedRoutes (line 114) |
| `/admin/onboarding` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/onboarding` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/onboarding` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/admin/onboarding` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['admin']`) |
| `/bootstrap/company` | admin | ✅ Access granted | Public route, no protection |
| `/bootstrap/company` | manager | ✅ Access granted | Public route, no protection |
| `/bootstrap/company` | dispatcher | ✅ Access granted | Public route, no protection |
| `/bootstrap/company` | crew | ✅ Access granted | Public route, no protection |
| `/bootstrap/company` | customer | ✅ Access granted | Public route, no protection |
| `/crew/*` | admin | ✅ Access granted | OnboardingGuard bypass (line 30-34) |
| `/crew/*` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['crew', 'admin']`) |
| `/crew/*` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['crew', 'admin']`) |
| `/crew/*` | crew | ✅ Access granted | OnboardingGuard bypass (line 30-34) |
| `/crew/*` | customer | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['crew', 'admin']`) |
| `/customer/*` | admin | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['customer']`) |
| `/customer/*` | manager | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['customer']`) |
| `/customer/*` | dispatcher | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['customer']`) |
| `/customer/*` | crew | ❌ Access denied | ProtectedRoute rejects (allowedRoles: `['customer']`) |
| `/customer/*` | customer | ✅ Access granted | OnboardingGuard bypass (line 30-34) |

---

## 5. Final Section

### KEEP: Parts of Current Guard Logic That Are Correct

1. **Non-admin path bypass (line 30-34):** Correctly allows crew/customer routes without billing checks
2. **Admin billing check structure (line 99-152):** Correctly checks subscription status and grace period
3. **Billing allowed routes array (line 111-116):** Correctly allows critical routes even when billing inactive
4. **Onboarding checks (line 52-97):** Correctly enforces onboarding completion for admin users
5. **Company bootstrap redirect (line 80-82):** Correctly redirects admin without company_id

### FIX: Exact Logic Gaps

#### Gap 1: Manager/Dispatcher Bypass Billing Check

**Location:** `src/components/OnboardingGuard.jsx` line 74-77

**Current Code:**
```javascript
const isAdminUser = profile.role === "admin";
if (!isAdminUser) {
  return children;
}
```

**Problem:** Manager and dispatcher roles bypass billing enforcement entirely when accessing `/admin/revenue-hub`.

**Impact:** Manager/dispatcher can access revenue hub even when company subscription is inactive, canceled, or unpaid.

**Fix Required:** Apply billing check to all internal roles (admin, manager, dispatcher) before returning children.

#### Gap 2: Root Route Bypass

**Location:** `src/components/OnboardingGuard.jsx` line 30-34

**Current Code:**
```javascript
const isAdminRoute = location.pathname.startsWith("/admin");
if (!isAdminRoute) {
  return children;
}
```

**Problem:** Root route `/` requires admin role (App.jsx line 292) but doesn't start with `/admin`, so billing check is bypassed.

**Impact:** Admin can access root route even with inactive billing (though component is wrong).

**Fix Required:** Either:
- Change root route to `/admin` redirect, OR
- Add explicit check for root route in OnboardingGuard

#### Gap 3: Inconsistent Billing Enforcement

**Location:** `src/components/OnboardingGuard.jsx` line 99-152

**Problem:** Billing enforcement comment says "admin-only" (line 99) but `/admin/revenue-hub` allows manager/dispatcher access. These roles should also be subject to billing checks.

**Impact:** Inconsistent security model - some admin routes gated, others not.

### MINIMAL CHANGE: Smallest Safe Change Needed

**File:** `src/components/OnboardingGuard.jsx`

**Change at line 74-77:**

**Before:**
```javascript
// Only apply onboarding/bootstrap redirects for admin-role users.
// Non-admin users keep existing role-based protection in ProtectedRoute.
const isAdminUser = profile.role === "admin";
if (!isAdminUser) {
  return children;
}
```

**After:**
```javascript
// Only apply onboarding/bootstrap redirects for admin-role users.
// Non-admin users keep existing role-based protection in ProtectedRoute.
const isAdminUser = profile.role === "admin";
// Apply billing checks to all internal roles (admin, manager, dispatcher)
if (!isInternalRole) {
  return children;
}
```

**Then move billing check before the admin-only onboarding checks:**

**Current structure (line 79-97):**
```javascript
// Admin profile without company must bootstrap first
if (!profile.company_id) {
  return <Navigate to="/bootstrap/company" replace />;
}
// ... onboarding checks ...
```

**New structure:**
```javascript
// For non-admin internal roles, skip onboarding checks but apply billing
if (!isAdminUser) {
  // Manager/dispatcher: apply billing check here
  const billingStatus = profile.subscription_status || "inactive";
  const graceUntilRaw = profile.billing_grace_until || null;
  const graceUntilDate = graceUntilRaw ? new Date(graceUntilRaw) : null;
  const hasValidGrace =
    graceUntilDate && !Number.isNaN(graceUntilDate.getTime())
      ? graceUntilDate.getTime() > Date.now()
      : false;
  const hasActiveBilling =
    billingStatus === "trialing" || billingStatus === "active" || hasValidGrace;

  const billingAllowedRoutes = [
    "/admin/billing",
    "/admin/settings",
    "/admin/onboarding",
    "/bootstrap/company",
  ];
  const isBillingAllowedRoute = billingAllowedRoutes.some((route) =>
    location.pathname === route || location.pathname.startsWith(`${route}/`)
  );

  if (!hasActiveBilling && !isBillingAllowedRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-lg w-full bg-white rounded-lg shadow border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Billing Access Required</h1>
          <p className="text-sm text-slate-600 mb-3">
            Admin tools are temporarily limited because billing is not active for this workspace.
          </p>
          <p className="text-sm text-slate-700 mb-4">
            Current billing status:{" "}
            <span className="font-medium">
              {BILLING_STATUS_LABELS[billingStatus] || billingStatus}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/billing"
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
            >
              Open Billing
            </Link>
            <Link
              to="/admin/settings"
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return children;
}

// Admin profile without company must bootstrap first
if (!profile.company_id) {
  return <Navigate to="/bootstrap/company" replace />;
}
// ... rest of admin-only onboarding checks ...
```

**Alternative Minimal Fix (if billing should only apply to admin):**

If the intent is that manager/dispatcher should NOT be billing-gated, then the current behavior is correct, but the comment at line 99 is misleading. Update comment to clarify:

```javascript
// Billing enforcement (admin-only):
// Manager and dispatcher roles bypass billing checks and rely on ProtectedRoute role restrictions only.
// allow app access when status is trialing/active OR grace window is still valid.
```

**Recommendation:** Apply billing check to all internal roles (admin, manager, dispatcher) for consistency and security.
