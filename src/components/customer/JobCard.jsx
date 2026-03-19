import { Link } from 'react-router-dom'
import { useBrand } from '../../context/BrandContext'
import Card from '../ui/Card'
import StatusBadge from './StatusBadge'
import Button from '../ui/Button'
import { Calendar, DollarSign, FileText } from 'lucide-react'

/**
 * JobCard - Reusable job card component with brand colors
 */
export default function JobCard({ job, showActions = true }) {
  const { brand } = useBrand()
  const primaryColor = brand?.primaryColor || '#22c55e'

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not scheduled'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Invalid date'
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0)
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <Link
            to={`/customer/jobs/${job.id}`}
            className="block"
          >
            <h3 
              className="text-lg font-semibold text-slate-900 mb-1 hover:underline"
              style={{ color: 'var(--brand-primary, #22c55e)' }}
            >
              {job.services_performed || 'Job'}
            </h3>
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600 mt-2">
            {job.service_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(job.service_date)}</span>
              </div>
            )}
            {job.job_cost && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>{formatCurrency(job.job_cost)}</span>
              </div>
            )}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.notes && (
        <p className="text-sm text-slate-600 mb-4 line-clamp-2">{job.notes}</p>
      )}

      {showActions && (
        <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
          <Link to={`/customer/jobs/${job.id}`}>
            <Button variant="secondary" size="sm">
              View Details
            </Button>
          </Link>
          {/* Check for invoice: prefer invoice record, fallback to job.invoice_path */}
          {(job?.__invoice?.pdf_path || job?.__invoice?.invoice_pdf_path || job?.invoice_path) && (
            <Link to={`/customer/invoices?job_id=${job.id}`}>
              <Button variant="tertiary" size="sm" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Invoice
              </Button>
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}
