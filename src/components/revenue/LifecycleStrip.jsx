/**
 * LifecycleStrip - Visual pipeline progress indicator
 * Shows: Quote → Accepted → Scheduled → Completed → Invoiced → Paid
 */

import { QUOTE_STAGES, JOB_STAGES } from '../../utils/revenuePipeline'

const STEPS = [
  { key: 'quote', label: 'Quote' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' }
]

/**
 * Determine which step index we're at based on stage
 */
function getStepIndex(stage) {
  // Quote stages
  if (stage === QUOTE_STAGES.QUOTE_DRAFT || stage === QUOTE_STAGES.QUOTE_SENT) {
    return 0 // Quote
  }
  
  if (stage === QUOTE_STAGES.QUOTE_ACCEPTED) {
    return 1 // Accepted
  }
  
  // Job stages
  if (stage === JOB_STAGES.JOB_NEEDS_SCHEDULING) {
    return 1 // Accepted (job exists but not scheduled)
  }
  
  if (stage === JOB_STAGES.JOB_SCHEDULED) {
    return 2 // Scheduled
  }
  
  if (stage === JOB_STAGES.JOB_COMPLETED) {
    return 3 // Completed
  }
  
  if (stage === JOB_STAGES.JOB_INVOICED) {
    return 4 // Invoiced
  }
  
  if (stage === JOB_STAGES.JOB_PAID) {
    return 5 // Paid
  }
  
  // Default to first step
  return 0
}

export default function LifecycleStrip({ stage, size = 'sm' }) {
  const currentStepIndex = getStepIndex(stage)
  
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }
  
  const textSize = sizeClasses[size] || sizeClasses.sm
  
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, index) => {
        const isActive = index <= currentStepIndex
        const isCurrent = index === currentStepIndex
        
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`
                ${textSize}
                px-2 py-0.5 rounded
                transition-colors
                ${isActive 
                  ? isCurrent
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-400'
                }
              `}
            >
              {step.label}
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`
                  w-4 h-0.5 mx-0.5
                  ${isActive ? 'bg-green-300' : 'bg-slate-200'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
