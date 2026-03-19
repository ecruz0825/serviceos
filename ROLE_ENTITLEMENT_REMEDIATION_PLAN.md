# Role Entitlement Remediation Plan
**Service Ops SaaS - Launch Hardening Phase A**

**Date**: 2024-03-19  
**Status**: Ready for Implementation  
**Audit Source**: ROLE_ENTITLEMENT_AUDIT.md

---

## Executive Summary

This remediation plan re-evaluates the role entitlement audit findings with stricter severity criteria focused on actual launch risk. The original audit identified 19 findings; after reclassification, we have:

- **2 P0** confirmed security/authorization risks (down from 6)
- **4 P1** confirmed entitlement inconsistencies or serious UX issues (down from 8)
- **13 P2** cleanup, polish, or likely-intentional behaviors needing documentation (up from 5)

**Key Insight**: Most original "P0" findings were UX/discoverability issues or likely-intentional behaviors, not security risks. The remediation plan focuses on confirmed risks and actionable inconsistencies.

---

## Corrected Severity Summary

### P0 - Confirmed Security/Authorization Risks: 2
1. Settings page no internal role check
2. Support mode mutation checks incomplete

### P1 - Confirmed Entitlement Inconsistencies: 4
3. Manager/dispatcher navigation mismatch
4. Billing reconciliation authorization verification needed
5. Support mode billing access UX mismatch
6. Manager/dispatcher backend RPC access alignment

### P2 - Cleanup/Polish/Documentation: 13
7. Crew portal admin access (likely intentional)
8. Platform admin support mode visual indicator
9. Manager/dispatcher operational page access (likely intentional, needs decision)
10. Revenue Hub role action gating (needs verification)
11. Route Planning manager/dispatcher access (needs decision)
12. Dispatch Center manager/dispatcher access (needs decision)
13. Scheduling Center manager/dispatcher access (needs decision)
14. Job Intelligence manager/dispatcher access (needs decision)
15. Financial Control Center manager/dispatcher access (needs decision)
16. Payment recording role check (RPC allows crew, page admin-only - likely intentional)
17. Navbar admin dropdown duplication
18. Deprecated routes cleanup
19. Root/login redirect logic improvement

---

## Top 5 Launch-Relevant Fixes

### 1. Settings Page Internal Role Check (P0)
**Why**: If route protection fails or is bypassed, settings page has no internal role check. This is a confirmed security risk.

**Fix**: Add role check at page level in `src/pages/admin/Settings.jsx`:
```javascript
const { role } = useUser();
if (role !== 'admin') {
  return <Navigate to="/admin" replace />;
}
```

**Files**: `src/pages/admin/Settings.jsx`

---

### 2. Support Mode Mutation Checks (P0)
**Why**: Some pages (Route Planning, Dispatch, Scheduling, Job Intelligence) don't check `supportMode` before allowing mutations. Platform admin in support mode could mutate data.

**Fix**: Add `supportMode` checks to mutation actions in:
- `src/pages/admin/RoutePlanningAdmin.jsx`
- `src/pages/admin/DispatchCenterAdmin.jsx`
- `src/pages/admin/SchedulingCenterAdmin.jsx`
- `src/pages/admin/JobIntelligenceAdmin.jsx`

**Files**: 4 admin page files

---

### 3. Manager/Dispatcher Navigation Mismatch (P1)
**Why**: Manager/dispatcher can access 6 operational pages via routes but navigation only shows Revenue Hub. This is a confirmed UX/discoverability issue.

**Fix**: Add manager/dispatcher nav items in `src/components/nav/navConfig.js` OR restrict routes to admin-only if manager/dispatcher shouldn't access these pages.

**Files**: `src/components/nav/navConfig.js`, `src/App.jsx` (if restricting routes)

**Decision Needed**: See ROLE_DECISION_POINTS.md

---

### 4. Billing Reconciliation Authorization Verification (P1)
**Why**: Need to verify UI `canReconcile` logic exactly matches Edge Function authorization to prevent authorization gaps.

**Fix**: Extract authorization logic to shared utility and use in both UI and Edge Function, OR add explicit test to verify exact match.

**Files**: `src/pages/admin/BillingAdmin.jsx`, `supabase/functions/reconcile-billing/index.ts`

---

### 5. Support Mode Billing Access UX Mismatch (P1)
**Why**: Platform admin in support mode can access BillingAdmin page (via ProtectedRoute), but Edge Functions reject support mode. User sees page but actions fail - confusing UX.

**Fix**: Block BillingAdmin route for support mode in `src/ProtectedRoute.jsx` OR allow read-only reconciliation in Edge Functions.

**Files**: `src/ProtectedRoute.jsx` OR `supabase/functions/create-billing-checkout-session/index.ts`, `supabase/functions/create-billing-portal-session/index.ts`

**Decision Needed**: See ROLE_DECISION_POINTS.md

---

## Remediation Batches

### Batch 1: Immediate Launch Fixes (P0)

**Goal**: Fix confirmed security/authorization risks before launch.

#### Fix 1.1: Settings Page Role Check
- **Severity**: P0 - Confirmed security risk
- **Type**: Confirmed authorization risk
- **Why**: If route protection fails, settings page has no internal protection
- **Fix**: Add role check at page level
- **Files**: `src/pages/admin/Settings.jsx`
- **Effort**: 5 minutes
- **Risk**: Low - simple check addition

#### Fix 1.2: Support Mode Mutation Checks
- **Severity**: P0 - Confirmed authorization risk
- **Type**: Confirmed security risk
- **Why**: Platform admin in support mode could mutate data on pages without support mode checks
- **Fix**: Add `supportMode` checks to mutation actions in 4 pages
- **Files**: 
  - `src/pages/admin/RoutePlanningAdmin.jsx`
  - `src/pages/admin/DispatchCenterAdmin.jsx`
  - `src/pages/admin/SchedulingCenterAdmin.jsx`
  - `src/pages/admin/JobIntelligenceAdmin.jsx`
- **Effort**: 30 minutes (4 files × ~7 minutes)
- **Risk**: Low - pattern already exists in other pages

**Batch 1 Total**: 2 fixes, ~35 minutes, low risk

---

### Batch 2: Entitlement Clarity Fixes (P1)

**Goal**: Fix confirmed entitlement inconsistencies and serious UX issues.

#### Fix 2.1: Manager/Dispatcher Navigation
- **Severity**: P1 - Confirmed entitlement inconsistency
- **Type**: Confirmed UX/discoverability issue
- **Why**: Users can access pages but can't discover them via navigation
- **Fix**: Add nav items OR restrict routes (requires product decision)
- **Files**: `src/components/nav/navConfig.js`, possibly `src/App.jsx`
- **Effort**: 15 minutes (if adding nav items)
- **Risk**: Low - navigation addition
- **Decision Needed**: Should manager/dispatcher access these pages? (See ROLE_DECISION_POINTS.md)

#### Fix 2.2: Billing Reconciliation Authorization Verification
- **Severity**: P1 - Confirmed entitlement inconsistency
- **Type**: Confirmed authorization gap risk
- **Why**: Need to verify UI and backend authorization logic match exactly
- **Fix**: Extract to shared utility OR add explicit test
- **Files**: `src/pages/admin/BillingAdmin.jsx`, `supabase/functions/reconcile-billing/index.ts`
- **Effort**: 20 minutes (extract utility) or 10 minutes (add test)
- **Risk**: Low - verification only

#### Fix 2.3: Support Mode Billing Access UX
- **Severity**: P1 - Confirmed UX issue
- **Type**: Confirmed entitlement inconsistency
- **Why**: User can access page but actions fail - confusing
- **Fix**: Block route OR allow read-only reconciliation (requires product decision)
- **Files**: `src/ProtectedRoute.jsx` OR billing Edge Functions
- **Effort**: 10 minutes (block route) or 30 minutes (allow reconciliation)
- **Risk**: Low - either fix is straightforward
- **Decision Needed**: Should support mode see billing page? (See ROLE_DECISION_POINTS.md)

#### Fix 2.4: Manager/Dispatcher Backend RPC Access Alignment
- **Severity**: P1 - Confirmed entitlement inconsistency
- **Type**: Confirmed backend/UI mismatch
- **Why**: RPCs allow manager/dispatcher but UI doesn't expose them
- **Fix**: Expose in UI OR restrict RPCs (requires product decision)
- **Files**: Various admin pages OR RPC migrations
- **Effort**: 1-2 hours (expose in UI) or 30 minutes (restrict RPCs)
- **Risk**: Medium - requires understanding of each RPC's purpose
- **Decision Needed**: Should manager/dispatcher use these RPCs? (See ROLE_DECISION_POINTS.md)

**Batch 2 Total**: 4 fixes, ~2-3 hours, low-medium risk (depends on decisions)

---

### Batch 3: Cleanup/Polish/Documentation (P2)

**Goal**: Document intentional behaviors, improve UX, clean up technical debt.

#### Fix 3.1: Document Crew Portal Admin Access
- **Severity**: P2 - Cleanup/documentation
- **Type**: Likely intentional behavior
- **Why**: Admin can access crew portal - probably intentional for testing/debugging
- **Fix**: Document in code comments or architecture docs
- **Files**: `src/App.jsx` (add comment), or architecture docs
- **Effort**: 5 minutes
- **Risk**: None

#### Fix 3.2: Support Mode Visual Indicator
- **Severity**: P2 - UX polish
- **Type**: UX/discoverability issue
- **Why**: Platform admin in support mode doesn't know they're in read-only mode
- **Fix**: Add banner/indicator in navigation or page header
- **Files**: `src/layouts/AppShell.jsx` or `src/components/nav/navConfig.js`
- **Effort**: 30 minutes
- **Risk**: Low

#### Fix 3.3-3.7: Document Manager/Dispatcher Operational Page Access
- **Severity**: P2 - Documentation/decision
- **Type**: Needs product decision
- **Why**: Routes allow manager/dispatcher access - likely intentional but needs confirmation
- **Fix**: Document decision in code comments or architecture docs
- **Files**: `src/App.jsx` (add comments), architecture docs
- **Effort**: 15 minutes (documentation)
- **Risk**: None
- **Decision Needed**: Should manager/dispatcher access these pages? (See ROLE_DECISION_POINTS.md)

#### Fix 3.8: Revenue Hub Role Action Gating
- **Severity**: P2 - Verification needed
- **Type**: Needs verification
- **Why**: Manager/dispatcher can access but page may have admin-only mutations
- **Fix**: Audit page and gate admin-only mutations
- **Files**: `src/pages/admin/RevenueHub.jsx`
- **Effort**: 1 hour (audit + gate)
- **Risk**: Low

#### Fix 3.9: Payment Recording Role Check Documentation
- **Severity**: P2 - Documentation
- **Type**: Likely intentional behavior
- **Why**: RPC allows crew but page is admin-only - probably intentional (crew records via portal)
- **Fix**: Document in code comments
- **Files**: `supabase/migrations/20260124190000_payments_ledger_overhaul.sql` (add comment)
- **Effort**: 5 minutes
- **Risk**: None

#### Fix 3.10: Navbar Admin Dropdown Cleanup
- **Severity**: P2 - UX polish
- **Type**: UX cleanup
- **Why**: Duplicate navigation (navbar dropdown + sidebar)
- **Fix**: Remove navbar dropdown if sidebar is primary navigation
- **Files**: `src/Navbar.jsx`
- **Effort**: 10 minutes
- **Risk**: Low

#### Fix 3.11: Deprecated Routes Cleanup
- **Severity**: P2 - Technical debt
- **Type**: Cleanup
- **Why**: Redirect routes exist for deprecated paths
- **Fix**: Keep redirects (backward compatibility) OR remove if no longer needed
- **Files**: `src/App.jsx`
- **Effort**: 5 minutes (document) or 10 minutes (remove)
- **Risk**: Low

#### Fix 3.12-3.13: Root/Login Redirect Logic
- **Severity**: P2 - UX polish
- **Type**: UX improvement
- **Why**: Manager/dispatcher redirect to Revenue Hub but can access other pages
- **Fix**: Improve redirect logic or show available pages
- **Files**: `src/components/RootRedirect.jsx`, `src/Login.jsx`
- **Effort**: 20 minutes
- **Risk**: Low

**Batch 3 Total**: 13 fixes, ~3-4 hours, low risk

---

## Detailed Findings with Corrected Severity

### P0 - Confirmed Security/Authorization Risks

#### Finding 1: Settings Page No Internal Role Check
- **ID**: F-001
- **Severity**: P0 (confirmed)
- **Type**: Confirmed authorization risk
- **Status**: Confirmed (code inspection)
- **Why It Matters**: If route protection fails or is bypassed, settings page has no internal protection. Settings mutations could be exposed.
- **Smallest Safe Fix**: Add role check at page level in `Settings.jsx`:
  ```javascript
  const { role } = useUser();
  if (role !== 'admin') {
    return <Navigate to="/admin" replace />;
  }
  ```
- **Files**: `src/pages/admin/Settings.jsx`
- **Effort**: 5 minutes
- **Risk**: Low

#### Finding 2: Support Mode Mutation Checks Incomplete
- **ID**: F-002
- **Severity**: P0 (confirmed)
- **Type**: Confirmed security risk
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Platform admin in support mode could mutate data on pages without support mode checks. This violates the read-only support mode intent.
- **Smallest Safe Fix**: Add `supportMode` checks to mutation actions in:
  - RoutePlanningAdmin (generate route)
  - DispatchCenterAdmin (assign team)
  - SchedulingCenterAdmin (generate jobs, generate routes)
  - JobIntelligenceAdmin (assign team)
- **Files**: 
  - `src/pages/admin/RoutePlanningAdmin.jsx`
  - `src/pages/admin/DispatchCenterAdmin.jsx`
  - `src/pages/admin/SchedulingCenterAdmin.jsx`
  - `src/pages/admin/JobIntelligenceAdmin.jsx`
- **Effort**: 30 minutes
- **Risk**: Low (pattern exists in other pages)

---

### P1 - Confirmed Entitlement Inconsistencies

#### Finding 3: Manager/Dispatcher Navigation Mismatch
- **ID**: F-003
- **Severity**: P1 (confirmed)
- **Type**: Confirmed UX/discoverability issue
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Manager/dispatcher can access 6 operational pages via routes but navigation only shows Revenue Hub. Users can't discover available features.
- **Smallest Safe Fix**: Add manager/dispatcher nav items in `navConfig.js` for accessible pages OR restrict routes to admin-only.
- **Files**: `src/components/nav/navConfig.js`, possibly `src/App.jsx`
- **Effort**: 15 minutes (if adding nav items)
- **Risk**: Low
- **Decision Needed**: Should manager/dispatcher access these pages? (See ROLE_DECISION_POINTS.md)

#### Finding 4: Billing Reconciliation Authorization Verification
- **ID**: F-004
- **Severity**: P1 (confirmed)
- **Type**: Confirmed authorization gap risk
- **Status**: Inferred (needs verification)
- **Why It Matters**: Need to verify UI `canReconcile` logic exactly matches Edge Function authorization to prevent authorization gaps.
- **Smallest Safe Fix**: Extract authorization logic to shared utility and use in both UI and Edge Function, OR add explicit test to verify exact match.
- **Files**: `src/pages/admin/BillingAdmin.jsx`, `supabase/functions/reconcile-billing/index.ts`
- **Effort**: 20 minutes (extract utility) or 10 minutes (add test)
- **Risk**: Low

#### Finding 5: Support Mode Billing Access UX Mismatch
- **ID**: F-005
- **Severity**: P1 (confirmed)
- **Type**: Confirmed UX issue
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Platform admin in support mode can access BillingAdmin page (via ProtectedRoute), but Edge Functions reject support mode. User sees page but actions fail - confusing UX.
- **Smallest Safe Fix**: Block BillingAdmin route for support mode in `ProtectedRoute.jsx` OR allow read-only reconciliation in Edge Functions.
- **Files**: `src/ProtectedRoute.jsx` OR billing Edge Functions
- **Effort**: 10 minutes (block route) or 30 minutes (allow reconciliation)
- **Risk**: Low
- **Decision Needed**: Should support mode see billing page? (See ROLE_DECISION_POINTS.md)

#### Finding 6: Manager/Dispatcher Backend RPC Access Alignment
- **ID**: F-006
- **Severity**: P1 (confirmed)
- **Type**: Confirmed backend/UI mismatch
- **Status**: Confirmed (code inspection)
- **Why It Matters**: RPCs allow manager/dispatcher but UI doesn't expose them. Backend allows access that UI doesn't provide.
- **Smallest Safe Fix**: Expose RPC calls in manager/dispatcher UI OR restrict RPCs to admin-only.
- **Files**: Various admin pages OR RPC migrations
- **Effort**: 1-2 hours (expose in UI) or 30 minutes (restrict RPCs)
- **Risk**: Medium (requires understanding of each RPC's purpose)
- **Decision Needed**: Should manager/dispatcher use these RPCs? (See ROLE_DECISION_POINTS.md)

---

### P2 - Cleanup/Polish/Documentation

#### Finding 7: Crew Portal Admin Access
- **ID**: F-007
- **Severity**: P2 (likely intentional)
- **Type**: Likely intentional behavior
- **Status**: Inferred (likely intentional)
- **Why It Matters**: Admin can access crew portal routes. Probably intentional for testing/debugging, but needs documentation.
- **Smallest Safe Fix**: Document in code comments or architecture docs.
- **Files**: `src/App.jsx` (add comment)
- **Effort**: 5 minutes
- **Risk**: None

#### Finding 8: Support Mode Visual Indicator
- **ID**: F-008
- **Severity**: P2 (UX polish)
- **Type**: UX/discoverability issue
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Platform admin in support mode doesn't know they're in read-only mode. Navigation doesn't indicate read-only state.
- **Smallest Safe Fix**: Add banner/indicator in navigation or page header when in support mode.
- **Files**: `src/layouts/AppShell.jsx` or navigation component
- **Effort**: 30 minutes
- **Risk**: Low

#### Finding 9-13: Manager/Dispatcher Operational Page Access
- **ID**: F-009 through F-013
- **Severity**: P2 (needs decision)
- **Type**: Needs product decision
- **Status**: Inferred (likely intentional)
- **Why It Matters**: Routes allow manager/dispatcher access to operational pages. Likely intentional but needs confirmation and documentation.
- **Smallest Safe Fix**: Document decision in code comments or architecture docs.
- **Files**: `src/App.jsx` (add comments)
- **Effort**: 15 minutes (documentation)
- **Risk**: None
- **Decision Needed**: Should manager/dispatcher access these pages? (See ROLE_DECISION_POINTS.md)

#### Finding 14: Revenue Hub Role Action Gating
- **ID**: F-014
- **Severity**: P2 (verification needed)
- **Type**: Needs verification
- **Status**: Inferred (needs audit)
- **Why It Matters**: Manager/dispatcher can access Revenue Hub, but page may have admin-only mutations that should be gated.
- **Smallest Safe Fix**: Audit RevenueHub page and gate admin-only mutations with role checks.
- **Files**: `src/pages/admin/RevenueHub.jsx`
- **Effort**: 1 hour (audit + gate)
- **Risk**: Low

#### Finding 15: Payment Recording Role Check
- **ID**: F-015
- **Severity**: P2 (likely intentional)
- **Type**: Likely intentional behavior
- **Status**: Inferred (likely intentional)
- **Why It Matters**: `record_payment` RPC allows crew, but PaymentsAdmin page is admin-only. Probably intentional (crew records via portal, admin manages via page).
- **Smallest Safe Fix**: Document in code comments.
- **Files**: RPC migration file (add comment)
- **Effort**: 5 minutes
- **Risk**: None

#### Finding 16: Navbar Admin Dropdown
- **ID**: F-016
- **Severity**: P2 (UX polish)
- **Type**: UX cleanup
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Duplicate navigation (navbar dropdown + sidebar). Minor UX confusion.
- **Smallest Safe Fix**: Remove navbar dropdown if sidebar is primary navigation.
- **Files**: `src/Navbar.jsx`
- **Effort**: 10 minutes
- **Risk**: Low

#### Finding 17: Deprecated Routes
- **ID**: F-017
- **Severity**: P2 (technical debt)
- **Type**: Cleanup
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Redirect routes exist for deprecated paths. Technical debt.
- **Smallest Safe Fix**: Keep redirects (backward compatibility) OR remove if no longer needed.
- **Files**: `src/App.jsx`
- **Effort**: 5 minutes (document) or 10 minutes (remove)
- **Risk**: Low

#### Finding 18-19: Root/Login Redirect Logic
- **ID**: F-018, F-019
- **Severity**: P2 (UX polish)
- **Type**: UX improvement
- **Status**: Confirmed (code inspection)
- **Why It Matters**: Manager/dispatcher redirect to Revenue Hub but can access other pages. Minor UX issue.
- **Smallest Safe Fix**: Improve redirect logic or show available pages.
- **Files**: `src/components/RootRedirect.jsx`, `src/Login.jsx`
- **Effort**: 20 minutes
- **Risk**: Low

---

## Implementation Sequence

### Pre-Launch (Must Fix)
1. **Batch 1**: Fix 1.1 (Settings role check) - 5 minutes
2. **Batch 1**: Fix 1.2 (Support mode mutation checks) - 30 minutes
**Total**: ~35 minutes, low risk

### Post-Launch Week 1 (Should Fix)
3. **Batch 2**: Fix 2.1 (Manager/dispatcher navigation) - 15 minutes (after decision)
4. **Batch 2**: Fix 2.2 (Billing reconciliation verification) - 20 minutes
5. **Batch 2**: Fix 2.3 (Support mode billing UX) - 10-30 minutes (after decision)
**Total**: ~1-2 hours, low-medium risk

### Post-Launch Week 2+ (Nice to Have)
6. **Batch 2**: Fix 2.4 (Manager/dispatcher RPC alignment) - 1-2 hours (after decision)
7. **Batch 3**: All cleanup/polish items - ~3-4 hours
**Total**: ~4-6 hours, low risk

---

## Risk Assessment

### Low Risk Fixes
- Settings role check (simple addition)
- Support mode mutation checks (pattern exists)
- Navigation additions (UI only)
- Documentation (no code changes)
- Visual indicators (UI only)

### Medium Risk Fixes
- Manager/dispatcher RPC alignment (requires understanding of each RPC)
- Revenue Hub role gating (requires audit of large page)

### High Risk Fixes
- None identified

---

## Success Criteria

### Batch 1 Success
- ✅ Settings page has internal role check
- ✅ All operational pages check support mode before mutations
- ✅ No security/authorization risks remain

### Batch 2 Success
- ✅ Manager/dispatcher navigation matches route access
- ✅ Billing reconciliation authorization verified
- ✅ Support mode billing access resolved
- ✅ Manager/dispatcher RPC access aligned with UI

### Batch 3 Success
- ✅ All intentional behaviors documented
- ✅ UX improvements implemented
- ✅ Technical debt cleaned up

---

**Plan Status**: Ready for Implementation  
**Next Step**: Review ROLE_DECISION_POINTS.md and make product decisions
