/**
 * Invoice calculation utilities
 * Calculates subtotal, tax, and total from job data
 */

/**
 * Calculate invoice totals from a job
 * @param {Object} job - Job object with job_cost and other fields
 * @returns {Object} - { subtotal, tax, total }
 */
export function calculateInvoiceTotals(job) {
  // For now, we'll use job_cost as the total
  // Tax calculation can be added later based on company settings
  const subtotal = Number(job.job_cost || 0);
  const tax = 0; // TODO: Add tax calculation based on company tax settings
  const total = subtotal + tax;

  return {
    subtotal,
    tax,
    total
  };
}
