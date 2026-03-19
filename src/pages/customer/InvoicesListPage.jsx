import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import InvoiceCard from '../../components/customer/InvoiceCard'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import EmptyState from '../../components/customer/EmptyState'
import Button from '../../components/ui/Button'
import { Receipt } from 'lucide-react'

export default function InvoicesListPage() {
  const { brand } = useBrand()
  const [searchParams] = useSearchParams()
  const jobIdFilter = searchParams.get('job_id')
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState([])
  const [filter, setFilter] = useState('all') // all, paid, overdue, sent

  useEffect(() => {
    loadInvoices()
  }, [filter, jobIdFilter])

  async function loadInvoices() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!customer) {
        setLoading(false)
        return
      }

      // Try to load from invoices table first
      let invoicesData = []
      try {
        const { data: invoicesTableData, error: invoicesError } = await supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            status,
            total,
            balance_due,
            due_date,
            created_at,
            invoice_pdf_path,
            job_id
          `)
          .eq('customer_id', customer.id)

        if (!invoicesError && invoicesTableData) {
          invoicesData = invoicesTableData.map(inv => ({
            ...inv,
            // Map pdf_path to invoice_pdf_path for backward compatibility in components
            invoice_pdf_path: inv.pdf_path || inv.invoice_pdf_path,
          }))
        }
      } catch (err) {
        // Invoices table may not be accessible to customers yet
        console.warn('Could not load from invoices table:', err)
      }

      // Fallback: Load from jobs with invoice_path
      if (invoicesData.length === 0) {
        let jobsQuery = supabase
          .from('jobs')
          .select('id, job_cost, invoice_path, invoice_uploaded_at, service_date, status')
          .eq('customer_id', customer.id)
          .not('invoice_path', 'is', null)

        if (jobIdFilter) {
          jobsQuery = jobsQuery.eq('id', jobIdFilter)
        }

        const { data: jobsData } = await jobsQuery

        if (jobsData) {
          // Calculate balance_due from payments
          const jobIds = jobsData.map(j => j.id)
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('job_id, amount')
            .in('job_id', jobIds)
            .eq('status', 'posted')

          const paidByJob = {}
          paymentsData?.forEach(p => {
            paidByJob[p.job_id] = (paidByJob[p.job_id] || 0) + (parseFloat(p.amount) || 0)
          })

          invoicesData = jobsData.map(job => ({
            id: job.id,
            job_id: job.id,
            invoice_number: `INV-${job.id.slice(0, 8)}`,
            status: 'sent', // Default for legacy invoices
            total: parseFloat(job.job_cost) || 0,
            balance_due: Math.max((parseFloat(job.job_cost) || 0) - (paidByJob[job.id] || 0), 0),
            created_at: job.invoice_uploaded_at || job.service_date,
            // Legacy fallback: use job.invoice_path only when no invoice record exists
            pdf_path: null,
            invoice_pdf_path: null,
            invoice_path: job.invoice_path, // Temporary fallback
          }))
        }
      }

      // Apply filter
      let filtered = invoicesData
      if (filter === 'paid') {
        filtered = invoicesData.filter(inv => inv.status === 'paid' || inv.balance_due <= 0)
      } else if (filter === 'overdue') {
        filtered = invoicesData.filter(inv => 
          inv.due_date && 
          new Date(inv.due_date) < new Date() && 
          inv.status !== 'paid' && 
          inv.status !== 'void' &&
          inv.balance_due > 0
        )
      } else if (filter === 'sent') {
        filtered = invoicesData.filter(inv => inv.status === 'sent' && inv.balance_due > 0)
      }

      setInvoices(filtered)
    } catch (err) {
      console.error('Error loading invoices:', err)
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerAppShell title="Invoices">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={filter === 'all' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Invoices
          </Button>
          <Button
            variant={filter === 'sent' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('sent')}
          >
            Outstanding
          </Button>
          <Button
            variant={filter === 'overdue' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('overdue')}
          >
            Overdue
          </Button>
          <Button
            variant={filter === 'paid' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('paid')}
          >
            Paid
          </Button>
        </div>

        {/* Invoices List */}
        {loading ? (
          <LoadingSkeleton count={3} />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices found"
            description={
              filter === 'all'
                ? "You don't have any invoices yet."
                : `You don't have any ${filter} invoices.`
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {invoices.map((invoice) => (
              <InvoiceCard key={invoice.id || invoice.job_id} invoice={invoice} />
            ))}
          </div>
        )}
      </div>
    </CustomerAppShell>
  )
}
