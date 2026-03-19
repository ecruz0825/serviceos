import { Link } from 'react-router-dom'
import { useBrand } from '../../context/BrandContext'
import Card from '../ui/Card'
import StatusBadge from './StatusBadge'
import Button from '../ui/Button'
import { Receipt, Calendar, DollarSign, Download } from 'lucide-react'

/**
 * InvoiceCard - Reusable invoice card component with brand colors
 */
export default function InvoiceCard({ invoice, showActions = true }) {
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

  const isOverdue = invoice.due_date && 
    new Date(invoice.due_date) < new Date() && 
    invoice.status !== 'paid' && 
    invoice.status !== 'void'

  return (
    <Card className={`hover:shadow-md transition-shadow ${isOverdue ? 'border-red-200' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <Link
            to={`/customer/invoices/${invoice.id || invoice.job_id}`}
            className="block"
          >
            <h3 
              className="text-lg font-semibold text-slate-900 mb-1 hover:underline"
              style={{ color: 'var(--brand-primary, #22c55e)' }}
            >
              {invoice.invoice_number || `Invoice #${(invoice.id || invoice.job_id).slice(0, 8)}`}
            </h3>
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600 mt-2 flex-wrap">
            {invoice.created_at && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(invoice.created_at)}</span>
              </div>
            )}
            {invoice.due_date && (
              <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                <Calendar className="h-4 w-4" />
                <span>Due: {formatDate(invoice.due_date)}</span>
              </div>
            )}
            {invoice.total && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span className="font-semibold">{formatCurrency(invoice.total)}</span>
              </div>
            )}
            {invoice.balance_due !== undefined && invoice.balance_due > 0 && (
              <div className="flex items-center gap-1 text-red-600 font-medium">
                <span>Balance: {formatCurrency(invoice.balance_due)}</span>
              </div>
            )}
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      {showActions && (
        <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
          <Link to={`/customer/invoices/${invoice.id || invoice.job_id}`}>
            <Button variant="secondary" size="sm">
              View Details
            </Button>
          </Link>
          {(invoice?.pdf_path || invoice?.invoice_pdf_path || invoice?.invoice_path) && (
            <Button 
              variant="tertiary" 
              size="sm" 
              className="flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault()
                // Download will be handled in detail page
              }}
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
