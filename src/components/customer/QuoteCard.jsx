import { Link } from 'react-router-dom'
import { useBrand } from '../../context/BrandContext'
import Card from '../ui/Card'
import StatusBadge from './StatusBadge'
import Button from '../ui/Button'
import { FileText, Calendar, DollarSign } from 'lucide-react'

/**
 * QuoteCard - Reusable quote card component with brand colors
 */
export default function QuoteCard({ quote, showActions = true }) {
  const { brand } = useBrand()
  const primaryColor = brand?.primaryColor || '#22c55e'

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return null
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0)
  }

  const canAcceptReject = quote.status === 'sent' && !quote.expires_at || 
    (quote.expires_at && new Date(quote.expires_at) > new Date())

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <Link
            to={`/customer/quotes/${quote.id}`}
            className="block"
          >
            <h3 
              className="text-lg font-semibold text-slate-900 mb-1 hover:underline"
              style={{ color: 'var(--brand-primary, #22c55e)' }}
            >
              {quote.quote_number || `Quote #${quote.id.slice(0, 8)}`}
            </h3>
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600 mt-2">
            {quote.created_at && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(quote.created_at)}</span>
              </div>
            )}
            {quote.total && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span className="font-semibold">{formatCurrency(quote.total)}</span>
              </div>
            )}
          </div>
        </div>
        <StatusBadge status={quote.status} />
      </div>

      {quote.notes && (
        <p className="text-sm text-slate-600 mb-4 line-clamp-2">{quote.notes}</p>
      )}

      {showActions && (
        <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
          <Link to={`/customer/quotes/${quote.id}`}>
            <Button variant="secondary" size="sm">
              View Details
            </Button>
          </Link>
          {canAcceptReject && (
            <Button 
              variant="primary" 
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                // Navigation will handle accept/reject in detail page
              }}
            >
              Respond
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
