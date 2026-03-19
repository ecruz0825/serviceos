import { CheckCircle, Circle, Camera, DollarSign, CheckCircle2 } from 'lucide-react'

/**
 * JobProgressStepper - Visual progress indicator for job workflow
 * 
 * Steps:
 * 1. Before Photos
 * 2. After Photos
 * 3. Payment (optional)
 * 4. Complete
 */
export default function JobProgressStepper({ 
  hasBefore, 
  hasAfter, 
  hasPayment, 
  isCompleted,
  currentStep 
}) {
  const steps = [
    {
      id: 1,
      label: 'Before Photos',
      icon: Camera,
      done: hasBefore,
      current: currentStep === 1
    },
    {
      id: 2,
      label: 'After Photos',
      icon: Camera,
      done: hasAfter,
      current: currentStep === 2
    },
    {
      id: 3,
      label: 'Payment',
      icon: DollarSign,
      done: hasPayment,
      current: currentStep === 3,
      optional: true
    },
    {
      id: 4,
      label: 'Complete',
      icon: CheckCircle2,
      done: isCompleted,
      current: currentStep === 4
    }
  ]

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isLast = index === steps.length - 1
          const isActive = step.done || step.current
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors
                    ${
                      step.done
                        ? 'bg-green-500 border-green-500 text-white'
                        : step.current
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-300 text-slate-400'
                    }
                  `}
                  style={
                    step.current && !step.done
                      ? {
                          backgroundColor: 'var(--brand-secondary, var(--brand-primary))',
                          borderColor: 'var(--brand-secondary, var(--brand-primary))'
                        }
                      : {}
                  }
                >
                  {step.done ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <p
                  className={`
                    mt-2 text-xs font-medium text-center
                    ${isActive ? 'text-slate-900' : 'text-slate-500'}
                  `}
                  style={
                    step.current && !step.done
                      ? { color: 'var(--brand-secondary, var(--brand-primary))' }
                      : {}
                  }
                >
                  {step.label}
                  {step.optional && <span className="block text-xs text-slate-400">(optional)</span>}
                </p>
              </div>
              {!isLast && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2 -mt-5
                    ${step.done ? 'bg-green-500' : 'bg-slate-300'}
                  `}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
