# Role Entitlement Matrix
**Service Ops SaaS - Launch Hardening Phase A**

**Legend**:
- **Full**: Full access (read + write)
- **Limited**: Limited access (read-only or restricted mutations)
- **None**: No access
- **Support-only**: Platform admin in support mode only
- **⚠️**: Risk/ambiguity noted

---

## Route Access Matrix

| Route | Admin | Manager | Dispatcher | Crew | Customer | Platform Admin |
|-------|-------|---------|-----------|------|----------|----------------|
| `/admin` | Full | None | None | None | None | Support-only |
| `/admin/jobs` | Full | None | None | None | None | Support-only |
| `/admin/customers` | Full | None | None | None | None | Support-only |
| `/admin/crew` | Full | None | None | None | None | Support-only |
| `/admin/teams` | Full | None | None | None | None | Support-only |
| `/admin/payments` | Full | None | None | None | None | Support-only |
| `/admin/expenses` | Full | None | None | None | None | Support-only |
| `/admin/settings` | Full | None | None | None | None | Support-only ⚠️ |
| `/admin/billing` | Full | None | None | None | None | Support-only ⚠️ |
| `/admin/quotes` | Full | None | None | None | None | Support-only |
| `/admin/recurring-jobs` | Full | None | None | None | None | Support-only |
| `/admin/schedule` | Full | None | None | None | None | Support-only |
| `/admin/revenue-hub` | Full | Full | Full | None | None | Support-only |
| `/admin/route-planning` | Full | Full | Full | None | None | Support-only |
| `/admin/dispatch-center` | Full | Full | Full | None | None | Support-only |
| `/admin/scheduling-center` | Full | Full | Full | None | None | Support-only |
| `/admin/job-intelligence` | Full | Full | Full | None | None | Support-only |
| `/admin/financial-control-center` | Full | Full | Full | None | None | Support-only |
| `/crew` | Full ⚠️ | None | None | Full | None | None |
| `/crew/jobs` | Full ⚠️ | None | None | Full | None | None |
| `/crew/job/:id` | Full ⚠️ | None | None | Full | None | None |
| `/customer/*` | None | None | None | None | Full | None |
| `/platform` | None | None | None | None | None | Full |
| `/platform/companies` | None | None | None | None | None | Full |
| `/platform/company/:id` | None | None | None | None | None | Full |

**Notes**:
- ⚠️ Admin can access crew portal routes (may be intentional)
- ⚠️ Settings page has no internal role check beyond route
- ⚠️ Billing page accessible in support mode but Edge Functions reject support mode

---

## Navigation Visibility Matrix

| Nav Item | Admin | Manager | Dispatcher | Crew | Customer | Platform Admin |
|----------|-------|---------|-----------|------|----------|----------------|
| Dashboard | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Jobs | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Customers | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Quotes | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Revenue Hub | ✅ | ✅ | ✅ | ❌ | ❌ | Support-only |
| Crew | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Teams | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Payments | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Expenses | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Recurring Jobs | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Schedule | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Dispatch Center | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ | Support-only |
| Scheduling Center | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ | Support-only |
| Job Intelligence | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ | Support-only |
| Financial Control Center | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ | Support-only |
| Route Planning | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ | Support-only |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Billing | ✅ | ❌ | ❌ | ❌ | ❌ | Support-only |
| Worker Portal | ✅ | ❌ | ❌ | ✅ | ❌ | None |
| Customer Portal | ❌ | ❌ | ❌ | ❌ | ✅ | None |
| Platform Dashboard | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (not in support) |
| Companies | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (not in support) |

**Notes**:
- ⚠️ Manager/dispatcher can access these pages via routes but nav doesn't show them
- Platform admin in support mode sees full admin nav but mutations are disabled

---

## Page Action Matrix

| Page | Action | Admin | Manager | Dispatcher | Crew | Customer | Platform Admin (Support) |
|------|--------|-------|---------|-----------|------|----------|-------------------------|
| JobsAdmin | Create job | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| JobsAdmin | Update job | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| JobsAdmin | Delete job | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| CustomersAdmin | Create customer | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| CustomersAdmin | Update customer | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| CustomersAdmin | Delete customer | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| CustomersAdmin | Create job | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| BillingAdmin | Start checkout | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode + Edge Function) |
| BillingAdmin | Open portal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode + Edge Function) |
| BillingAdmin | Reconcile billing | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (support mode) |
| Settings | Update settings | ✅ ⚠️ | ❌ | ❌ | ❌ | ❌ | ⚠️ (no check) |
| RevenueHub | View revenue | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (support mode) |
| RevenueHub | Collections actions | ✅ ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| RoutePlanningAdmin | Generate route | ✅ | ✅ ⚠️ | ✅ ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| DispatchCenterAdmin | Assign team | ✅ | ✅ ⚠️ | ✅ ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| SchedulingCenterAdmin | Generate jobs | ✅ | ✅ ⚠️ | ✅ ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| SchedulingCenterAdmin | Generate routes | ✅ | ✅ ⚠️ | ✅ ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| JobIntelligenceAdmin | Assign team | ✅ | ✅ ⚠️ | ✅ ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| FinancialControlCenterAdmin | View financials | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (support mode) |
| PaymentsAdmin | Record payment | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| PaymentsAdmin | Void payment | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (support mode) |
| Crew Portal | Record payment | ✅ | ❌ | ❌ | ✅ | ❌ | None |
| Customer Portal | View jobs | ❌ | ❌ | ❌ | ❌ | ✅ | None |
| Customer Portal | View quotes | ❌ | ❌ | ❌ | ❌ | ✅ | None |
| Customer Portal | View invoices | ❌ | ❌ | ❌ | ❌ | ✅ | None |

**Notes**:
- ⚠️ Settings has no internal role check beyond route
- ⚠️ Manager/dispatcher actions need verification if intentional
- ⚠️ Support mode mutations disabled in UI but some pages don't check support mode

---

## Backend RPC/Edge Function Matrix

| Function | Admin | Manager | Dispatcher | Crew | Customer | Platform Admin (Support) |
|----------|-------|---------|-----------|------|----------|-------------------------|
| `generate_jobs_from_recurring` | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ (no check) |
| `record_payment` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `generate_team_route_for_day` | ✅ | ✅ ⚠️ | ✅ ⚠️ | ❌ | ❌ | ⚠️ (no check) |
| `create-billing-checkout-session` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (rejects support mode) |
| `create-billing-portal-session` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (rejects support mode) |
| `reconcile-billing` | ✅ (own company) | ❌ | ❌ | ❌ | ❌ | ✅ (support mode) |
| `log_product_event` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Notes**:
- ⚠️ Manager/dispatcher RPC access may not be exposed in UI
- ⚠️ Support mode checks missing in some RPCs
- ⚠️ `record_payment` allows crew but PaymentsAdmin page is admin-only

---

## Support Mode Behavior Matrix

| Feature | Platform Admin (Not in Support) | Platform Admin (In Support) |
|---------|--------------------------------|----------------------------|
| Access admin routes | ❌ | ✅ (via ProtectedRoute special case) |
| See admin navigation | ❌ | ✅ (full admin nav) |
| Mutate jobs | ❌ | ❌ (disabled in UI) |
| Mutate customers | ❌ | ❌ (disabled in UI) |
| Mutate payments | ❌ | ❌ (disabled in UI) |
| Start billing checkout | ❌ | ❌ (disabled in UI + Edge Function) |
| Open billing portal | ❌ | ❌ (disabled in UI + Edge Function) |
| Reconcile billing | ❌ | ✅ (Edge Function allows) |
| Update settings | ❌ | ⚠️ (no check, may work) |
| Generate jobs | ❌ | ⚠️ (no check, may work) |
| Generate routes | ❌ | ⚠️ (no check, may work) |
| Assign teams | ❌ | ⚠️ (no check, may work) |

**Notes**:
- ⚠️ Support mode mutations disabled in some pages but not all
- ⚠️ Billing actions fail in support mode (UI allows but Edge Functions reject)
- ⚠️ Some pages don't check support mode

---

## Risk Summary

### P0 - Launch Blockers
1. Support mode billing access mismatch
2. Manager/dispatcher navigation mismatch
3. Settings page no internal role check
4. Billing reconciliation authorization gap
5. Crew portal admin access ambiguity
6. Support mode visual indicator missing

### P1 - Serious Inconsistencies
7. Manager/dispatcher backend RPC access
8. Revenue Hub role action gating
9. Route Planning manager/dispatcher access
10. Dispatch Center manager/dispatcher access
11. Scheduling Center manager/dispatcher access
12. Job Intelligence manager/dispatcher access
13. Financial Control Center manager/dispatcher access
14. Payment recording role check alignment

### P2 - Polish
15. Navbar admin dropdown duplication
16. Deprecated routes cleanup
17. Root redirect logic improvement
18. Login redirect logic alignment
19. Support mode navigation indicator

---

**Matrix Generated**: 2024-03-19  
**Status**: Ready for Engineering Review
