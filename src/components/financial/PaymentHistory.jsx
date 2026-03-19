import { DollarSign } from 'lucide-react';
import { formatCurrencyFixed } from '../../utils/currencyFormatting';
import { formatDate } from '../../utils/dateFormatting';

/**
 * PaymentHistory - Reusable payment history display component
 * 
 * @param {Object} props
 * @param {Object} props.paymentData - Payment data object with { total: number, records: Array }
 * @param {number} props.jobCost - Job cost for calculating balance due
 * @param {boolean} props.showHeader - Whether to show the section header (default: true)
 * @param {string} props.emptyMessage - Custom empty message (default: "No payments recorded")
 * @param {string} props.className - Additional CSS classes
 */
export default function PaymentHistory({ 
  paymentData, 
  jobCost = 0, 
  showHeader = true,
  emptyMessage = "No payments recorded",
  className = ""
}) {
  if (!paymentData) {
    return (
      <div className={`space-y-3 ${className}`}>
        {showHeader && (
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
          </div>
        )}
        <div className="text-sm text-slate-500">{emptyMessage}</div>
      </div>
    );
  }

  const totalPaid = paymentData.total || 0;
  const records = paymentData.records || [];
  const balanceDue = Math.max(0, (jobCost || 0) - totalPaid);

  return (
    <div className={`space-y-3 ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-sm text-slate-600">
          Total Paid: <span className="font-medium">{formatCurrencyFixed(totalPaid)}</span>
        </div>
        {jobCost > 0 && (
          <div className="text-sm text-slate-600">
            Balance Due: <span className="font-medium text-red-600">{formatCurrencyFixed(balanceDue)}</span>
          </div>
        )}
        {records.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-700 mb-2">Payment Records:</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {records.map((payment, idx) => (
                <div key={idx} className="text-xs bg-slate-50 p-2 rounded border border-slate-200">
                  <div className="flex justify-between">
                    <span className="font-medium">{formatCurrencyFixed(payment.amount || 0)}</span>
                    <span className="text-slate-500">
                      {formatDate(payment.paid_at || payment.date_paid)}
                    </span>
                  </div>
                  {payment.payment_method && (
                    <div className="text-slate-500 mt-0.5">{payment.payment_method}</div>
                  )}
                  {payment.notes && (
                    <div className="text-slate-500 mt-0.5 italic">{payment.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {records.length === 0 && (
          <div className="text-sm text-slate-500">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
