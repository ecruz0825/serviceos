/**
 * Next Action Engine
 * Deterministically computes the next recommended action for Quotes and Jobs
 * to support a professional guided workflow.
 * 
 * Returns action objects with:
 * - key: string identifier
 * - label: button text
 * - route?: navigation path (if applicable)
 * - priority: number (lower = more urgent)
 * - kind: "primary" | "secondary"
 */

import { hasAnyAssignment, isJobUnassigned } from '../utils/jobAssignment';

/**
 * Get next action for a quote
 * @param {Object} quote - Quote object with status, last_viewed_at, converted_job_id, etc.
 * @returns {Object|null} Next action object or null
 */
export function getQuoteNextAction(quote) {
  if (!quote) return null;

  const status = (quote.status || '').toLowerCase();
  const hasViewed = !!quote.last_viewed_at;
  const hasJob = !!quote.converted_job_id;
  const isTerminal = status === 'rejected' || status === 'expired';

  // Draft quotes: send them (priority 1)
  if (status === 'draft') {
    return {
      key: 'send_quote',
      label: 'Send Quote',
      route: `/admin/quotes/${quote.id}`,
      priority: 1,
      kind: 'primary'
    };
  }

  // Sent quotes: check if viewed (priority 2-3)
  if (status === 'sent') {
    // Not viewed yet: resend
    if (!hasViewed) {
      return {
        key: 'resend_quote',
        label: 'Resend Quote',
        route: `/admin/quotes/${quote.id}`,
        priority: 2,
        kind: 'primary'
      };
    }
    
    // Viewed but no response: send reminder
    return {
      key: 'send_reminder',
      label: 'Send Reminder',
      route: `/admin/quotes/${quote.id}`,
      priority: 3,
      kind: 'primary'
    };
  }

  // Accepted quotes with job: navigate to scheduling
  if (status === 'accepted' && hasJob) {
    return {
      key: 'schedule_job',
      label: 'Schedule Job',
      route: `/admin/jobs?openJobId=${quote.converted_job_id}&action=schedule`,
      priority: 4,
      kind: 'primary'
    };
  }

  // Non-terminal states without job: convert to job (priority 2)
  // This includes accepted quotes without job, and any other non-terminal states
  if (!hasJob && !isTerminal) {
    return {
      key: 'convert_to_job',
      label: 'Convert to Job',
      route: `/admin/quotes/${quote.id}`,
      priority: 2,
      kind: 'primary'
    };
  }

  // Rejected or expired: archive (secondary action)
  if (isTerminal) {
    return {
      key: 'archive_quote',
      label: 'Archive',
      route: null, // No route - handled by existing UI
      priority: 10,
      kind: 'secondary'
    };
  }

  // Default: view quote
  return {
    key: 'view_quote',
    label: 'View Quote',
    route: `/admin/quotes/${quote.id}`,
    priority: 5,
    kind: 'secondary'
  };
}

/**
 * Get next action for a job
 * @param {Object} job - Job object with service_date, assigned_team_id, status, invoice_path, etc.
 * @param {Object} options - Optional parameters
 * @param {number} options.balanceDue - Outstanding balance amount (optional)
 * @returns {Object|null} Next action object or null
 */
export function getJobNextAction(job, options = {}) {
  if (!job) return null;

  const { balanceDue = 0 } = options;
  const hasServiceDate = !!job.service_date;
  const hasEndDate = !!job.scheduled_end_date;
  const hasAssignment = hasAnyAssignment(job);
  const isUnscheduled = !hasServiceDate;
  const isUnassigned = isJobUnassigned(job);
  // Canonical path resolution: prefer invoice.pdf_path, fallback to legacy fields
  // Note: job may have __invoice attached or invoice data may be passed separately
  const invoice = job.__invoice || job.invoice;
  const hasInvoice = !!(invoice?.pdf_path || invoice?.invoice_pdf_path || job.invoice_path);
  // Completed detection: use completed_at and/or status
  const isCompleted =
    !!job.completed_at ||
    (job.status && job.status === 'completed');
  const hasBeforeImage = !!job.before_image;
  const hasAfterImage = !!job.after_image;

  // Priority 1: Needs scheduling (no date OR no assignment - both team and crew)
  if (isUnscheduled || isUnassigned) {
    return {
      key: 'schedule_job',
      label: 'Schedule Job',
      route: `/admin/jobs?openJobId=${job.id}&action=schedule`,
      priority: 1,
      kind: 'primary'
    };
  }

  // Priority 2: Not completed yet - view job
  if (!isCompleted) {
    return {
      key: 'view_job',
      label: 'View Job',
      route: `/admin/jobs?openJobId=${job.id}`,
      priority: 2,
      kind: 'primary'
    };
  }

  // Priority 3: Completed but no invoice - generate invoice
  if (isCompleted && !hasInvoice) {
    return {
      key: 'generate_invoice',
      label: 'Generate Invoice',
      route: `/admin/jobs?openJobId=${job.id}&action=invoice`,
      priority: 3,
      kind: 'primary'
    };
  }

  // Priority 4: Has invoice but balance due - record payment
  if (hasInvoice && balanceDue > 0) {
    return {
      key: 'record_payment',
      label: 'Record Payment',
      route: `/admin/payments?jobId=${job.id}`,
      priority: 4,
      kind: 'primary'
    };
  }

  // Default: view history/details
  return {
    key: 'view_history',
    label: 'View Details',
    route: `/admin/jobs?openJobId=${job.id}`,
    priority: 5,
    kind: 'secondary'
  };
}

/**
 * Get lifecycle stage for a quote-job pair (optional helper)
 * @param {Object} params
 * @param {Object} params.quote - Quote object (optional)
 * @param {Object} params.job - Job object (optional)
 * @returns {string} Lifecycle stage identifier
 */
export function getLifecycleStage({ quote, job }) {
  if (quote && !job) {
    const status = (quote.status || '').toLowerCase();
    if (status === 'draft') return 'quote_draft';
    if (status === 'sent') return 'quote_sent';
    if (status === 'accepted') return 'quote_accepted';
    if (status === 'rejected') return 'quote_rejected';
    if (status === 'expired') return 'quote_expired';
    return 'quote_unknown';
  }

  if (job) {
    const hasServiceDate = !!job.service_date;
    const hasAssignment = hasAnyAssignment(job);
    const isUnscheduled = !hasServiceDate;
    const isUnassigned = isJobUnassigned(job);
    // Completed detection: use completed_at and/or status
    const isCompleted =
      !!job.completed_at ||
      (job.status && job.status === 'completed');
    // Canonical path resolution: prefer invoice.pdf_path, fallback to legacy fields
    const invoice = job.__invoice || job.invoice;
    const hasInvoice = !!(invoice?.pdf_path || invoice?.invoice_pdf_path || job.invoice_path);

    if (isUnscheduled || isUnassigned) return 'job_needs_scheduling';
    if (!isCompleted) return 'job_scheduled';
    if (isCompleted && !hasInvoice) return 'job_completed';
    if (hasInvoice) return 'job_invoiced';
    return 'job_unknown';
  }

  return 'unknown';
}
