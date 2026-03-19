import Card from '../ui/Card'
import Button from '../ui/Button'

/**
 * JobNextActionCallout - Displays the next required step for the job
 */
export default function JobNextActionCallout({ nextAction, isCompleted, onActionClick }) {
  if (isCompleted) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <span className="text-green-600 text-xl">✓</span>
          </div>
          <div>
            <p className="font-semibold text-slate-900">All steps done. Job completed.</p>
            <p className="text-sm text-slate-600">This job has been successfully completed.</p>
          </div>
        </div>
      </Card>
    )
  }

  const isAttention = nextAction?.type === 'attention'

  return (
    <Card
      style={
        isAttention
          ? {
              backgroundColor: 'color-mix(in srgb, var(--brand-secondary) 10%, white)',
              borderColor: 'color-mix(in srgb, var(--brand-secondary) 35%, white)'
            }
          : {}
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
              ${isAttention ? 'bg-amber-100' : 'bg-blue-100'}
            `}
            style={
              isAttention
                ? { backgroundColor: 'color-mix(in srgb, var(--brand-secondary) 20%, white)' }
                : {}
            }
          >
            <span
              className={`text-xl ${isAttention ? 'text-amber-600' : 'text-blue-600'}`}
              style={
                isAttention
                  ? { color: 'var(--brand-secondary, var(--brand-primary))' }
                  : {}
              }
            >
              {isAttention ? '⚠' : '→'}
            </span>
          </div>
          <div>
            <p className="font-semibold text-slate-900">
              Next step: {nextAction?.label || 'Continue workflow'}
            </p>
            <p className="text-sm text-slate-600">
              {isAttention
                ? 'This step is required to complete the job.'
                : 'Continue with the next step in the workflow.'}
            </p>
          </div>
        </div>
        {onActionClick && (
          <Button
            onClick={onActionClick}
            variant="primary"
            className="btn-accent"
            size="sm"
          >
            {nextAction?.label || 'Take Action'}
          </Button>
        )}
      </div>
    </Card>
  )
}
