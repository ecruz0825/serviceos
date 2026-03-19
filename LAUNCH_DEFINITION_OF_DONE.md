# Launch Definition of Done

**Service Operations SaaS - Launch Readiness Criteria**

---

## Launch Pass/Fail Criteria

### Billing
- ✅ **PASS**: Stripe checkout creates subscriptions successfully
- ✅ **PASS**: Webhook events update subscription status correctly
- ✅ **PASS**: Plan limits enforce correctly (crew, customers, jobs/month)
- ✅ **PASS**: Usage tracking displays accurate counts
- ✅ **PASS**: Billing portal accessible for active subscriptions
- ❌ **FAIL**: Any subscription status desync between Stripe and database
- ❌ **FAIL**: Plan limits not enforced at database level
- ❌ **FAIL**: Usage counts incorrect or missing

### Routing
- ✅ **PASS**: Route generation creates routes for teams with assigned jobs
- ✅ **PASS**: Route stops link correctly to jobs
- ✅ **PASS**: Stop order optimization works
- ✅ **PASS**: Crew can view routes in Crew Portal
- ✅ **PASS**: Google Maps integration displays route correctly
- ❌ **FAIL**: Routes generated for wrong teams or dates
- ❌ **FAIL**: Missing jobs in routes
- ❌ **FAIL**: Route stops not accessible to crew

### Portals
- ✅ **PASS**: Admin portal accessible with all pages functional
- ✅ **PASS**: Crew portal displays today's routes and jobs
- ✅ **PASS**: Customer portal shows jobs, quotes, invoices
- ✅ **PASS**: Platform admin portal shows company metrics
- ✅ **PASS**: Public quote/schedule pages work without auth
- ❌ **FAIL**: Any portal inaccessible or broken
- ❌ **FAIL**: Cross-tenant data visible (multi-tenant leak)
- ❌ **FAIL**: Role-based access not enforced

### Security
- ✅ **PASS**: All tables have RLS enabled
- ✅ **PASS**: All RPCs enforce company_id scoping
- ✅ **PASS**: No cross-tenant data access possible
- ✅ **PASS**: Support mode works without data leaks
- ✅ **PASS**: Authentication required for all protected routes
- ❌ **FAIL**: Any RLS policy missing or incorrect
- ❌ **FAIL**: Any RPC allows cross-tenant access
- ❌ **FAIL**: Unauthenticated access to protected data

### Observability
- ✅ **PASS**: Product events table exists and receives events
- ✅ **PASS**: Sentry error tracking operational
- ✅ **PASS**: Critical events logged (job_created, route_generated, invoice_paid, limit_hit, checkout_started, checkout_completed)
- ✅ **PASS**: Event logging does not block user workflows
- ❌ **FAIL**: No event logging infrastructure
- ❌ **FAIL**: Event logging causes errors or blocks UX
- ❌ **FAIL**: No error tracking for production issues

---

## Scope Freeze Rules

### Effective Immediately
**No new scope unless:**
- P0 bug (system down, data loss, security breach)
- Launch-critical blocker (prevents launch)

### What is NOT Allowed
- ❌ New features
- ❌ UI/UX improvements (unless blocking launch)
- ❌ Performance optimizations (unless blocking launch)
- ❌ Refactoring (unless fixing P0 bug)
- ❌ New pages or major functionality

### What IS Allowed
- ✅ P0 bug fixes
- ✅ Launch-critical blockers
- ✅ Documentation updates
- ✅ Configuration changes
- ✅ Emergency security patches

### Approval Process
1. Identify issue severity (P0/P1/P2)
2. If P0 or launch-critical: proceed with fix
3. If P1/P2: document and defer to post-launch
4. All changes require PR with launch checklist

---

## Severity Definitions

### P0 - Critical (Fix Immediately)
- System completely down
- Data loss or corruption
- Security breach or data leak
- Billing system failure
- Multi-tenant data leak
- **Action**: Fix immediately, deploy hotfix if needed

### P1 - High (Fix Before Launch)
- Major feature broken
- Significant data inconsistency
- Performance degradation affecting users
- Critical workflow blocked
- **Action**: Fix before launch, document workaround if needed

### P2 - Medium (Post-Launch)
- Minor feature issues
- UI/UX improvements
- Non-critical bugs
- Performance optimizations
- **Action**: Document and schedule for post-launch

---

## Release Gate Checklist

### Pre-Deployment
- [ ] All P0 and P1 issues resolved
- [ ] Security audit completed
- [ ] Multi-tenant isolation verified
- [ ] Billing system tested end-to-end
- [ ] Critical workflows tested (quote → job → route → payment)
- [ ] Rollback plan documented
- [ ] Database migrations reviewed
- [ ] Environment variables configured

### Deployment
- [ ] Database migrations applied successfully
- [ ] Application deployed to production
- [ ] Health checks passing
- [ ] Error tracking operational
- [ ] Event logging operational

### Post-Deployment
- [ ] Monitor error rates (Sentry)
- [ ] Monitor product events
- [ ] Verify billing webhooks processing
- [ ] Check multi-tenant isolation
- [ ] Verify critical workflows
- [ ] Monitor performance metrics

### Rollback Triggers
- [ ] Error rate > 5% of requests
- [ ] Billing system failures
- [ ] Multi-tenant data leaks detected
- [ ] Critical workflow broken
- [ ] Database migration failures

---

## Rollback Readiness Checklist

### Database Rollback
- [ ] All migrations are reversible OR
- [ ] Rollback migrations prepared for critical changes
- [ ] Data backup procedures documented
- [ ] Rollback tested in staging

### Application Rollback
- [ ] Previous version tagged in git
- [ ] Deployment process documented
- [ ] Rollback procedure tested
- [ ] Environment configuration backed up

### Billing Rollback
- [ ] Stripe webhook endpoint can handle old schema
- [ ] Subscription status can be manually corrected
- [ ] Plan limits can be manually adjusted if needed

### Communication Plan
- [ ] Rollback notification process defined
- [ ] Stakeholder contact list ready
- [ ] Status page or communication channel ready

---

## Owner Placeholders

### ChatGPT Architect
- **Responsibilities**: Architecture decisions, technical design review, risk assessment
- **Contact**: [TBD]

### Cursor Execution
- **Responsibilities**: Code implementation, PR reviews, deployment execution
- **Contact**: [TBD]

### Product Owner
- **Responsibilities**: Feature prioritization, launch approval, scope decisions
- **Contact**: [TBD]

---

## Launch Approval

**Launch cannot proceed until:**
1. All "PASS" criteria met for all categories
2. All P0 and P1 issues resolved
3. Security audit completed
4. Rollback plan ready
5. Product Owner approval

**Launch Date**: [TBD]
**Approved By**: [TBD]
**Date Approved**: [TBD]

---

*This document is the source of truth for launch readiness. All changes require explicit approval.*
