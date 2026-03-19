import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import { parseISO, format } from 'date-fns'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import PublicLayout from '../../layouts/PublicLayout'
import * as Sentry from "@sentry/react";

// Set Sentry role tag for public schedule request page
Sentry.setTag("role", "public");

export default function PublicJobScheduleRequest() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [quote, setQuote] = useState(null)
  const [requestedDate, setRequestedDate] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [requestSubmitted, setRequestSubmitted] = useState(false)
  const [submittedDate, setSubmittedDate] = useState(null)
  const [existingRequest, setExistingRequest] = useState(null)
  const [jobAlreadyScheduled, setJobAlreadyScheduled] = useState(false)
  const [rateLimitCooldown, setRateLimitCooldown] = useState(false)

  useEffect(() => {
    loadQuote()
  }, [token])

  async function loadQuote() {
    if (!token) {
      toast.error('Invalid schedule request link')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_quote_public', {
        p_token: token
      })

      if (error) {
        console.error('Error loading quote:', error)
        // Check for rate limit error
        if (error.message && error.message.includes('rate_limit_exceeded')) {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
        } else {
          toast.error('Failed to load quote')
        }
        setLoading(false)
        return
      }

      // Handle JSON response format: {ok: true, quote: {...}} or {ok: false, error: '...'}
      if (!data || data.ok === false) {
        // Check for rate limit error
        if (data?.error === 'rate_limit_exceeded') {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
        } else {
          toast.error('Quote not found or no longer available')
        }
        setLoading(false)
        return
      }

      if (data.ok === true && data.quote) {
        setQuote(data.quote)
        
        // Validate quote is accepted and has job
        if (data.quote.status !== 'accepted' || !data.quote.converted_job_id) {
          // Will show message in UI
        } else {
          // Check if an open schedule request already exists
          await checkExistingRequest()
        }
      } else {
        toast.error('Invalid quote data format')
        setLoading(false)
        return
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      toast.error('Failed to load quote')
    } finally {
      setLoading(false)
    }
  }

  async function checkExistingRequest() {
    if (!token) return

    try {
      const { data, error } = await supabase.rpc('get_schedule_request_status_public', {
        p_token: token
      })

      if (error) {
        console.error('Error checking existing request:', error)
        // Non-critical - continue without blocking
        return
      }

      if (data?.ok === true && data?.has_request === true) {
        setExistingRequest({
          request_id: data.request_id,
          requested_date: data.requested_date,
          customer_note: data.customer_note,
          created_at: data.created_at
        })
        setRequestSubmitted(true)
        setSubmittedDate(data.requested_date)
      }
    } catch (err) {
      console.error('Unexpected error checking request:', err)
      // Non-critical - continue without blocking
    }
  }

  async function handleSubmitRequest() {
    if (!requestedDate) {
      toast.error('Please select a date')
      return
    }

    if (submitting) return // Prevent double-submit

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('request_job_schedule_public', {
        p_token: token,
        p_requested_date: requestedDate,
        p_customer_note: customerNote.trim() || null
      })

      if (error) {
        console.error('Error submitting schedule request:', error)
        // Check for rate limit error
        if (error.message && error.message.includes('rate_limit_exceeded')) {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
        } else {
          toast.error(error.message || 'Failed to submit schedule request')
        }
        setSubmitting(false)
        return
      }

      // Handle JSON response format
      if (!data || data.ok === false) {
        // Check for rate limit error
        if (data?.error === 'rate_limit_exceeded') {
          toast.error('Too many attempts — please wait a bit and try again.')
          setRateLimitCooldown(true)
          setTimeout(() => setRateLimitCooldown(false), 10000) // 10 second cooldown
          setSubmitting(false)
          return
        }
        
        // Check for job_already_scheduled error
        if (data?.error === 'job_already_scheduled') {
          setJobAlreadyScheduled(true)
          setSubmitting(false)
          return
        }
        
        const reason = data?.reason || 'Unknown error'
        toast.error(data?.error || reason)
        setSubmitting(false)
        return
      }

      // Handle idempotent response (already_exists = true)
      if (data.already_exists === true) {
        toast.success('Request already received — we\'ll confirm soon.')
        setRequestSubmitted(true)
        setSubmittedDate(data.requested_date)
        setExistingRequest({
          request_id: data.request_id,
          requested_date: data.requested_date
        })
      } else {
        // New request created
        toast.success('Schedule request submitted')
        setRequestSubmitted(true)
        setSubmittedDate(data.requested_date)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      toast.error('Failed to submit schedule request')
    } finally {
      setSubmitting(false)
    }
  }

  // Format date-only strings (YYYY-MM-DD) without timezone shifts
  const formatDateOnly = (dateStr) => {
    if (!dateStr) return '—'
    try {
      return format(parseISO(dateStr), 'MMMM d, yyyy')
    } catch {
      return dateStr
    }
  }

  const formatServices = (services) => {
    if (!services) return '—'
    try {
      const servicesArray = Array.isArray(services) ? services : JSON.parse(services)
      if (Array.isArray(servicesArray) && servicesArray.length > 0) {
        return servicesArray
          .map(s => s.name || s.service || s)
          .filter(Boolean)
          .join(', ')
      }
    } catch {
      // If parsing fails, return as string or fallback
    }
    return '—'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Quote Not Found</h1>
          <p className="text-slate-600">This quote is no longer available.</p>
        </Card>
      </div>
    )
  }

  // Check if scheduling is available
  const canSchedule = quote.status === 'accepted' && quote.converted_job_id !== null

  return (
    <PublicLayout token={token} company={quote}>
      <div className="max-w-2xl mx-auto">
        <Card>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Request Schedule Date</h2>
          
          {!canSchedule ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-amber-800 font-medium">Scheduling isn't available yet.</p>
                <p className="text-sm text-amber-700 mt-1">
                  {quote.status !== 'accepted' 
                    ? 'Please accept the quote first before requesting a schedule date.'
                    : 'The job has not been created yet. Please wait for the company to process your quote acceptance.'}
                </p>
              </div>
              <Button
                onClick={() => navigate(`/quote/${token}`)}
                variant="secondary"
                className="w-full"
              >
                Back to Quote
              </Button>
            </div>
          ) : jobAlreadyScheduled ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 font-medium">Job Already Scheduled</p>
                <p className="text-sm text-blue-700 mt-1">
                  This job is already scheduled. If you need changes, please contact us.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Quote Summary</p>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="font-medium">Quote #:</span> {quote.quote_number}</p>
                  <p><span className="font-medium">Services:</span> {formatServices(quote.services)}</p>
                  <p><span className="font-medium">Total:</span> ${(quote.total || 0).toFixed(2)}</p>
                </div>
              </div>
              <Button
                onClick={() => navigate(`/quote/${token}`)}
                variant="secondary"
                className="w-full"
              >
                Back to Quote
              </Button>
            </div>
          ) : requestSubmitted || existingRequest ? (
            <div className="space-y-4">
              <div 
                className="p-4 border rounded-lg"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--brand-secondary) 10%, white)",
                  borderColor: "color-mix(in srgb, var(--brand-secondary) 35%, white)"
                }}
              >
                <p className="font-semibold" style={{ color: "var(--brand-secondary)" }}>✓ Request Received</p>
                <p className="text-sm text-slate-700 mt-1">
                  Your schedule request for <strong>{formatDateOnly(submittedDate || existingRequest?.requested_date)}</strong> has been received.
                </p>
                {existingRequest && (
                  <p className="text-xs text-slate-600 mt-1">
                    Request submitted on {formatDateOnly(existingRequest.created_at)}
                  </p>
                )}
                <p className="text-sm text-slate-700 mt-2">
                  We'll confirm your schedule soon.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Quote Summary</p>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="font-medium">Quote #:</span> {quote.quote_number}</p>
                  <p><span className="font-medium">Services:</span> {formatServices(quote.services)}</p>
                  <p><span className="font-medium">Total:</span> ${(quote.total || 0).toFixed(2)}</p>
                </div>
              </div>
              <Button
                onClick={() => navigate(`/quote/${token}`)}
                variant="secondary"
                className="w-full"
              >
                Back to Quote
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quote Summary */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-sm font-semibold text-slate-700 mb-2">Quote Summary</p>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="font-medium">Quote #:</span> {quote.quote_number}</p>
                  <p><span className="font-medium">Services:</span> {formatServices(quote.services)}</p>
                  <p><span className="font-medium">Total:</span> ${(quote.total || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Date Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Preferred Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} // Prevent past dates
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Select your preferred date for the service
                </p>
              </div>

              {/* Customer Note */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  rows={4}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Any special instructions or preferences..."
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-3">
                <Button
                  onClick={() => navigate(`/quote/${token}`)}
                  variant="tertiary"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitRequest}
                  variant="primary"
                  className="flex-1"
                  disabled={!requestedDate || submitting || rateLimitCooldown}
                >
                  {submitting ? 'Submitting...' : rateLimitCooldown ? 'Please wait...' : 'Submit Request'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </PublicLayout>
  )
}

