import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/customer/StatusBadge'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import Button from '../../components/ui/Button'
import { getSignedInvoiceUrl } from '../../utils/signedInvoiceUrl'
import toast from 'react-hot-toast'
import { ArrowLeft, Calendar, DollarSign, Download, FileText } from 'lucide-react'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState(null)
  const [payments, setPayments] = useState([])

  useEffect(() => {
    if (id) loadInvoiceDetail()
  }, [id])

  async function loadInvoiceDetail() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!customer) return

      // Try invoices table first
      let invoiceData = null
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .eq('customer_id', customer.id)
          .single()

        if (!error && data) {
          invoiceData = data
        }
      } catch (err) {
        // Fallback to jobs table
        console.warn('Could not load from invoices table, trying jobs table')
      }

      // Fallback: Load from jobs table
      if (!invoiceData) {
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', id)
          .eq('customer_id', customer.id)
          .single()

        if (jobError) throw jobError

        // Calculate balance from payments
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('id, amount, payment_method, date_paid, paid_at, receipt_number, external_ref, status')
          .eq('job_id', id)
          .eq('status', 'posted')

        const totalPaid = (paymentsData || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        const balanceDue = Math.max((parseFloat(jobData.job_cost) || 0) - totalPaid, 0)

        invoiceData = {
          id: jobData.id,
          job_id: jobData.id,
          invoice_number: `INV-${jobData.id.slice(0, 8)}`,
          status: balanceDue <= 0 ? 'paid' : 'sent',
          total: parseFloat(jobData.job_cost) || 0,
          balance_due: balanceDue,
          created_at: jobData.invoice_uploaded_at || jobData.service_date,
          // Legacy fallback: use job.invoice_path only if no invoice record exists
          pdf_path: null,
          invoice_pdf_path: null,
          invoice_path: jobData.invoice_path, // Temporary fallback
        }

        setPayments(paymentsData || [])
      } else {
        // Load payments for invoice
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('id, amount, payment_method, date_paid, paid_at, receipt_number, external_ref, status')
          .eq('job_id', invoiceData.job_id)
          .eq('status', 'posted')

        setPayments(paymentsData || [])
      }

      setInvoice(invoiceData)
    } catch (err) {
      console.error('Error loading invoice detail:', err)
      toast.error('Failed to load invoice details')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Invalid date'
    }
  }

  const handleViewInvoice = async () => {
    // Canonical path resolution: prefer invoices.pdf_path, fallback to legacy fields
    const invoicePath = invoice?.pdf_path || invoice?.invoice_pdf_path || invoice?.invoice_path || null
    if (!invoicePath) {
      toast.error('Invoice PDF not available')
      return
    }
    try {
      const signedUrl = await getSignedInvoiceUrl({ invoice_path: invoicePath })
      window.open(signedUrl, '_blank', 'noopener')
    } catch (error) {
      console.error('Error viewing invoice:', error)
      toast.error('Could not access invoice')
    }
  }

  const handleDownloadInvoice = async () => {
    // Canonical path resolution: prefer invoices.pdf_path, fallback to legacy fields
    const invoicePath = invoice?.pdf_path || invoice?.invoice_pdf_path || invoice?.invoice_path || null
    if (!invoicePath) {
      toast.error('Invoice PDF not available')
      return
    }
    try {
      const signedUrl = await getSignedInvoiceUrl({ invoice_path: invoicePath })
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoice.invoice_number || invoice.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success('Invoice downloaded')
    } catch (error) {
      console.error('Error downloading invoice:', error)
      toast.error('Could not download invoice')
    }
  }

  if (loading) {
    return (
      <CustomerAppShell>
        <LoadingSkeleton count={1} />
      </CustomerAppShell>
    )
  }

  if (!invoice) {
    return (
      <CustomerAppShell>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Invoice not found</h2>
          <p className="text-slate-600 mb-4">This invoice may not exist or you don't have access to it.</p>
          <Button onClick={() => navigate('/customer/invoices')}>Back to Invoices</Button>
        </div>
      </CustomerAppShell>
    )
  }

  const isOverdue = invoice.due_date && 
    new Date(invoice.due_date) < new Date() && 
    invoice.status !== 'paid' && 
    invoice.status !== 'void'

  return (
    <CustomerAppShell>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="tertiary"
          onClick={() => navigate('/customer/invoices')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Button>

        {/* Invoice Header */}
        <Card className={isOverdue ? 'border-red-200' : ''}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                {invoice.invoice_number || `Invoice #${(invoice.id || invoice.job_id).slice(0, 8)}`}
              </h1>
              <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                {invoice.created_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Created: {formatDate(invoice.created_at)}</span>
                  </div>
                )}
                {invoice.due_date && (
                  <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                    <Calendar className="h-4 w-4" />
                    <span>Due: {formatDate(invoice.due_date)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-semibold">Total: {formatCurrency(invoice.total || 0)}</span>
                </div>
              </div>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          {isOverdue && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">This invoice is overdue.</p>
            </div>
          )}

          {/* Balance Summary */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Invoice Total:</span>
                  <span className="text-slate-900">{formatCurrency(invoice.total || 0)}</span>
                </div>
                {payments.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Paid:</span>
                    <span className="text-slate-900">
                      {formatCurrency(payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="font-semibold text-slate-900">Balance Due:</span>
                  <span className={`font-bold text-lg ${invoice.balance_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(invoice.balance_due || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Actions */}
          {(invoice?.pdf_path || invoice?.invoice_pdf_path || invoice?.invoice_path) && (
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={handleViewInvoice}>
                <FileText className="h-4 w-4 mr-2" />
                View Invoice PDF
              </Button>
              <Button variant="secondary" onClick={handleDownloadInvoice}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          )}
        </Card>

        {/* Payment History */}
        {payments.length > 0 && (
          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Payment History</h2>
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatCurrency(payment.amount)}
                    </p>
                    <p className="text-sm text-slate-600">
                      {payment.payment_method} • {formatDate(payment.paid_at || payment.date_paid)}
                    </p>
                    {payment.receipt_number && (
                      <p className="text-xs text-slate-500">Receipt: {payment.receipt_number}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Link to Job */}
        {invoice.job_id && (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Related Job</h3>
                <p className="text-sm text-slate-600">View the job details for this invoice</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => navigate(`/customer/jobs/${invoice.job_id}`)}
              >
                View Job
              </Button>
            </div>
          </Card>
        )}
      </div>
    </CustomerAppShell>
  )
}
