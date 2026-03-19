// src/components/ui/LimitWarningBanner.jsx
// Warning banner shown when plan usage is approaching limit threshold

import { Link } from "react-router-dom";

/**
 * LimitWarningBanner - Displays a warning when resource usage is approaching plan limit
 * 
 * Props:
 * - label: string - Resource label (e.g., "Crew Members", "Customers", "Jobs This Month")
 * - current: number - Current usage count
 * - limit: number | null - Plan limit (null means unlimited)
 * - threshold: number (optional, default: 0.8) - Threshold percentage (0.8 = 80%)
 * - billingPath: string (optional, default: "/admin/billing") - Path to billing page
 * - isLoading: boolean (optional, default: false) - Whether usage data is loading
 */
export default function LimitWarningBanner({
  label,
  current,
  limit,
  threshold = 0.8,
  billingPath = "/admin/billing",
  isLoading = false
}) {
  // Don't show if loading, unlimited, or below threshold
  if (isLoading || limit === null || limit === 0) {
    return null;
  }

  // Calculate percentage
  const percentage = current / limit;

  // Only show if at or above threshold
  if (percentage < threshold) {
    return null;
  }

  // Calculate remaining
  const remaining = Math.max(0, limit - current);

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-900">
            Approaching {label} Limit
          </p>
          <p className="mt-1 text-xs text-yellow-800">
            You're using {current} of {limit} {label.toLowerCase()}. {remaining === 0 ? 'Limit reached.' : `${remaining} remaining.`}
          </p>
        </div>
        <Link
          to={billingPath}
          className="px-3 py-1.5 text-xs font-medium text-yellow-900 bg-yellow-100 hover:bg-yellow-200 border border-yellow-300 rounded transition-colors whitespace-nowrap"
        >
          Upgrade Plan
        </Link>
      </div>
    </div>
  );
}
