/**
 * LoadingSpinner - Reusable loading spinner component
 * 
 * @param {string} size - Spinner size: 'sm', 'md', 'lg' (default: 'md')
 * @param {string} className - Additional CSS classes
 * @param {string} text - Optional loading text to display
 */
export default function LoadingSpinner({ 
  size = 'md', 
  className = '',
  text 
}) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-b-2'
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div 
        className={`animate-spin rounded-full border-slate-300 border-t-slate-600 ${sizeClasses[size]}`}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <p className="mt-2 text-sm text-slate-500">{text}</p>
      )}
    </div>
  )
}
