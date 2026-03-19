import toast from 'react-hot-toast';
import Button from '../components/ui/Button';
import { logProductEvent } from '../lib/productEvents';

/**
 * handlePlanLimitError - Shows a toast with Upgrade CTA for plan limit errors
 * 
 * @param {Object} error - The error object from Supabase
 * @param {Function} navigate - React Router navigate function
 * @returns {boolean} - true if error was handled, false otherwise
 */
export default function handlePlanLimitError(error, navigate) {
  // Return false immediately if no error message
  if (!error?.message) {
    return false;
  }

  const errorMessage = error.message;

  // Detect plan limit errors
  const isLimitError = 
    errorMessage.includes('CUSTOMER_LIMIT_REACHED') ||
    errorMessage.includes('CREW_LIMIT_REACHED') ||
    errorMessage.includes('JOB_LIMIT_REACHED');

  if (!isLimitError) {
    return false;
  }

  // Log product event: limit_hit (wrapped in try/catch to never block core actions)
  try {
    const limitType = errorMessage.includes('CUSTOMER_LIMIT_REACHED') ? 'customers' :
                      errorMessage.includes('CREW_LIMIT_REACHED') ? 'crew' :
                      errorMessage.includes('JOB_LIMIT_REACHED') ? 'jobs' : 'unknown';
    logProductEvent('limit_hit', {
      limit_type: limitType,
      error_message: errorMessage
    });
  } catch (e) {
    console.warn('[handlePlanLimitError] Product event logging failed:', e);
    // Continue - analytics failures must never block core actions
  }

  // Clean up message for display: strip prefix, trim, capitalize first letter
  const displayMessage = errorMessage
    .replace(/^(CUSTOMER|CREW|JOB)_LIMIT_REACHED:\s*/i, '')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

  // Show custom toast with Upgrade CTA
  toast.custom((t) => (
    <div className="bg-white border border-amber-200 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
      <span className="text-amber-800 flex-1">{displayMessage}</span>
      <Button
        variant="primary"
        onClick={() => {
          navigate('/admin/billing');
          toast.dismiss(t.id);
        }}
      >
        Upgrade
      </Button>
      <button
        onClick={() => toast.dismiss(t.id)}
        className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  ), {
    duration: 8000, // Longer duration for actionable toast
  });

  return true;
}
