/**
 * crewNextAction - Pure utility to determine the next action for a crew job
 * 
 * @param {Object} job - Job object with status, before_image, after_image
 * @param {Object} jobPayments - Payment data for the job (optional)
 * @returns {Object} { label: string, type: 'attention' | 'normal' | 'done' }
 */
export function getNextAction(job, jobPayments = null) {
  if (!job) {
    return { label: 'View Details', type: 'normal' }
  }

  const hasBefore = !!job.before_image
  const hasAfter = !!job.after_image
  const isCompleted = job.status === 'Completed'

  // If completed, no action needed
  if (isCompleted) {
    return { label: 'View Details', type: 'done' }
  }

  // Priority: missing before photo
  if (!hasBefore) {
    return { label: 'Upload Before Photos', type: 'attention' }
  }

  // Next: missing after photo (job can't be completed without it)
  if (!hasAfter) {
    return { label: 'Upload After Photos', type: 'attention' }
  }

  // Has both photos but not completed - ready to mark complete
  if (hasBefore && hasAfter) {
    return { label: 'Mark Complete', type: 'normal' }
  }

  // Fallback
  return { label: 'View Details', type: 'normal' }
}
