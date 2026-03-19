import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import PublicLayout from '../../layouts/PublicLayout'
import * as Sentry from "@sentry/react";

// Set Sentry role tag for public quote receipt page
Sentry.setTag("role", "public");

export default function PublicQuoteReceipt() {
  const { token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [quote, setQuote] = useState(null)
  const [receiptPayload, setReceiptPayload] = useState(null)
  const [scheduleRequest, setScheduleRequest] = useState(null)

  // Check for debug mode
  const searchParams = new URLSearchParams(location.search)
  const isDebugMode = searchParams.get('debug') === '1'

  useEffect(() => {
    loadData()
  }, [token])

  function extractPayload(rawPayload) {
    if (!rawPayload) return null

    // If payload has 'quote' object, use it
    if (rawPayload.quote && typeof rawPayload.quote === 'object') {
      return rawPayload.quote
    }
    
    // Else if payload has 'data.quote', use it
    if (rawPayload.data?.quote && typeof rawPayload.data.quote === 'object') {
      return rawPayload.data.quote
    }
    
    // Else treat payload itself as the quote-ish object
    return rawPayload
  }

  async function loadData() {
    if (!token) {
      toast.error('Invalid quote link')
      setLoading(false)
      return
    }

    setLoading(true)
    
    try {
      // 1. Try to get receipt payload from location state
      let payload = location.state?.receiptPayload
      
      // 2. If not in state, try sessionStorage
      if (!payload) {
        const storageKey = `quote_public_receipt_${token}`
        const stored = sessionStorage.getItem(storageKey)
        if (stored) {
          try {
            payload = JSON.parse(stored)
          } catch (e) {
            console.error('Failed to parse stored receipt payload:', e)
          }
        }
      }

      // Extract and set receipt payload
      if (payload) {
        const extracted = extractPayload(payload)
        setReceiptPayload(extracted)
      }

      // 3. Always fetch quote from RPC as fallback/supplement
      const { data, error } = await supabase.rpc('get_quote_public', {
        p_token: token
      })

      if (error) {
        console.error('Error loading quote:', error)
        // Don't show error if we have receipt payload
        if (!payload) {
          toast.error('Failed to load quote')
        }
        setLoading(false)
        return
      }

      // Handle new JSON response format: {ok: true, quote: {...}} or {ok: false, error: '...'}
      if (!data || data.ok === false) {
        // Don't show error if we have receipt payload
        if (!payload) {
          toast.error('Quote not found or no longer available')
        }
        setLoading(false)
        return
      }

      if (data.ok === true && data.quote) {
        setQuote(data.quote)
        
        // Check for existing schedule request if quote is accepted and has job
        if (data.quote.status === 'accepted' && data.quote.converted_job_id) {
          await checkScheduleRequest()
        }
      } else if (!payload) {
        // Only show error if we don't have receipt payload
        toast.error('Invalid quote data format')
        setLoading(false)
        return
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      // Only show error if we don't have payload data
      const hasPayload = location.state?.receiptPayload || sessionStorage.getItem(`quote_public_receipt_${token}`)
      if (!hasPayload) {
        toast.error('Failed to load quote')
      }
    } finally {
      setLoading(false)
    }
  }

  async function checkScheduleRequest() {
    if (!token) return

    try {
      const { data, error } = await supabase.rpc('get_schedule_request_status_public', {
        p_token: token
      })

      if (error) {
        console.error('Error checking schedule request:', error)
        // Non-critical - continue without blocking
        return
      }

      if (data?.ok === true && data?.has_request === true) {
        setScheduleRequest({
          request_id: data.request_id,
          requested_date: data.requested_date,
          customer_note: data.customer_note,
          created_at: data.created_at
        })
      }
    } catch (err) {
      console.error('Unexpected error checking schedule request:', err)
      // Non-critical - continue without blocking
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '—'
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    } catch {
      return '—'
    }
  }

  const formatDateOnly = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '—'
      return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric'
      })
    } catch {
      return '—'
    }
  }

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'accepted':
        return 'badge-secondary'
      case 'rejected':
        return 'bg-red-100 text-red-700'
      case 'sent':
        return 'bg-blue-100 text-blue-700'
      case 'expired':
        return 'bg-amber-100 text-amber-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'accepted':
        return 'Accepted'
      case 'rejected':
        return 'Rejected'
      case 'sent':
        return 'Pending'
      case 'expired':
        return 'Expired'
      default:
        return status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading receipt...</p>
        </div>
      </div>
    )
  }

  // Use receipt payload data first, fallback to quote from RPC
  const status = receiptPayload?.status || quote?.status
  const signerName = receiptPayload?.signer_name || quote?.accepted_by_name || quote?.rejected_by_name || null
  const responseComment = receiptPayload?.comment || quote?.customer_comment || null
  const respondedAt = receiptPayload?.responded_at || quote?.accepted_at || quote?.rejected_at || quote?.updated_at || null
  const jobId = receiptPayload?.job_id || quote?.converted_job_id || null
  const hasJob = jobId !== null && jobId !== undefined

  // Get quote number and company info from quote (fallback if no payload)
  const quoteNumber = quote?.quote_number || 'N/A'
  const companyName = quote?.company_display_name || quote?.company_name || 'Your Company'
  const companyAddress = quote?.company_address

  if (!quote && !receiptPayload) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Quote Not Found</h1>
          <p className="text-slate-600">This quote is no longer available.</p>
        </Card>
      </div>
    )
  }

  return (
    <PublicLayout token={token} company={quote}>
      <div className="max-w-2xl mx-auto">

        {/* Debug Panel */}
        {isDebugMode && receiptPayload && (
          <Card className="mb-6 bg-slate-900 text-white">
            <h3 className="text-lg font-bold mb-2">DEBUG: Receipt Payload</h3>
            <pre className="text-xs overflow-auto max-h-96 bg-slate-800 p-4 rounded">
              {JSON.stringify(receiptPayload, null, 2)}
            </pre>
          </Card>
        )}

        {/* Receipt Card */}
        <Card className="mb-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Quote Response Receipt</h2>
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusBadgeClass(status)}`}>
                {getStatusDisplay(status)}
              </span>
            </div>
            <p className="text-slate-600">Quote Number: <span className="font-semibold text-slate-900">{quoteNumber}</span></p>
          </div>

          <div className="border-t border-slate-200 pt-6 space-y-4">
            {/* Status */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Status</h3>
              <p className="text-slate-900">{getStatusDisplay(status)}</p>
            </div>

            {/* Signer Name */}
            {signerName && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Signed By</h3>
                <p className="text-slate-900">{signerName}</p>
              </div>
            )}

            {/* Response Comment */}
            {responseComment && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Comment</h3>
                <p className="text-slate-600 whitespace-pre-wrap">{responseComment}</p>
              </div>
            )}

            {/* Responded At */}
            {respondedAt && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Response Date</h3>
                <p className="text-slate-900">{formatDate(respondedAt)}</p>
              </div>
            )}

            {/* Job Created */}
            {hasJob && (
              <div 
                className="mt-4 p-4 border rounded-lg"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--brand-secondary) 10%, white)",
                  borderColor: "color-mix(in srgb, var(--brand-secondary) 35%, white)"
                }}
              >
                <p className="font-semibold" style={{ color: "var(--brand-secondary)" }}>✓ Job Created</p>
                <p className="text-sm text-slate-700 mt-1">
                  A job has been created from this quote. The company will contact you soon to schedule the work.
                </p>
                {jobId && isDebugMode && (
                  <p className="text-xs text-slate-600 mt-2">Job ID: {jobId}</p>
                )}
              </div>
            )}

            {/* Schedule Request Status */}
            {hasJob && status === 'accepted' && scheduleRequest && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 font-medium">✓ Schedule Request Received</p>
                <p className="text-sm text-blue-700 mt-1">
                  Your schedule request for <strong>{formatDateOnly(scheduleRequest.requested_date)}</strong> has been received.
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  We'll confirm your schedule soon.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-6 border-t border-slate-200 flex gap-3">
            {hasJob && status === 'accepted' && !scheduleRequest && (
              <Button
                onClick={() => navigate(`/schedule/${token}`)}
                variant="primary"
                className="flex-1"
              >
                Request a Schedule Date
              </Button>
            )}
            <Button
              onClick={() => navigate(`/quote/${token}`)}
              variant="secondary"
              className={hasJob && status === 'accepted' && !scheduleRequest ? 'flex-1' : 'flex-1'}
            >
              Back to Quote
            </Button>
          </div>
        </Card>
      </div>
    </PublicLayout>
  )
}
