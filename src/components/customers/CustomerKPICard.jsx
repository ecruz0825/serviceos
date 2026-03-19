import { DollarSign, Receipt, Briefcase, Clock } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { formatCurrencyFixed } from '../../utils/currencyFormatting';
import { formatDate } from '../../utils/dateFormatting';

/**
 * CustomerKPICard - Reusable KPI stat card for customer overview
 * 
 * @param {string} type - KPI type: 'totalPaid', 'outstanding', 'jobs', 'lastActivity'
 * @param {object} data - KPI data object
 * @param {boolean} loading - Loading state
 * @param {string} error - Error message (optional)
 */
export default function CustomerKPICard({ type, data, loading, error }) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <LoadingSpinner size="sm" className="py-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs text-slate-500">{error}</div>
      </div>
    );
  }

  const renderContent = () => {
    switch (type) {
      case 'totalPaid':
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-slate-600">Total Paid</span>
            </div>
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrencyFixed(data?.totalPaid || 0)}
            </div>
          </>
        );
      
      case 'outstanding':
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-medium text-slate-600">Outstanding</span>
            </div>
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrencyFixed(data?.outstanding || 0)}
            </div>
          </>
        );
      
      case 'jobs':
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-slate-600">Jobs</span>
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {data?.totalJobs || 0} / {data?.completedJobs || 0} / {data?.upcomingJobs || 0}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Total / Completed / Upcoming</div>
          </>
        );
      
      case 'lastActivity':
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-slate-600">Last Activity</span>
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {data?.lastActivity ? formatDate(data.lastActivity) : '—'}
            </div>
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      {renderContent()}
    </div>
  );
}
