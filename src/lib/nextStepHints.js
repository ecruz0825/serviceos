/**
 * Next Step Hints
 * Provides small, non-intrusive "Next step" guidance for Quotes, Jobs, and Invoices
 * based ONLY on existing statuses. No new business rules, no backend changes.
 */

/**
 * Get next step hint for a quote
 * @param {Object} quote - Quote object with status, converted_job_id, etc.
 * @returns {string} Next step hint text
 */
export function getQuoteNextStep(quote) {
  if (!quote) return "Next: Review details";

  const status = (quote.status || '').toLowerCase();
  const hasJob = !!quote.converted_job_id;

  // Draft quotes
  if (status === 'draft') {
    return "Next: Send quote to customer";
  }

  // Sent quotes
  if (status === 'sent') {
    return "Next: Await customer response";
  }

  // Accepted quotes
  if (status === 'accepted') {
    if (hasJob) {
      return "Next: Work the job";
    }
    return "Next: Convert to job";
  }

  // Rejected or expired (terminal states)
  if (status === 'rejected' || status === 'expired') {
    return "No further actions";
  }

  // Default fallback
  return "Next: Review details";
}

/**
 * Get next step hint for a job
 * @param {Object} job - Job object with status, service_date, invoice_path, etc.
 * @returns {string} Next step hint text
 */
export function getJobNextStep(job) {
  if (!job) return "Next: Review details";

  const status = (job.status || '').toLowerCase();
  const hasServiceDate = !!job.service_date;
  const hasAssignment = !!(job.assigned_team_id || job.assigned_to);
  
  // Check for invoice (prefer invoices table, fallback to legacy fields)
  const invoice = job.__invoice || job.invoice;
  const hasInvoice = !!(invoice?.pdf_path || invoice?.invoice_pdf_path || job.invoice_path);
  
  // Completed detection: use completed_at and/or status
  const isCompleted = !!job.completed_at || status === 'completed';
  
  // Canceled jobs (terminal state)
  if (status === 'canceled' || status === 'cancelled') {
    return "No further actions";
  }

  // Pending jobs without scheduled date
  if (status === 'pending' && !hasServiceDate) {
    return "Next: Schedule job";
  }

  // Scheduled jobs (have service_date and status is Scheduled)
  if (status === 'scheduled' && hasServiceDate && !isCompleted) {
    return "Next: Start job";
  }

  // Jobs with scheduled date but not completed (and not explicitly Scheduled status)
  if (hasServiceDate && !isCompleted) {
    return "Next: Complete job";
  }

  // Completed jobs without invoice
  if (isCompleted && !hasInvoice) {
    return "Next: Create invoice";
  }

  // Completed jobs with invoice
  if (isCompleted && hasInvoice) {
    // Check invoice status if available
    const invoiceStatus = invoice?.status || job.invoice_status;
    if (invoiceStatus === 'draft') {
      return "Next: Send invoice";
    }
    if (invoiceStatus === 'sent' || invoiceStatus === 'overdue') {
      return "Next: Record payment";
    }
    if (invoiceStatus === 'paid') {
      return "No further actions";
    }
    // Default for completed with invoice
    return "Next: Send invoice";
  }

  // Default fallback
  return "Next: Review details";
}

/**
 * Get next step hint for an invoice
 * @param {Object} invoice - Invoice object with status, due_date, balance_due, etc.
 * @param {Object} options - Optional parameters
 * @param {number} options.totalPaid - Total amount paid (optional)
 * @returns {string} Next step hint text
 */
export function getInvoiceNextStep(invoice, options = {}) {
  if (!invoice) return "Next: Review details";

  const status = (invoice.status || '').toLowerCase();
  const { totalPaid = 0 } = options;
  const invoiceTotal = Number(invoice.total || 0);
  const balanceDue = Math.max(0, invoiceTotal - totalPaid);
  const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
  const isOverdue = dueDate && dueDate < new Date() && balanceDue > 0;

  // Draft invoices
  if (status === 'draft') {
    return "Next: Send invoice";
  }

  // Sent invoices
  if (status === 'sent') {
    if (balanceDue > 0) {
      if (isOverdue) {
        return "Next: Follow up for payment";
      }
      return "Next: Record payment";
    }
    return "Next: Record payment";
  }

  // Overdue invoices (if status is explicitly overdue)
  if (status === 'overdue' || isOverdue) {
    return "Next: Follow up for payment";
  }

  // Paid invoices (terminal state)
  if (status === 'paid' || balanceDue === 0) {
    return "No further actions";
  }

  // Voided invoices (terminal state)
  if (status === 'void' || status === 'voided') {
    return "No further actions";
  }

  // Default fallback
  return "Next: Review details";
}
