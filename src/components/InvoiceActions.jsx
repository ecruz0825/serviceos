/**
 * InvoiceActions - Reusable component for invoice-related actions
 * 
 * Always renders 4 buttons: Invoice (generate), Email, View, PDF
 * Buttons are disabled with clear reasons when unavailable.
 * Desktop: tooltip via title attribute
 * Mobile: inline helper text shown below buttons
 */
import Button from "./ui/Button";

export default function InvoiceActions({
  job,
  invoice, // Invoice record from invoices table (optional)
  payments, // Payments array for this invoice (optional) - used to calculate balance
  onGenerateInvoice,
  onEmailInvoice,
  onViewInvoice,
  onDownloadInvoice,
  supportMode = false, // Support mode flag to disable mutations
  billingDisabled = false, // Billing read-only flag to disable mutations
}) {
  const isCompleted = job?.status === "Completed";
  // Canonical path resolution: prefer invoices.pdf_path, fallback to legacy fields
  const invoicePath = invoice?.pdf_path || invoice?.invoice_pdf_path || job?.invoice_path || null;
  const hasInvoice = !!invoicePath;
  const invoiceStatus = invoice?.status || null;
  
  // Calculate total paid from payments (filter for posted, non-voided payments)
  const totalPaid = payments
    ? payments
        .filter(p => p.status === 'posted' && !p.voided_at)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    : 0;
  
  // Calculate balance remaining
  const invoiceTotal = invoice?.total ? Number(invoice.total) : 0;
  const balanceRemaining = Math.max(0, invoiceTotal - totalPaid);

  // Determine disabled states and reasons - compose supportMode and billingDisabled
  const mutationDisabled = supportMode || billingDisabled;
  const generateDisabled = mutationDisabled || !isCompleted;
  const generateReason = mutationDisabled 
    ? (billingDisabled ? "Invoice generation is disabled due to billing status" : "Invoice generation is disabled in support mode")
    : "Complete job first";

  const viewEmailDownloadDisabled = mutationDisabled || !hasInvoice;
  const viewEmailDownloadReason = mutationDisabled
    ? (billingDisabled ? "Invoice actions are disabled due to billing status" : "Invoice actions are disabled in support mode")
    : "Generate invoice first";

  // Priority: show first unmet requirement
  const helperReason = !isCompleted
    ? generateReason
    : !hasInvoice
    ? viewEmailDownloadReason
    : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2 items-center">
        {/* Generate Invoice Button */}
        <Button
          variant="primary"
          onClick={() => onGenerateInvoice(job)}
          disabled={generateDisabled}
          title={generateDisabled ? generateReason : "Generate invoice"}
        >
          Invoice
        </Button>

        {/* Email Invoice Button */}
        <Button
          variant="secondary"
          onClick={() => onEmailInvoice(job)}
          disabled={viewEmailDownloadDisabled}
          title={viewEmailDownloadDisabled ? viewEmailDownloadReason : "Email invoice"}
        >
          Email
        </Button>

        {/* View Invoice Button */}
        <Button
          variant="secondary"
          onClick={() => onViewInvoice(job)}
          disabled={viewEmailDownloadDisabled}
          title={viewEmailDownloadDisabled ? viewEmailDownloadReason : "View PDF"}
        >
          View
        </Button>

        {/* Download Invoice Button */}
        <Button
          variant="secondary"
          onClick={() => onDownloadInvoice(job)}
          disabled={viewEmailDownloadDisabled}
          title={viewEmailDownloadDisabled ? viewEmailDownloadReason : "Download PDF"}
        >
          PDF
        </Button>
      </div>

      {/* Mobile helper text - only show if there's a reason and on small screens */}
      {helperReason && (
        <p className="text-xs text-amber-600 mt-1 sm:hidden">{helperReason}</p>
      )}

      {/* Invoice status badge and balance - show if invoice exists */}
      {hasInvoice && invoice && (
        <div className="mt-2 space-y-1">
          <div>
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
              invoiceStatus === 'paid' ? 'bg-green-100 text-green-800' :
              invoiceStatus === 'sent' ? 'bg-blue-100 text-blue-800' :
              invoiceStatus === 'overdue' ? 'bg-red-100 text-red-800' :
              invoiceStatus === 'void' ? 'bg-gray-100 text-gray-800' :
              'bg-yellow-100 text-yellow-800' // draft
            }`}>
              {invoiceStatus ? invoiceStatus.charAt(0).toUpperCase() + invoiceStatus.slice(1) : 'Draft'}
              {invoiceTotal > 0 && (
                <span className="ml-1">• ${invoiceTotal.toFixed(2)}</span>
              )}
            </span>
          </div>
          {invoiceTotal > 0 && (
            <div className="text-xs text-slate-600 space-y-0.5">
              <div>Total Paid: <span className="font-medium">${totalPaid.toFixed(2)}</span></div>
              {balanceRemaining > 0 && (
                <div>Balance Remaining: <span className="font-medium text-red-600">${balanceRemaining.toFixed(2)}</span></div>
              )}
              {balanceRemaining === 0 && invoiceTotal > 0 && (
                <div className="text-green-600 font-medium">Fully Paid</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

