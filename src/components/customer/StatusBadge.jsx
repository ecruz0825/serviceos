import { useBrand } from '../../context/BrandContext'

/**
 * StatusBadge - Brand-aware status badge component
 * Uses brand primary color for active/positive statuses
 */
export default function StatusBadge({ status, variant = 'default' }) {
  const { brand } = useBrand()
  const primaryColor = brand?.primaryColor || '#22c55e'

  // Normalize status to lowercase
  const normalizedStatus = (status || '').toLowerCase()

  // Determine badge style based on status
  const getStatusStyle = () => {
    switch (normalizedStatus) {
      case 'completed':
      case 'paid':
      case 'accepted':
      case 'approved':
        return {
          backgroundColor: `${primaryColor}15`,
          color: primaryColor,
          borderColor: `${primaryColor}40`,
        }
      case 'pending':
      case 'scheduled':
      case 'sent':
      case 'draft':
        return {
          backgroundColor: '#fef3c715',
          color: '#f59e0b',
          borderColor: '#fbbf2440',
        }
      case 'overdue':
      case 'rejected':
      case 'declined':
      case 'cancelled':
      case 'canceled':
        return {
          backgroundColor: '#fee2e215',
          color: '#ef4444',
          borderColor: '#fca5a540',
        }
      case 'in progress':
      case 'in_progress':
      case 'requested':
        return {
          backgroundColor: '#dbeafe15',
          color: '#3b82f6',
          borderColor: '#93c5fd40',
        }
      default:
        return {
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          borderColor: '#cbd5e1',
        }
    }
  }

  const style = getStatusStyle()
  const displayStatus = status || 'Unknown'

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
      style={style}
    >
      {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
    </span>
  )
}
