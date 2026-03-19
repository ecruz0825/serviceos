import { useBrand } from '../../context/BrandContext'

/**
 * Badge - Reusable badge component with semantic variants
 * 
 * Variants:
 * - success: Green (uses brand primary color)
 * - warning: Amber/yellow
 * - danger: Red
 * - info: Blue
 * - neutral: Slate/gray
 * 
 * @param {string} variant - Badge variant
 * @param {string} children - Badge text
 * @param {string} className - Additional CSS classes
 */
export default function Badge({ 
  variant = 'neutral', 
  children, 
  className = '' 
}) {
  const { brand } = useBrand()
  const primaryColor = brand?.primaryColor || '#22c55e'

  // Get variant styles
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          backgroundColor: `${primaryColor}15`,
          color: primaryColor,
          borderColor: `${primaryColor}40`,
        }
      case 'warning':
        return {
          backgroundColor: '#fef3c715',
          color: '#f59e0b',
          borderColor: '#fbbf2440',
        }
      case 'danger':
        return {
          backgroundColor: '#fee2e215',
          color: '#ef4444',
          borderColor: '#fca5a540',
        }
      case 'info':
        return {
          backgroundColor: '#dbeafe15',
          color: '#3b82f6',
          borderColor: '#93c5fd40',
        }
      case 'neutral':
      default:
        return {
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          borderColor: '#cbd5e1',
        }
    }
  }

  const style = getVariantStyles()

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}
