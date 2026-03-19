// src/components/ui/LimitCard.jsx
// Compact usage card component for displaying plan limits and current usage

/**
 * LimitCard - Displays current usage and plan limit for a resource
 * 
 * Props:
 * - label: string - Resource label (e.g., "Crew Members", "Customers", "Jobs This Month")
 * - current: number - Current usage count
 * - limit: number | null - Plan limit (null means unlimited)
 * - isLoading: boolean - Whether usage data is loading
 * - helperText: string (optional) - Additional helper text below the usage
 */
export default function LimitCard({
  label,
  current,
  limit,
  isLoading = false,
  helperText
}) {
  // Calculate percentage if limit exists
  const percentage = limit !== null && limit > 0 
    ? Math.min(100, Math.round((current / limit) * 100))
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {isLoading ? (
          <span className="text-sm text-slate-400">Loading...</span>
        ) : (
          <span className="text-sm font-semibold text-slate-900">
            {current} / {limit !== null ? limit : 'Unlimited'}
          </span>
        )}
      </div>
      
      {!isLoading && limit !== null && limit > 0 && (
        <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
          <div
            className="bg-slate-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      
      {helperText && (
        <p className="text-xs text-slate-500 mt-1">{helperText}</p>
      )}
    </div>
  );
}
