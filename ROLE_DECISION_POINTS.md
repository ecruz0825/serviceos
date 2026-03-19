# Role Entitlement Decision Points
**Service Ops SaaS - Launch Hardening Phase A**

**Date**: 2024-03-19  
**Audience**: Product Owner, Architect, Engineering Lead  
**Purpose**: Product decisions needed to complete role entitlement remediation

---

## Executive Summary

This document identifies **5 critical product decisions** needed to complete the role entitlement remediation plan. These decisions affect user experience, feature access, and support workflows.

**Decision Priority**:
1. **High**: Decisions affecting launch (manager/dispatcher access, support mode billing)
2. **Medium**: Decisions affecting post-launch week 1 (RPC access alignment)
3. **Low**: Decisions affecting polish/documentation (crew portal access)

---

## Decision 1: Manager/Dispatcher Operational Page Access

**Question**: Should manager and dispatcher roles have access to Route Planning, Dispatch Center, Scheduling Center, Job Intelligence, and Financial Control Center?

**Current State**:
- ✅ Routes allow manager/dispatcher access (`src/App.jsx:276-331`)
- ❌ Navigation only shows Revenue Hub (`src/components/nav/navConfig.js:114-120`)
- ⚠️ Pages have no role checks (full access if route allows)
- ⚠️ Backend RPCs allow manager/dispatcher (`generate_jobs_from_recurring`, route operations)

**Options**:

**Option A: Full Access (Current Route Behavior)**
- Add manager/dispatcher nav items for all 5 operational pages
- Keep routes as-is
- Document that manager/dispatcher have operational access
- **Pros**: Matches current route behavior, consistent with backend RPCs
- **Cons**: Manager/dispatcher have broad access (may be too permissive)

**Option B: Restricted Access (Admin Only)**
- Remove manager/dispatcher from route `allowedRoles`
- Restrict backend RPCs to admin-only
- Keep navigation as-is (Revenue Hub only)
- **Pros**: More restrictive, clearer role boundaries
- **Cons**: Inconsistent with current route behavior, requires route changes

**Option C: Selective Access**
- Manager/dispatcher access: Revenue Hub, Financial Control Center (read-only)
- Admin-only: Route Planning, Dispatch Center, Scheduling Center, Job Intelligence
- **Pros**: Balanced access, read-only financial visibility
- **Cons**: Requires route changes, more complex

**Recommendation**: **Option A** - Full access matches current route behavior and backend RPCs. If this is too permissive, choose Option C.

**Impact**: 
- **If Option A**: Add nav items (~15 minutes)
- **If Option B**: Restrict routes + RPCs (~1 hour)
- **If Option C**: Selective route changes (~30 minutes)

**Decision Needed By**: Before launch (affects Batch 2 Fix 2.1)

---

## Decision 2: Support Mode Billing Access

**Question**: Should platform_admin in support mode be able to see the Billing page at all, or only diagnostics?

**Current State**:
- ✅ Platform admin in support mode can access BillingAdmin page (via ProtectedRoute special case)
- ❌ Billing Edge Functions reject support mode (`create-billing-checkout-session`, `create-billing-portal-session`)
- ✅ Billing reconciliation Edge Function allows support mode (`reconcile-billing`)
- ⚠️ User sees billing page but checkout/portal actions fail

**Options**:

**Option A: No Billing Access in Support Mode**
- Block BillingAdmin route for support mode in ProtectedRoute
- Platform admin in support mode cannot see billing page
- **Pros**: Clear separation, no confusing UX
- **Cons**: Platform admin cannot view billing diagnostics in support mode

**Option B: Read-Only Billing Access**
- Allow BillingAdmin page in support mode
- Allow read-only reconciliation (already works)
- Block checkout/portal actions in UI (already blocked)
- Keep Edge Functions as-is (reject support mode)
- **Pros**: Platform admin can view billing state and reconcile
- **Cons**: User sees actions that fail (but UI already disables them)

**Option C: Full Billing Access in Support Mode**
- Allow BillingAdmin page in support mode
- Allow checkout/portal actions in Edge Functions for support mode
- **Pros**: Platform admin can fully manage billing in support mode
- **Cons**: Support mode becomes mutation-enabled for billing (inconsistent with other pages)

**Recommendation**: **Option B** - Read-only access allows diagnostics and reconciliation without enabling mutations. UI already disables actions, so UX is acceptable.

**Impact**:
- **If Option A**: Block route (~10 minutes)
- **If Option B**: No changes needed (current state is acceptable)
- **If Option C**: Modify Edge Functions (~30 minutes)

**Decision Needed By**: Before launch (affects Batch 2 Fix 2.3)

---

## Decision 3: Manager/Dispatcher Backend RPC Access

**Question**: Should manager and dispatcher roles be able to use backend RPCs that currently allow them, even if UI doesn't expose them?

**Current State**:
- ✅ `generate_jobs_from_recurring` RPC allows manager/dispatcher
- ✅ Route operations RPCs allow manager/dispatcher
- ❌ UI doesn't expose these RPCs to manager/dispatcher (pages are admin-only OR not accessible)

**Options**:

**Option A: Expose RPCs in UI**
- Add manager/dispatcher access to pages that call these RPCs
- Keep RPCs as-is (allow manager/dispatcher)
- **Pros**: Consistent backend/UI access
- **Cons**: Manager/dispatcher get more access (may be too permissive)

**Option B: Restrict RPCs to Admin Only**
- Remove manager/dispatcher from RPC role checks
- Keep UI as-is (admin-only)
- **Pros**: More restrictive, clearer boundaries
- **Cons**: Inconsistent with current RPC behavior

**Option C: Keep Current State (Document)**
- Keep RPCs allowing manager/dispatcher
- Keep UI admin-only
- Document that RPCs allow manager/dispatcher but UI doesn't expose them
- **Pros**: No code changes, backend flexibility
- **Cons**: Inconsistent backend/UI access

**Recommendation**: **Option A** - If manager/dispatcher should have operational access (Decision 1), expose RPCs in UI. If not, choose Option B.

**Impact**:
- **If Option A**: Expose in UI (~1-2 hours)
- **If Option B**: Restrict RPCs (~30 minutes)
- **If Option C**: Documentation only (~5 minutes)

**Decision Needed By**: Post-launch week 1 (affects Batch 2 Fix 2.4)

---

## Decision 4: Crew Portal Admin Access

**Question**: Should admin role retain access to crew portal routes (`/crew/*`)?

**Current State**:
- ✅ Admin can access crew portal routes (`src/App.jsx:469-507`)
- ✅ Crew can access crew portal routes
- ⚠️ No documentation explaining why admin has access

**Options**:

**Option A: Keep Admin Access (Document)**
- Keep routes as-is (admin + crew)
- Document that admin access is intentional (for testing/debugging)
- **Pros**: Admin can test crew experience, useful for support
- **Cons**: Role overlap, potential confusion

**Option B: Restrict to Crew Only**
- Remove admin from crew portal route `allowedRoles`
- Admin must use admin pages only
- **Pros**: Clearer role boundaries
- **Cons**: Admin cannot test crew experience

**Recommendation**: **Option A** - Keep admin access and document it. Useful for testing and support.

**Impact**:
- **If Option A**: Documentation only (~5 minutes)
- **If Option B**: Restrict routes (~10 minutes)

**Decision Needed By**: Post-launch week 2+ (affects Batch 3 Fix 3.1)

---

## Decision 5: Support Mode Read-Only Scope

**Question**: Should support mode be read-only everywhere except explicitly allowed diagnostic actions (like billing reconciliation)?

**Current State**:
- ✅ Support mode disables mutations in: JobsAdmin, CustomersAdmin, PaymentsAdmin, BillingAdmin
- ❌ Support mode doesn't disable mutations in: RoutePlanningAdmin, DispatchCenterAdmin, SchedulingCenterAdmin, JobIntelligenceAdmin
- ✅ Billing reconciliation allows support mode (diagnostic action)

**Options**:

**Option A: Strict Read-Only (Recommended)**
- Add support mode checks to all mutation actions
- Only allow diagnostic actions (reconciliation, viewing)
- **Pros**: Consistent read-only behavior, clear intent
- **Cons**: Requires adding checks to 4 more pages

**Option B: Selective Mutations**
- Allow specific mutations in support mode (e.g., route generation for testing)
- Document which mutations are allowed
- **Pros**: More flexible for support workflows
- **Cons**: Inconsistent behavior, harder to reason about

**Option C: Current State (Fix Incomplete)**
- Keep current state (some pages check, some don't)
- **Pros**: No changes needed
- **Cons**: Inconsistent, potential security risk

**Recommendation**: **Option A** - Strict read-only is safer and more consistent. Support mode should be diagnostic-only.

**Impact**:
- **If Option A**: Add support mode checks (~30 minutes) - **Already in Batch 1**
- **If Option B**: Selective checks (~1 hour)
- **If Option C**: No changes (not recommended)

**Decision Needed By**: Before launch (affects Batch 1 Fix 1.2)

---

## Decision Summary Table

| Decision | Priority | Options | Recommendation | Impact | Needed By |
|----------|----------|---------|----------------|--------|-----------|
| Manager/Dispatcher Operational Access | High | A: Full, B: Restricted, C: Selective | Option A | 15 min - 1 hour | Before launch |
| Support Mode Billing Access | High | A: None, B: Read-only, C: Full | Option B | 0-30 min | Before launch |
| Manager/Dispatcher RPC Access | Medium | A: Expose UI, B: Restrict RPCs, C: Document | Option A (if Decision 1 = A) | 5 min - 2 hours | Week 1 |
| Crew Portal Admin Access | Low | A: Keep, B: Restrict | Option A | 5-10 min | Week 2+ |
| Support Mode Read-Only Scope | High | A: Strict, B: Selective, C: Current | Option A | 30 min | Before launch |

---

## Recommended Decision Flow

### Before Launch
1. **Decision 5**: Support Mode Read-Only Scope → **Option A** (strict read-only)
2. **Decision 1**: Manager/Dispatcher Operational Access → **Option A** (full access) OR **Option C** (selective)
3. **Decision 2**: Support Mode Billing Access → **Option B** (read-only)

### Post-Launch Week 1
4. **Decision 3**: Manager/Dispatcher RPC Access → **Option A** (if Decision 1 = A) OR **Option B** (if Decision 1 = B/C)

### Post-Launch Week 2+
5. **Decision 4**: Crew Portal Admin Access → **Option A** (keep and document)

---

## Questions for Product Owner

1. **What is the intended role of manager/dispatcher?**
   - Operational oversight only (Revenue Hub)?
   - Full operational access (all operational pages)?
   - Selective access (some pages, read-only others)?

2. **What should platform admin be able to do in support mode?**
   - View-only diagnostics?
   - Read-only reconciliation?
   - Full mutation access (not recommended)?

3. **Should support mode be strictly read-only?**
   - Yes (recommended) - diagnostic only
   - No - allow specific mutations for support workflows

---

**Status**: Awaiting Product Decisions  
**Next Step**: Review decisions and update remediation plan accordingly
