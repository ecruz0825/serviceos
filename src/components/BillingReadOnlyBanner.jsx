// src/components/BillingReadOnlyBanner.jsx
// Persistent banner shown when internal users are in billing read-only mode
// Phase A.1 - Billing Entitlement Enforcement

import { Link } from "react-router-dom";
import { useBillingGate } from "../hooks/useBillingGate";

export default function BillingReadOnlyBanner() {
  const { isReadOnly, readOnlyReason, canAccessBilling } = useBillingGate();

  // Don't render if not in read-only mode or if user can't access billing
  if (!isReadOnly || !canAccessBilling) {
    return null;
  }

  return (
    <div className="bg-rose-100 border-b border-rose-300 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-rose-900">
            Billing Read-Only Mode — The workspace is in read-only mode due to billing status.
          </p>
          {readOnlyReason && (
            <p className="mt-1 text-xs text-rose-800">
              {readOnlyReason}
            </p>
          )}
        </div>
        <Link
          to="/admin/billing"
          className="px-4 py-1.5 text-sm font-medium text-rose-900 bg-rose-200 hover:bg-rose-300 border border-rose-400 rounded transition-colors whitespace-nowrap"
        >
          Update Billing
        </Link>
      </div>
    </div>
  );
}
