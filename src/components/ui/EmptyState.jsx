import { useBrand } from '../../context/BrandContext'
import Button from './Button'

/**
 * EmptyState - Reusable empty state component with brand colors
 * 
 * @param {React.Component} icon - Icon component (from lucide-react)
 * @param {string} title - Empty state title
 * @param {string} description - Empty state description
 * @param {string} actionLabel - Optional action button label
 * @param {function} onAction - Optional action button handler
 * @param {string} className - Additional CSS classes
 */
export default function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction,
  className = '' 
}) {
  const { brand } = useBrand()
  const primaryColor = brand?.primaryColor || '#22c55e'

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {Icon && (
        <div 
          className="mb-4 p-4 rounded-full"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          <Icon 
            className="h-8 w-8" 
            style={{ color: primaryColor }}
          />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-600 max-w-md mb-6">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
