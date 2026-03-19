/**
 * Revenue Pipeline Utility
 * Single source of truth for computing pipeline stages and next actions
 * Pure functions - no React, no side effects
 */

// Quote stages
export const QUOTE_STAGES = {
  QUOTE_DRAFT: 'QUOTE_DRAFT',
  QUOTE_SENT: 'QUOTE_SENT',
  QUOTE_ACCEPTED: 'QUOTE_ACCEPTED',
  QUOTE_REJECTED: 'QUOTE_REJECTED',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED'
}

// Job stages
export const JOB_STAGES = {
  JOB_NEEDS_SCHEDULING: 'JOB_NEEDS_SCHEDULING',
  JOB_SCHEDULED: 'JOB_SCHEDULED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  JOB_INVOICED: 'JOB_INVOICED',
  JOB_PAID: 'JOB_PAID'
}

/**
 * Compute quote stage from quote object
 * @param {Object} quote - Quote object with status field
 * @returns {string} Stage constant
 */
export function computeQuoteStage(quote) {
  if (!quote || !quote.status) return QUOTE_STAGES.QUOTE_DRAFT
  
  const status = quote.status.toLowerCase()
  
  switch (status) {
    case 'draft':
      return QUOTE_STAGES.QUOTE_DRAFT
    case 'sent':
      return QUOTE_STAGES.QUOTE_SENT
    case 'accepted':
      return QUOTE_STAGES.QUOTE_ACCEPTED
    case 'rejected':
      return QUOTE_STAGES.QUOTE_REJECTED
    case 'expired':
      return QUOTE_STAGES.QUOTE_EXPIRED
    default:
      return QUOTE_STAGES.QUOTE_DRAFT
  }
}

/**
 * Compute job stage from job object and paid total
 * @param {Object} job - Job object with status, service_date, invoice_path, etc.
 * @param {number} paidTotal - Total amount paid (sum of posted payments)
 * @returns {string} Stage constant
 */
export function computeJobStage(job, paidTotal = 0) {
  if (!job) return JOB_STAGES.JOB_NEEDS_SCHEDULING
  
  const jobCost = Number(job.job_cost || 0)
  const paid = Number(paidTotal || 0)
  const status = (job.status || '').toLowerCase()
  const hasServiceDate = !!job.service_date
  // Canonical path resolution: prefer invoice.pdf_path, fallback to legacy fields
  const invoice = job.__invoice || job.invoice;
  const hasInvoice = !!(invoice?.pdf_path || invoice?.invoice_pdf_path || job.invoice_path)
  const isCompleted = status === 'completed' || status === 'done' || !!job.completed_at
  
  // PAID: totalPaid >= job_cost
  if (paid >= jobCost && jobCost > 0) {
    return JOB_STAGES.JOB_PAID
  }
  
  // INVOICED: invoice_path is not null
  if (hasInvoice) {
    return JOB_STAGES.JOB_INVOICED
  }
  
  // COMPLETED: status indicates complete OR completed_at exists
  if (isCompleted) {
    return JOB_STAGES.JOB_COMPLETED
  }
  
  // SCHEDULED: service_date exists and status not completed
  if (hasServiceDate) {
    return JOB_STAGES.JOB_SCHEDULED
  }
  
  // NEEDS_SCHEDULING: job exists and service_date is null and status in pending states
  return JOB_STAGES.JOB_NEEDS_SCHEDULING
}

/**
 * Compute paid total for a job from payments array
 * @param {Array} payments - Array of payment objects
 * @param {string} jobId - Job ID to filter by
 * @returns {number} Total paid amount (only posted, non-voided payments)
 */
export function computePaidTotalForJob(payments, jobId) {
  if (!payments || !Array.isArray(payments) || !jobId) return 0
  
  return payments
    .filter(p => 
      p.job_id === jobId && 
      p.status === 'posted' && 
      !p.voided_at
    )
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
}

/**
 * Get next action for a quote or job
 * @param {Object} params
 * @param {Object} params.quote - Quote object (optional)
 * @param {Object} params.job - Job object (optional)
 * @param {string} params.stage - Current stage (from computeQuoteStage or computeJobStage)
 * @param {boolean} params.hasScheduleRequest - Whether there's a pending schedule request
 * @param {boolean} params.hasInvoice - Whether job has invoice
 * @param {boolean} params.hasBalanceDue - Whether job has outstanding balance
 * @returns {Object} { label, href, kind, meta }
 */
export function getNextAction({ quote, job, stage, hasScheduleRequest = false, hasInvoice = false, hasBalanceDue = false }) {
  // Quote stages
  if (stage === QUOTE_STAGES.QUOTE_DRAFT) {
    return {
      label: 'Edit Quote',
      href: `/admin/quotes?openQuoteId=${quote?.id}`,
      kind: 'open_quote',
      meta: { quoteId: quote?.id }
    }
  }
  
  if (stage === QUOTE_STAGES.QUOTE_SENT) {
    return {
      label: 'Follow Up Quote',
      href: `/admin/quotes?openQuoteId=${quote?.id}`,
      kind: 'open_quote',
      meta: { quoteId: quote?.id, highlight: 'send_nudge' }
    }
  }
  
  if (stage === QUOTE_STAGES.QUOTE_ACCEPTED && quote && !quote.converted_job_id) {
    return {
      label: 'Convert to Job',
      href: `/admin/quotes?openQuoteId=${quote.id}`,
      kind: 'open_quote',
      meta: { quoteId: quote.id, action: 'convert' }
    }
  }
  
  // Job stages
  if (stage === JOB_STAGES.JOB_NEEDS_SCHEDULING) {
    if (hasScheduleRequest) {
      return {
        label: 'Review Schedule Request',
        href: `/admin/schedule?tab=requests&jobId=${job?.id}`,
        kind: 'open_schedule_requests',
        meta: { jobId: job?.id }
      }
    }
    return {
      label: 'Schedule Job',
      href: `/admin/jobs?openJobId=${job?.id}&action=schedule`,
      kind: 'open_job',
      meta: { jobId: job?.id, action: 'schedule' }
    }
  }
  
  if (stage === JOB_STAGES.JOB_SCHEDULED) {
    return {
      label: 'View Job',
      href: `/admin/jobs?openJobId=${job?.id}`,
      kind: 'open_job',
      meta: { jobId: job?.id }
    }
  }
  
  if (stage === JOB_STAGES.JOB_COMPLETED) {
    return {
      label: 'Generate Invoice',
      href: `/admin/jobs?openJobId=${job?.id}&action=invoice`,
      kind: 'open_job',
      meta: { jobId: job?.id, action: 'invoice' }
    }
  }
  
  if (stage === JOB_STAGES.JOB_INVOICED) {
    if (hasBalanceDue) {
      return {
        label: 'Record Payment',
        href: `/admin/jobs?openJobId=${job?.id}&action=collect_payment`,
        kind: 'open_job',
        meta: { jobId: job?.id, customerId: job?.customer_id, action: 'collect_payment' }
      }
    }
    return {
      label: 'View Invoice',
      href: `/admin/jobs?openJobId=${job?.id}`,
      kind: 'open_job',
      meta: { jobId: job?.id }
    }
  }
  
  if (stage === JOB_STAGES.JOB_PAID) {
    return {
      label: 'View Job',
      href: `/admin/jobs?openJobId=${job?.id}`,
      kind: 'open_job',
      meta: { jobId: job?.id }
    }
  }
  
  // Default fallback
  return {
    label: 'View Details',
    href: job ? `/admin/jobs?openJobId=${job.id}` : `/admin/quotes?openQuoteId=${quote?.id}`,
    kind: job ? 'open_job' : 'open_quote',
    meta: {}
  }
}
