import Button from '../ui/Button';
import useCompanySettings from '../../hooks/useCompanySettings';

/**
 * ScheduleRequestsTable - Presentational component for displaying schedule requests in a table
 * 
 * @param {Array} mergedData - Array of merged request data (request + job + quote + customer)
 * @param {string} jobIdParam - Optional jobId to highlight specific row
 * @param {string} approvingId - ID of request currently being approved
 * @param {string} decliningId - ID of request currently being declined
 * @param {Function} onApprove - Callback when approve button clicked (requestId) => void
 * @param {Function} onDecline - Callback when decline button clicked (requestId) => void
 */
export default function ScheduleRequestsTable({
  mergedData,
  jobIdParam,
  approvingId,
  decliningId,
  onApprove,
  onDecline,
}) {
  const { settings } = useCompanySettings();
  const customerLabel = settings?.customer_label || "Customer";

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Invalid';
    }
  };

  // Format datetime helper
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Request</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Quote #</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">{customerLabel}</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Services</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Requested At</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Notes</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mergedData.map((item) => {
            const isHighlighted = jobIdParam && item.job_id === jobIdParam;
            const isReschedule = (item.request_type || 'initial') === 'reschedule';
            return (
              <tr 
                key={item.id}
                data-job-id={item.job_id}
                className={`border-b border-slate-100 hover:bg-slate-50 ${
                  isHighlighted ? 'bg-blue-50 border-blue-200' : ''
                }`}
              >
                <td className="py-3 px-4 text-sm text-slate-900">
                  <div className="space-y-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      isReschedule
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {isReschedule ? 'Reschedule Request' : 'Schedule Request'}
                    </span>
                    {isReschedule ? (
                      <div className="text-xs text-slate-700">
                        <span className="text-slate-500">Current:</span>{' '}
                        {item.job?.service_date ? formatDate(item.job.service_date) : 'Not set'}{' '}
                        <span className="text-slate-400">→</span>{' '}
                        <span className="text-slate-500">Requested:</span>{' '}
                        {formatDate(item.requested_date)}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-700">
                        <span className="text-slate-500">Requested Date:</span> {formatDate(item.requested_date)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {item.quote?.quote_number || '—'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {item.customer?.full_name || '—'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">
                  {item.servicesSummary || '—'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">
                  {formatDateTime(item.created_at)}
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">
                  {item.customer_note ? (
                    <span className="italic" title={item.customer_note}>
                      {item.customer_note.length > 50 
                        ? item.customer_note.substring(0, 50) + '...' 
                        : item.customer_note}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      onClick={() => onApprove(item.id)}
                      disabled={approvingId === item.id || decliningId === item.id}
                      className="text-xs px-3 py-1"
                    >
                      {approvingId === item.id ? 'Approving...' : 'Approve'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => onDecline(item.id)}
                      disabled={approvingId === item.id || decliningId === item.id}
                      className="text-xs px-3 py-1"
                    >
                      {decliningId === item.id ? 'Declining...' : 'Decline'}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
