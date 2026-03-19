import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/customer/StatusBadge'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'
import { ArrowLeft, Calendar, DollarSign, Check, X } from 'lucide-react'

export default function QuoteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [quote, setQuote] = useState(null)
  const [signerName, setSignerName] = useState('')
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (id) loadQuoteDetail()
  }, [id])

  async function loadQuoteDetail() {
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

      // Try to load quote - may fail if RLS not enabled
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', id)
        .eq('customer_id', customer.id)
        .single()

      if (quoteError) {
        // If RLS not enabled, try public token approach
        console.warn('Direct quote access failed, RLS may not be enabled')
        toast.error('Quote access restricted. Please use the public quote link.')
        navigate('/customer/quotes')
        return
      }

      setQuote(quoteData)
    } catch (err) {
      console.error('Error loading quote detail:', err)
      toast.error('Failed to load quote details')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!signerName.trim()) {
      toast.error('Please enter your name')
      return
    }

    if (!quote?.public_token) {
      toast.error('Cannot accept quote - public token missing')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('respond_to_quote_public', {
        p_token: quote.public_token,
        p_action: 'accept',
        p_signer_name: signerName.trim(),
        p_comment: comment.trim() || null,
      })

      if (error) {
        if (error.message?.includes('rate_limit_exceeded')) {
          toast.error('Too many attempts — please wait a bit and try again.')
        } else {
          toast.error(error.message || 'Failed to accept quote')
        }
        return
      }

      if (data?.ok === true) {
        toast.success('Quote accepted! A job has been created.')
        loadQuoteDetail() // Refresh
      } else {
        toast.error(data?.reason || 'Failed to accept quote')
      }
    } catch (err) {
      console.error('Error accepting quote:', err)
      toast.error('Failed to accept quote')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!signerName.trim()) {
      toast.error('Please enter your name')
      return
    }

    if (!quote?.public_token) {
      toast.error('Cannot reject quote - public token missing')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('respond_to_quote_public', {
        p_token: quote.public_token,
        p_action: 'reject',
        p_signer_name: signerName.trim(),
        p_comment: comment.trim() || null,
      })

      if (error) {
        if (error.message?.includes('rate_limit_exceeded')) {
          toast.error('Too many attempts — please wait a bit and try again.')
        } else {
          toast.error(error.message || 'Failed to reject quote')
        }
        return
      }

      if (data?.ok === true) {
        toast.success('Quote rejected.')
        loadQuoteDetail() // Refresh
      } else {
        toast.error(data?.reason || 'Failed to reject quote')
      }
    } catch (err) {
      console.error('Error rejecting quote:', err)
      toast.error('Failed to reject quote')
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return null
    }
  }

  const canAcceptReject = quote?.status === 'sent' && 
    (!quote.expires_at || new Date(quote.expires_at) > new Date()) &&
    !quote.accepted_at && !quote.rejected_at

  if (loading) {
    return (
      <CustomerAppShell>
        <LoadingSkeleton count={1} />
      </CustomerAppShell>
    )
  }

  if (!quote) {
    return (
      <CustomerAppShell>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Quote not found</h2>
          <p className="text-slate-600 mb-4">This quote may not exist or you don't have access to it.</p>
          <Button onClick={() => navigate('/customer/quotes')}>Back to Quotes</Button>
        </div>
      </CustomerAppShell>
    )
  }

  return (
    <CustomerAppShell>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="tertiary"
          onClick={() => navigate('/customer/quotes')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Quotes
        </Button>

        {/* Quote Header */}
        <Card>
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                {quote.quote_number || `Quote #${quote.id.slice(0, 8)}`}
              </h1>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                {quote.created_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Created: {formatDate(quote.created_at)}</span>
                  </div>
                )}
                {quote.expires_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Expires: {formatDate(quote.expires_at)}</span>
                  </div>
                )}
              </div>
            </div>
            <StatusBadge status={quote.status} />
          </div>

          {/* Services Table */}
          {quote.services && Array.isArray(quote.services) && quote.services.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Services</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">Description</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Qty</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Rate</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.services.map((service, idx) => {
                      const qty = Math.max(0, parseFloat(service.qty) || 0)
                      const rate = Math.max(0, parseFloat(service.rate) || 0)
                      const amount = qty * rate
                      return (
                        <tr key={idx} className="border-b border-slate-100">
                          <td className="py-2 px-3 text-slate-900">{service.name || '—'}</td>
                          <td className="py-2 px-3 text-right text-slate-600">{qty}</td>
                          <td className="py-2 px-3 text-right text-slate-600">{formatCurrency(rate)}</td>
                          <td className="py-2 px-3 text-right text-slate-900 font-medium">{formatCurrency(amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="text-slate-900">{formatCurrency(quote.subtotal || 0)}</span>
                </div>
                {quote.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tax:</span>
                    <span className="text-slate-900">{formatCurrency(quote.tax || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="font-semibold text-slate-900">Total:</span>
                  <span className="font-bold text-lg" style={{ color: 'var(--brand-primary, #22c55e)' }}>
                    {formatCurrency(quote.total || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* Accept/Reject Form */}
          {canAcceptReject && (
            <Card className="bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Respond to Quote</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2"
                    style={{ focusRingColor: 'var(--brand-primary, #22c55e)' }}
                    placeholder="Enter your name"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Comment (optional)
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2"
                    style={{ focusRingColor: 'var(--brand-primary, #22c55e)' }}
                    placeholder="Add any comments or notes..."
                    disabled={submitting}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleAccept}
                    disabled={submitting || !signerName.trim()}
                    className="flex items-center gap-2"
                  >
                    <Check className="h-4 w-4" />
                    Accept Quote
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleReject}
                    disabled={submitting || !signerName.trim()}
                    className="flex items-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Reject Quote
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Status Messages */}
          {quote.status === 'accepted' && quote.accepted_at && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">This quote has been accepted.</p>
              {quote.accepted_by_name && (
                <p className="text-sm text-green-700 mt-1">Accepted by: {quote.accepted_by_name}</p>
              )}
              <p className="text-sm text-green-700">Accepted on: {formatDate(quote.accepted_at)}</p>
            </div>
          )}

          {quote.status === 'rejected' && quote.rejected_at && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">Quote rejected.</p>
              {quote.rejected_by_name && (
                <p className="text-sm text-red-700 mt-1">Rejected by: {quote.rejected_by_name}</p>
              )}
              <p className="text-sm text-red-700">Rejected on: {formatDate(quote.rejected_at)}</p>
            </div>
          )}

          {quote.converted_job_id && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-medium">This quote has been converted to a job.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/customer/jobs/${quote.converted_job_id}`)}
                className="mt-2"
              >
                View Job
              </Button>
            </div>
          )}
        </Card>
      </div>
    </CustomerAppShell>
  )
}
