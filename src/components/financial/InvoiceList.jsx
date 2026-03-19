import { FileText, Eye, Download } from 'lucide-react';
import Button from '../ui/Button';
import { formatCurrencyFixed } from '../../utils/currencyFormatting';
import { formatDate } from '../../utils/dateFormatting';
import { getInvoiceNextStep } from '../../lib/nextStepHints';
import { getSignedInvoiceUrl } from '../../utils/signedInvoiceUrl';
import toast from 'react-hot-toast';

/**
 * InvoiceList - Reusable invoice list display component
 * 
 * @param {Object} props
 * @param {Array} props.invoices - Array of invoice objects
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message (optional)
 * @param {Function} props.onRetry - Optional retry function
 * @param {string} props.emptyMessage - Custom empty message (default: "No invoices uploaded yet.")
 * @param {string} props.className - Additional CSS classes
 */
export default function InvoiceList({ 
  invoices = [], 
  loading = false, 
  error = null,
  onRetry = null,
  emptyMessage = "No invoices uploaded yet.",
  className = ""
}) {
  if (loading) {
    return (
      <div className={`text-center py-12 text-slate-500 ${className}`}>
        <FileText className="h-12 w-12 mx-auto mb-3 text-slate-400 animate-pulse" />
        <p className="text-sm">Loading invoices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-red-800 mb-3">{error}</p>
        {onRetry && (
          <Button
            variant="primary"
            onClick={onRetry}
            className="text-sm"
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className={`text-center py-12 text-slate-500 ${className}`}>
        <FileText className="h-12 w-12 mx-auto mb-3 text-slate-400" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const handleViewInvoice = async (invoice) => {
    try {
      const invoicePath = invoice.invoice_path || null;
      if (!invoicePath) {
        toast.error('Invoice PDF not available');
        return;
      }
      let url;
      if (invoicePath.startsWith('http://') || invoicePath.startsWith('https://')) {
        url = invoicePath;
      } else {
        url = await getSignedInvoiceUrl({ invoice_path: invoicePath, expiresIn: 60 });
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Error opening invoice:', err);
      toast.error('Failed to open invoice');
    }
  };

  const handleDownloadInvoice = async (invoice) => {
    try {
      const invoicePath = invoice.invoice_path || null;
      if (!invoicePath) {
        toast.error('Invoice PDF not available');
        return;
      }
      let url;
      if (invoicePath.startsWith('http://') || invoicePath.startsWith('https://')) {
        url = invoicePath;
      } else {
        url = await getSignedInvoiceUrl({ invoice_path: invoicePath, expiresIn: 60 });
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading invoice:', err);
      toast.error('Failed to download invoice');
    }
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">Date</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">Job/Service</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">Status</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Amount</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-3 px-3 text-sm text-slate-900">
                {invoice.service_date
                  ? formatDate(invoice.service_date)
                  : '—'}
              </td>
              <td className="py-3 px-3 text-sm text-slate-900">
                {invoice.services_performed || 'Invoice'}
              </td>
              <td className="py-3 px-3 text-sm">
                <div className="flex flex-col gap-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    invoice.status === 'Completed'
                      ? 'bg-green-100 text-green-800'
                      : invoice.status === 'Canceled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {invoice.status || 'Pending'}
                  </span>
                  {(() => {
                    const invoiceData = {
                      status: invoice.invoice_status || (invoice.status === 'Completed' ? 'sent' : 'draft'),
                      total: invoice.job_cost,
                      due_date: invoice.invoice_due_date
                    };
                    const nextStep = getInvoiceNextStep(invoiceData);
                    return (
                      <span className="text-xs text-slate-500">
                        {nextStep}
                      </span>
                    );
                  })()}
                </div>
              </td>
              <td className="py-3 px-3 text-sm text-right font-semibold text-slate-900">
                {formatCurrencyFixed(invoice.job_cost || 0)}
              </td>
              <td className="py-3 px-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="tertiary"
                    onClick={() => handleViewInvoice(invoice)}
                    disabled={!invoice.invoice_path}
                    className="text-xs p-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!invoice.invoice_path ? 'Invoice PDF not available' : 'View invoice PDF'}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() => handleDownloadInvoice(invoice)}
                    disabled={!invoice.invoice_path}
                    className="text-xs p-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!invoice.invoice_path ? 'Invoice PDF not available' : 'Download invoice PDF'}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
