import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/customer/StatusBadge'
import PhotoGallery from '../../components/customer/PhotoGallery'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import Button from '../../components/ui/Button'
import FeedbackForm from '../../components/FeedbackForm'
import { getSignedInvoiceUrl } from '../../utils/signedInvoiceUrl'
import toast from 'react-hot-toast'
import { ArrowLeft, Calendar, DollarSign, FileText, Download } from 'lucide-react'

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState(null)
  const [payments, setPayments] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [rescheduleJobId, setRescheduleJobId] = useState(null)
  const [rescheduleRequestedDate, setRescheduleRequestedDate] = useState('')
  const [rescheduleNote, setRescheduleNote] = useState('')
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false)
  const [rescheduleResult, setRescheduleResult] = useState('')
  const [rescheduleError, setRescheduleError] = useState('')

  useEffect(() => {
    if (id) loadJobDetail()
  }, [id])

  async function loadJobDetail() {
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

      // Load job
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .eq('customer_id', customer.id)
        .single()

      if (jobError) throw jobError

      // Try to load invoice from invoices table
      let invoice = null
      try {
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('pdf_path, invoice_pdf_path')
          .eq('job_id', id)
          .maybeSingle()
        invoice = invoiceData
      } catch (err) {
        // Invoices table may not be accessible, that's ok
        console.warn('Could not load invoice from invoices table:', err)
      }

      // Attach invoice data to job for canonical path resolution
      setJob({ ...jobData, __invoice: invoice })

      // Load payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('id, amount, payment_method, date_paid, paid_at, receipt_number, external_ref, status, received_by')
        .eq('job_id', id)
        .eq('status', 'posted')
        .order('paid_at', { ascending: false, nullsFirst: false })

      if (paymentsData) {
        // Load received_by names
        const receivedByIds = [...new Set(paymentsData.map(p => p.received_by).filter(Boolean))]
        let profilesById = {}
        if (receivedByIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', receivedByIds)
          
          profiles?.forEach(p => {
            profilesById[p.id] = p.full_name
          })
        }

        const paymentsWithNames = paymentsData.map(p => ({
          ...p,
          received_by_name: p.received_by ? profilesById[p.received_by] : null
        }))
        setPayments(paymentsWithNames)
      }

      // Load feedback
      const { data: feedbackData } = await supabase
        .from('customer_feedback')
        .select('rating, comment')
        .eq('job_id', id)
        .eq('customer_id', customer.id)
        .maybeSingle()

      setFeedback(feedbackData || null)
    } catch (err) {
      console.error('Error loading job detail:', err)
      toast.error('Failed to load job details')
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
    const invoice = job?.__invoice
    const invoicePath = invoice?.pdf_path || invoice?.invoice_pdf_path || job?.invoice_path || null
    if (!invoicePath) {
      toast.error('Invoice not available yet')
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
    const invoice = job?.__invoice
    const invoicePath = invoice?.pdf_path || invoice?.invoice_pdf_path || job?.invoice_path || null
    if (!invoicePath) {
      toast.error('Invoice not available yet')
      return
    }
    try {
      const signedUrl = await getSignedInvoiceUrl({ invoice_path: invoicePath })
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${job.id}.pdf`
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

  const handleSubmitReschedule = async (jobId) => {
    if (!jobId) return
    if (!rescheduleRequestedDate) {
      setRescheduleError('Please select a requested date.')
      return
    }

    setRescheduleResult('')
    setRescheduleError('')
    setRescheduleSubmitting(true)

    try {
      const { data, error } = await supabase.rpc('request_job_reschedule', {
        p_job_id: jobId,
        p_requested_date: rescheduleRequestedDate,
        p_customer_note: rescheduleNote?.trim() ? rescheduleNote.trim() : null
      })

      if (error) {
        throw error
      }

      if (!data || data.ok === false) {
        setRescheduleError(data?.reason || data?.error || 'Unable to submit reschedule request right now.')
        return
      }

      setRescheduleResult('Your reschedule request was submitted for review.')
      setRescheduleJobId(null)
      setRescheduleRequestedDate('')
      setRescheduleNote('')

      await loadJobDetail()
    } catch (err) {
      console.error('Error submitting reschedule request:', err)
      const message = String(err?.message || '')
      if (message.includes('FORBIDDEN')) {
        setRescheduleError('You do not have access to request a reschedule for this job.')
      } else {
        setRescheduleError('Unable to submit reschedule request right now.')
      }
    } finally {
      setRescheduleSubmitting(false)
    }
  }

  if (loading) {
    return (
      <CustomerAppShell>
        <LoadingSkeleton count={1} />
      </CustomerAppShell>
    )
  }

  if (!job) {
    return (
      <CustomerAppShell>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Job not found</h2>
          <p className="text-slate-600 mb-4">This job may not exist or you don't have access to it.</p>
          <Button onClick={() => navigate('/customer/jobs')}>Back to Jobs</Button>
        </div>
      </CustomerAppShell>
    )
  }

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const balanceDue = Math.max((parseFloat(job.job_cost) || 0) - totalPaid, 0)
  const isCompleted = !!job.completed_at || job.status === 'completed'
  const jobStatus = String(job.status || '').toLowerCase()
  const isRescheduleEligible = Boolean(job.service_date) && !isCompleted && !['canceled', 'cancelled'].includes(jobStatus)

  return (
    <CustomerAppShell>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="tertiary"
          onClick={() => navigate('/customer/jobs')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Button>

        {/* Job Header */}
        <Card>
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                {job.services_performed || 'Job'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                {job.service_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(job.service_date)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-semibold">{formatCurrency(job.job_cost || 0)}</span>
                </div>
              </div>
            </div>
            <StatusBadge status={job.status} />
          </div>

          {job.notes && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {isRescheduleEligible && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Need a different date?</h3>
                  <p className="text-xs text-slate-500">Request a reschedule for admin approval.</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRescheduleJobId(job.id)
                    setRescheduleRequestedDate(job.service_date ? String(job.service_date).split('T')[0] : '')
                    setRescheduleNote('')
                    setRescheduleResult('')
                    setRescheduleError('')
                  }}
                  disabled={rescheduleSubmitting}
                >
                  Request Reschedule
                </Button>
              </div>

              {rescheduleResult && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {rescheduleResult} <span className="font-medium">Pending admin approval.</span>
                </div>
              )}

              {rescheduleError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {rescheduleError}
                </div>
              )}

              {rescheduleJobId === job.id && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Requested Date</label>
                    <input
                      type="date"
                      value={rescheduleRequestedDate}
                      onChange={(e) => setRescheduleRequestedDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Note (optional)</label>
                    <textarea
                      value={rescheduleNote}
                      onChange={(e) => setRescheduleNote(e.target.value)}
                      rows={3}
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="Share any scheduling preferences..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSubmitReschedule(job.id)}
                      disabled={!rescheduleRequestedDate || rescheduleSubmitting}
                    >
                      {rescheduleSubmitting ? 'Submitting...' : 'Submit Request'}
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() => {
                        setRescheduleJobId(null)
                        setRescheduleRequestedDate('')
                        setRescheduleNote('')
                      }}
                      disabled={rescheduleSubmitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Invoice Actions */}
          {isCompleted && (job?.__invoice?.pdf_path || job?.__invoice?.invoice_pdf_path || job?.invoice_path) && (
            <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
              <Button variant="secondary" onClick={handleViewInvoice}>
                <FileText className="h-4 w-4 mr-2" />
                View Invoice
              </Button>
              <Button variant="tertiary" onClick={handleDownloadInvoice}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          )}
        </Card>

        {/* Before/After Photos */}
        {(job.before_image || job.after_image) && (
          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Photos</h2>
            <PhotoGallery
              beforeImage={job.before_image}
              afterImage={job.after_image}
              jobId={job.id}
            />
          </Card>
        )}

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
                      {payment.received_by_name && ` • Received by ${payment.received_by_name}`}
                    </p>
                    {payment.receipt_number && (
                      <p className="text-xs text-slate-500">Receipt: {payment.receipt_number}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-600">Total Paid:</span>
              <span className="font-semibold text-slate-900">{formatCurrency(totalPaid)}</span>
            </div>
            {balanceDue > 0 && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-red-600">Balance Due:</span>
                <span className="font-semibold text-red-600">{formatCurrency(balanceDue)}</span>
              </div>
            )}
          </Card>
        )}

        {/* Feedback */}
        {isCompleted && (
          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Feedback</h2>
            {feedback ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">⭐</span>
                  <span className="font-medium text-slate-900">Rating: {feedback.rating}/5</span>
                </div>
                {feedback.comment && (
                  <p className="text-sm text-slate-600">{feedback.comment}</p>
                )}
              </div>
            ) : (
              <FeedbackForm job={job} onSubmit={loadJobDetail} />
            )}
          </Card>
        )}
      </div>
    </CustomerAppShell>
  )
}
