// src/hooks/useBillingGate.js
// Single source of truth for internal billing-state write gating
// Phase A.1 - Billing Entitlement Enforcement

import { useUser } from '../context/UserContext';

/**
 * useBillingGate - Hook for determining write access based on subscription status
 * 
 * Policy:
 * - active, trialing, past_due => write allowed
 * - unpaid, canceled => read-only
 * 
 * Returns:
 * {
 *   billingStatus: string - Raw subscription status from UserContext
 *   isReadOnly: boolean - true if mutations should be blocked
 *   canWrite: boolean - true if mutations should be allowed
 *   readOnlyReason: string - Human-readable reason for read-only state (or empty string)
 *   canAccessBilling: boolean - true for internal roles that use admin billing flows
 *   canManageBilling: boolean - true only for admin role
 * }
 */
export function useBillingGate() {
  const { subscriptionStatus, role } = useUser();

  // Normalize billing status (handle null/undefined, lowercase for comparison)
  const billingStatus = (subscriptionStatus || 'inactive').toLowerCase();

  // Internal roles that are affected by billing gating
  const isInternalRole = role === 'admin' || role === 'manager' || role === 'dispatcher';

  // Write allowed statuses
  const writeAllowedStatuses = ['active', 'trialing', 'past_due'];
  const isWriteAllowed = writeAllowedStatuses.includes(billingStatus);

  // Read-only statuses
  const readOnlyStatuses = ['unpaid', 'canceled'];
  const isReadOnlyStatus = readOnlyStatuses.includes(billingStatus);

  // Determine write access
  // For internal roles: use status-based logic
  // For non-internal roles: always allow (they're not subject to billing gating)
  // For unknown/missing status: fail closed to read-only
  let canWrite = false;
  let isReadOnly = false;
  let readOnlyReason = '';

  if (!isInternalRole) {
    // Non-internal roles (crew, customer, platform_admin) are not subject to billing gating
    canWrite = true;
    isReadOnly = false;
  } else if (isWriteAllowed) {
    // Active, trialing, or past_due status => write allowed
    canWrite = true;
    isReadOnly = false;
  } else if (isReadOnlyStatus) {
    // Unpaid or canceled status => read-only
    canWrite = false;
    isReadOnly = true;
    if (billingStatus === 'unpaid') {
      readOnlyReason = 'Subscription is unpaid. The workspace is in read-only mode until billing is resolved.';
    } else if (billingStatus === 'canceled') {
      readOnlyReason = 'Subscription is canceled. The workspace is in read-only mode until billing is reactivated.';
    }
  } else {
    // Unknown or inactive status => fail closed to read-only
    canWrite = false;
    isReadOnly = true;
    readOnlyReason = 'Subscription status is not active. Please update billing to continue.';
  }

  // Billing page access: always true for internal roles
  const canAccessBilling = isInternalRole;

  // Billing management (checkout, portal): only admin can manage
  const canManageBilling = role === 'admin';

  return {
    billingStatus: subscriptionStatus || 'inactive', // Return original case for display
    isReadOnly,
    canWrite,
    readOnlyReason,
    canAccessBilling,
    canManageBilling
  };
}
