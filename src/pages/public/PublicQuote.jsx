import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import PublicLayout from '../../layouts/PublicLayout'
import * as Sentry from "@sentry/react";

// Set Sentry role tag for public quote page
Sentry.setTag("role", "public");

function PublicQuoteContent({ quote, loading }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [comment, setComment] = useState('')
  const [rateLimitCooldown, setRateLimitCooldown] = useState(false)

  async function handleAccept() {
    if (!signerName.trim()) {
      toast.error('Please enter your name')
      return
    }

    if (submitting) return // Prevent double-submit

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('respond_to_quote_public', {
        p_token: token,
        p_action: 'accept',
        p_signer_name: signerName.trim(),
        p_comment: comment.trim() || null
      })

      if (error) {
        console.error('Error accepting quote:', error)
        // Check for rate limit error
        if (error.message && error.message.includes('rate_limit_exceeded')) {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
        } else {
          toast.error(error.message || 'Failed to accept quote')
        }
        setSubmitting(false)
        return
      }

      // Handle new JSON response format
      if (data?.ok === true) {
        // Create receipt payload with RPC response + input params
        const receiptPayload = {
          ...data,
          signer_name: signerName.trim(),
          comment: comment.trim() || null,
          responded_at: new Date().toISOString()
        }
        
        // Store in sessionStorage
        const storageKey = `quote_public_receipt_${token}`
        sessionStorage.setItem(storageKey, JSON.stringify(receiptPayload))
        
        toast.success('Quote accepted! A job has been created.')
        // Redirect to receipt page with payload in state
        navigate(`/quote/${token}/receipt`, { state: { receiptPayload } })
      } else if (data?.ok === false) {
        // Handle error responses
        if (data.error === 'expired') {
          toast.error('This quote has expired. Please contact us to request an updated quote.')
        } else if (data.error === 'already_responded') {
          // Already responded - navigate to receipt to show the response
          const receiptPayload = {
            ...data,
            signer_name: signerName.trim(),
            comment: comment.trim() || null,
            responded_at: new Date().toISOString()
          }
          const storageKey = `quote_public_receipt_${token}`
          sessionStorage.setItem(storageKey, JSON.stringify(receiptPayload))
          navigate(`/quote/${token}/receipt`, { state: { receiptPayload } })
        } else {
          // Generic error
          const errorMsg = data.reason || data.error || 'Unable to submit response'
          toast.error(errorMsg)
        }
      } else {
        // Fallback for unexpected response format
        toast.error('Failed to accept quote')
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      toast.error('Failed to accept quote')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!signerName.trim()) {
      toast.error('Please enter your name')
      return
    }

    if (submitting) return // Prevent double-submit

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('respond_to_quote_public', {
        p_token: token,
        p_action: 'reject',
        p_signer_name: signerName.trim(),
        p_comment: comment.trim() || null
      })

      if (error) {
        console.error('Error rejecting quote:', error)
        // Check for rate limit error
        if (error.message && error.message.includes('rate_limit_exceeded')) {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
        } else {
          toast.error(error.message || 'Failed to reject quote')
        }
        setSubmitting(false)
        return
      }

      // Handle new JSON response format
      if (data?.ok === true) {
        // Create receipt payload with RPC response + input params
        const receiptPayload = {
          ...data,
          signer_name: signerName.trim(),
          comment: comment.trim() || null,
          responded_at: new Date().toISOString()
        }
        
        // Store in sessionStorage
        const storageKey = `quote_public_receipt_${token}`
        sessionStorage.setItem(storageKey, JSON.stringify(receiptPayload))
        
        toast.success('Quote rejected.')
        // Redirect to receipt page with payload in state
        navigate(`/quote/${token}/receipt`, { state: { receiptPayload } })
      } else if (data?.ok === false) {
        // Handle error responses
        if (data.error === 'rate_limit_exceeded') {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
        } else if (data.error === 'expired') {
          toast.error('This quote has expired. Please contact us to request an updated quote.')
        } else if (data.error === 'already_responded') {
          // Already responded - navigate to receipt to show the response
          const receiptPayload = {
            ...data,
            signer_name: signerName.trim(),
            comment: comment.trim() || null,
            responded_at: new Date().toISOString()
          }
          const storageKey = `quote_public_receipt_${token}`
          sessionStorage.setItem(storageKey, JSON.stringify(receiptPayload))
          navigate(`/quote/${token}/receipt`, { state: { receiptPayload } })
        } else {
          // Generic error
          const errorMsg = data.reason || data.error || 'Unable to submit response'
          toast.error(errorMsg)
        }
      } else {
        // Fallback for unexpected response format
        toast.error('Failed to reject quote')
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      toast.error('Failed to reject quote')
    } finally {
      setSubmitting(false)
    }
  }

  const formatMoney = (amount) => {
    const num = parseFloat(amount || 0)
    if (isNaN(num)) return '$0.00'
    return `$${num.toFixed(2)}`
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '—'
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return '—'
    }
  }

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'sent':
        return 'bg-blue-100 text-blue-700'
      case 'accepted':
        return 'badge-secondary'
      case 'rejected':
        return 'bg-red-100 text-red-700'
      case 'expired':
        return 'bg-amber-100 text-amber-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading quote...</p>
        </div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Quote Not Found</h1>
          <p className="text-slate-600">This quote is no longer available.</p>
        </Card>
      </div>
    )
  }

  // Compute expiration: prefer expires_at (timestamptz), fallback to valid_until (date)
  const now = new Date()
  let isExpired = false
  if (quote.expires_at) {
    const expiresAt = new Date(quote.expires_at)
    isExpired = now > expiresAt
  } else if (quote.valid_until) {
    // valid_until is a date, compare with current date (not time)
    const validUntil = new Date(quote.valid_until)
    validUntil.setHours(23, 59, 59, 999) // End of day
    isExpired = now > validUntil
  }
  
  const canAcceptReject = quote.status === 'sent' && !isExpired
  const isAccepted = quote.status === 'accepted'
  const isRejected = quote.status === 'rejected'

  return (
    <>
      {/* Quote Card */}
        <Card className="mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Quote {quote.quote_number}</h2>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${isExpired ? getStatusBadgeClass('expired') : getStatusBadgeClass(quote.status)}`}>
                  {isExpired ? 'Expired' : (quote.status.charAt(0).toUpperCase() + quote.status.slice(1))}
                </span>
                {!isExpired && (quote.expires_at || quote.valid_until) && (
                  <span className="text-sm text-slate-600">
                    Valid until: {formatDate(quote.expires_at || quote.valid_until)}
                  </span>
                )}
                {isExpired && (quote.expires_at || quote.valid_until) && (
                  <span className="text-sm text-amber-600">
                    Expired: {formatDate(quote.expires_at || quote.valid_until)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{formatMoney(quote.total)}</div>
              <div className="text-sm text-slate-600">Total</div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Bill To</h3>
            <p className="text-slate-900">{quote.customer_full_name || 'Customer'}</p>
            {quote.customer_email && (
              <p className="text-sm text-slate-600">{quote.customer_email}</p>
            )}
          </div>

          {/* Services Table */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Services</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Description</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Qty</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Rate</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.services && Array.isArray(quote.services) && quote.services.map((service, idx) => {
                    const qty = Math.max(0, parseFloat(service.qty) || 0)
                    const rate = Math.max(0, parseFloat(service.rate) || 0)
                    const amount = qty * rate
                    return (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-900">{service.name || '—'}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{qty}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{formatMoney(rate)}</td>
                        <td className="py-2 px-3 text-right text-slate-900 font-medium">{formatMoney(amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <div className="flex justify-end">
              <div className="w-64">
                <div className="flex justify-between py-2">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="text-slate-900">{formatMoney(quote.subtotal)}</span>
                </div>
                {quote.tax > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Tax:</span>
                    <span className="text-slate-900">{formatMoney(quote.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-900">Total:</span>
                  <span className="font-bold text-lg text-slate-900">{formatMoney(quote.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes</h3>
              <p className="text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* Status Messages */}
          {isAccepted && (
            <div 
              className="mb-6 p-4 border rounded-lg"
              style={{
                backgroundColor: "color-mix(in srgb, var(--brand-secondary) 10%, white)",
                borderColor: "color-mix(in srgb, var(--brand-secondary) 35%, white)"
              }}
            >
              <p className="font-semibold" style={{ color: "var(--brand-secondary)" }}>This quote has been accepted.</p>
              {quote.accepted_by_name && (
                <p className="text-sm text-slate-700 mt-1">Accepted by: {quote.accepted_by_name}</p>
              )}
              {quote.accepted_at && (
                <p className="text-sm text-slate-700">Accepted on: {formatDate(quote.accepted_at)}</p>
              )}
            </div>
          )}

          {isRejected && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">Quote rejected.</p>
              {quote.rejected_by_name && (
                <p className="text-sm text-red-700 mt-1">Rejected by: {quote.rejected_by_name}</p>
              )}
              {quote.rejected_at && (
                <p className="text-sm text-red-700">Rejected on: {formatDate(quote.rejected_at)}</p>
              )}
            </div>
          )}

          {isExpired && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800 font-medium">This quote has expired.</p>
              <p className="text-sm text-amber-700 mt-1">
                This quote has expired. Please contact us to request an updated quote.
              </p>
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add any comments or notes..."
                    disabled={submitting}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleAccept}
                    variant="primary"
                    disabled={submitting || !signerName.trim() || isExpired || rateLimitCooldown}
                    className="flex-1"
                  >
                    {submitting ? 'Processing...' : rateLimitCooldown ? 'Please wait...' : 'Accept Quote'}
                  </Button>
                  <Button
                    onClick={handleReject}
                    variant="secondary"
                    disabled={submitting || !signerName.trim() || isExpired || rateLimitCooldown}
                    className="flex-1"
                  >
                    {submitting ? 'Processing...' : rateLimitCooldown ? 'Please wait...' : 'Reject Quote'}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </Card>
    </>
  )
}

export default function PublicQuote() {
  const { token } = useParams()
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setLoadError('Invalid quote link.')
      return
    }

    const loadQuote = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const { data, error } = await supabase.rpc('get_quote_public', {
          p_token: token
        })

        if (error) {
          console.error('Error loading quote:', error)
          // Check for rate limit error
          if (error.message && error.message.includes('rate_limit_exceeded')) {
            toast.error('Too many attempts — please wait a bit and try again.')
          } else {
            toast.error('Failed to load quote')
            setLoadError('Could not load quote. Please try again.')
          }
          setQuote(null)
          setLoading(false)
          return
        }

        // Handle new JSON response format: {ok: true, quote: {...}} or {ok: false, error: '...'}
        if (!data || data.ok === false) {
          // Check for rate limit error
          if (data?.error === 'rate_limit_exceeded') {
            toast.error('Too many attempts — please wait a bit and try again.')
          } else {
            toast.error('Quote not found or no longer available')
            setLoadError('Quote not found or no longer available.')
          }
          setQuote(null)
          setLoading(false)
          return
        }

        if (data.ok === true && data.quote) {
          setQuote(data.quote)
          
          // Mark quote as viewed (fire-and-forget, don't block UI)
          supabase.rpc('mark_quote_viewed_public', { p_token: token })
            .then(({ error }) => {
              if (error) {
                console.error('Error marking quote as viewed:', error)
                // Silently fail - this is not critical
              }
            })
            .catch((err) => {
              console.error('Unexpected error marking quote as viewed:', err)
              // Silently fail - this is not critical
            })
        } else {
          toast.error('Invalid quote data format')
          setLoadError('Invalid quote data format.')
          setQuote(null)
        }
      } catch (err) {
        console.error('Unexpected error:', err)
        toast.error('Failed to load quote')
        setLoadError('Could not load quote right now. Please retry.')
        setQuote(null)
      } finally {
        setLoading(false)
      }
    }

    loadQuote()
  }, [token, reloadToken])

  return (
    <PublicLayout token={token} company={quote}>
      {loadError && !loading && (
        <Card className="mb-4 border border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-900">{loadError}</p>
            <Button variant="secondary" onClick={() => setReloadToken((prev) => prev + 1)}>
              Retry
            </Button>
          </div>
        </Card>
      )}
      <PublicQuoteContent quote={quote} loading={loading} />
    </PublicLayout>
  )
}
