# Launch PR Checklist

**Use this checklist for all PRs during launch freeze period.**

---

## Scope Check
- [ ] **No new scope** - Only P0 bugs or launch-critical blockers
- [ ] If new scope: Document why it's P0 or launch-critical
- [ ] If P1/P2: Documented for post-launch

## Migration Risk Review
- [ ] Migration file reviewed for:
  - [ ] Reversibility (or rollback migration prepared)
  - [ ] Data safety (no data loss)
  - [ ] Performance impact (indexes, constraints)
  - [ ] Multi-tenant safety (company_id scoping)
- [ ] Migration tested in staging
- [ ] Rollback procedure documented

## Tenant Isolation Impact Review
- [ ] Changes reviewed for multi-tenant safety:
  - [ ] All queries scoped by company_id
  - [ ] RLS policies not bypassed
  - [ ] RPCs enforce tenant boundaries
  - [ ] No cross-tenant data access possible
- [ ] Support mode impact considered (if applicable)

## Billing Impact Review
- [ ] Changes reviewed for billing impact:
  - [ ] No changes to subscription logic (unless P0)
  - [ ] Plan limits not affected
  - [ ] Stripe integration not modified (unless P0)
  - [ ] Usage tracking not broken
- [ ] Billing tests pass

## Rollback Path Documented
- [ ] Rollback procedure documented in PR description
- [ ] Database rollback steps (if migration involved)
- [ ] Application rollback steps
- [ ] Data recovery steps (if data changes involved)

## Testing & QA
- [ ] Changes tested locally
- [ ] Changes tested in staging (if applicable)
- [ ] Critical workflows tested:
  - [ ] Job creation
  - [ ] Route generation
  - [ ] Payment recording
  - [ ] Billing checkout
- [ ] Multi-tenant isolation verified
- [ ] Error handling tested

## Documentation
- [ ] Code comments added for complex logic
- [ ] PR description explains:
  - [ ] What changed
  - [ ] Why it changed
  - [ ] How to test
  - [ ] Rollback steps
- [ ] Screenshots or QA notes attached (if UI changes)

## Code Quality
- [ ] Follows existing patterns
- [ ] No unnecessary refactoring
- [ ] Error handling appropriate
- [ ] No console.logs in production code
- [ ] Type safety maintained (if TypeScript)

## Security
- [ ] No hardcoded secrets
- [ ] No SQL injection risks
- [ ] No XSS risks
- [ ] Authentication/authorization checked
- [ ] Input validation present

## Performance
- [ ] No N+1 queries introduced
- [ ] Database indexes used appropriately
- [ ] No blocking operations in critical paths
- [ ] Event logging does not block UX

---

## PR Approval

**Required Approvers:**
- [ ] Code review by team member
- [ ] Architecture review (if significant changes)
- [ ] Product Owner approval (if scope change)

**Launch Freeze Exception:**
- [ ] P0 bug: Proceed immediately
- [ ] Launch-critical blocker: Proceed with approval
- [ ] P1/P2: Defer to post-launch

---

## Notes
- Keep PRs small and focused
- One concern per PR
- Document assumptions and trade-offs
- Include rollback steps in PR description

---

*This checklist must be completed for all PRs during launch freeze period.*
