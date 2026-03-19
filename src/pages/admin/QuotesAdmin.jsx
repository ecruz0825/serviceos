import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { generateQuotePDF } from '../../utils/quotePdf'
import ComposeEmailModal from '../../components/ui/ComposeEmailModal'
import { getQuoteNextAction } from '../../lib/nextActionEngine'
import { getQuoteNextStep } from '../../lib/nextStepHints'
import EmptyState from '../../components/customer/EmptyState'
import { FileText } from 'lucide-react'

export default function QuotesAdmin() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [quotes, setQuotes] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [inboxTab, setInboxTab] = useState('all') // all, expiring_soon, expired, sent, accepted, rejected, viewed
  const [statusFilter, setStatusFilter] = useState('all')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [composeEmailOpen, setComposeEmailOpen] = useState(false)
  const [selectedQuoteForEmail, setSelectedQuoteForEmail] = useState(null)
  const [emailDefaults, setEmailDefaults] = useState({ to: '', subject: '', body: '' })
  const [processingQueue, setProcessingQueue] = useState(false)
  const [extendingQuoteId, setExtendingQuoteId] = useState(null)
  const [resendingQuoteId, setResendingQuoteId] = useState(null)
  const [nudgingQuoteId, setNudgingQuoteId] = useState(null)
  const [remindingQuoteId, setRemindingQuoteId] = useState(null)
  const [runningReminderSweep, setRunningReminderSweep] = useState(false)

  // Fetch quotes and customers
  useEffect(() => {
    loadData()
  }, [])

  // Handle openQuoteId query param
  useEffect(() => {
    const openQuoteId = searchParams.get('openQuoteId');
    if (openQuoteId && quotes.length > 0) {
      const quote = quotes.find(q => q.id === openQuoteId);
      if (quote) {
        // Navigate to quote detail page
        navigate(`/admin/quotes/${quote.id}`);
        // Clear the query param
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('openQuoteId');
        setSearchParams(newParams, { replace: true });
      } else {
        // Quote not found in list, try to fetch it directly
        const fetchQuote = async () => {
          try {
            const { data, error } = await supabase
              .from('quotes')
              .select('id')
              .eq('id', openQuoteId)
              .single();
            
            if (error || !data) {
              toast.error('Quote not found');
              const newParams = new URLSearchParams(searchParams);
              newParams.delete('openQuoteId');
              setSearchParams(newParams, { replace: true });
              return;
            }
            
            // Navigate to quote detail page
            navigate(`/admin/quotes/${data.id}`);
            // Clear the query param
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('openQuoteId');
            setSearchParams(newParams, { replace: true });
          } catch (err) {
            console.error('Error fetching quote:', err);
            toast.error('Failed to load quote');
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('openQuoteId');
            setSearchParams(newParams, { replace: true });
          }
        };
        
        fetchQuote();
      }
    }
  }, [quotes, searchParams, navigate, setSearchParams])

  async function loadData() {
    setLoading(true)
    try {
      // Fetch quotes (RLS will scope to company)
      const { data: quotesData, error: quotesError } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_id, total, status, valid_until, expires_at, created_at, updated_at, sent_at, converted_job_id, last_viewed_at')
        .order('created_at', { ascending: false })

      if (quotesError) {
        console.error('Error fetching quotes:', quotesError)
        setQuotes([])
      } else {
        setQuotes(quotesData || [])
      }

      // Fetch customers (RLS will scope to company)
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, full_name, email')
        .order('full_name')

      if (customersError) {
        console.error('Error fetching customers:', customersError)
        setCustomers([])
      } else {
        setCustomers(customersData || [])
      }
    } catch (err) {
      console.error('Unexpected error loading data:', err)
      setQuotes([])
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  // Build customers lookup map
  const customersById = useMemo(() => {
    const map = {}
    customers.forEach(c => {
      map[c.id] = c
    })
    return map
  }, [customers])

  // Helper: Resolve customer name (full_name || name || '—')
  const getCustomerName = (customer) => {
    if (!customer) return '—'
    return customer.full_name || customer.name || '—'
  }

  // Extend quote expiration
  const handleExtendExpiration = async (quoteId, days = 14) => {
    setExtendingQuoteId(quoteId)
    try {
      const { data, error } = await supabase.rpc('extend_quote_expiration', {
        p_quote_id: quoteId,
        p_days: days
      })

      if (error) {
        throw error
      }

      if (data?.ok === true) {
        // Optimistically update the quote in the list
        setQuotes(prevQuotes => 
          prevQuotes.map(q => 
            q.id === quoteId 
              ? { ...q, expires_at: data.expires_at }
              : q
          )
        )
        toast.success(`Quote expiration extended by ${days} days`)
      } else {
        throw new Error(data?.error || 'Failed to extend expiration')
      }
    } catch (err) {
      console.error('Error extending expiration:', err)
      toast.error(err.message || 'Failed to extend expiration')
    } finally {
      setExtendingQuoteId(null)
    }
  }

  // Resend quote email
  const handleResendQuote = async (quote) => {
    setResendingQuoteId(quote.id)
    try {
      // Get current user and profile
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('User not found')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.company_id) {
        toast.error('Company not found')
        return
      }

      // Fetch full quote data
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quote.id)
        .single()

      if (quoteError || !quoteData) {
        toast.error('Failed to load quote')
        return
      }

      // Fetch customer with email
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, full_name, email')
        .eq('id', quote.customer_id)
        .single()

      if (customerError || !customer) {
        toast.error('Customer not found')
        return
      }

      if (!customer.email) {
        toast.error('Customer email not available')
        return
      }

      // Fetch company for defaults
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('display_name, name')
        .eq('id', profile.company_id)
        .single()

      const companyName = companyData?.display_name || companyData?.name || 'Your Company'
      const customerName = customer.full_name || 'Customer'
      
      // Generate default subject
      const defaultSubject = `Quote ${quoteData.quote_number} from ${companyName}`
      
      // Generate default body
      const formatMoney = (amount) => {
        const num = Math.max(0, parseFloat(amount) || 0)
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
      const validUntil = quoteData.expires_at 
        ? formatDate(quoteData.expires_at) 
        : (quoteData.valid_until ? formatDate(quoteData.valid_until) : null)
      
      let defaultBody = `Dear ${customerName},\n\n`
      defaultBody += `Thank you for your interest in our services. Please find your quote details below:\n\n`
      defaultBody += `Quote Number: ${quoteData.quote_number}\n`
      defaultBody += `Total Amount: ${formatMoney(quoteData.total)}\n`
      if (validUntil) {
        defaultBody += `Valid Until: ${validUntil}\n`
      }
      defaultBody += `\nPlease let us know if you have any questions or would like to proceed with this quote.\n\n`
      defaultBody += `Best regards,\n${companyName}`

      // Update quote: set sent_at to now (update even if already set, to track last sent)
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', quote.id)

      if (updateError) {
        throw updateError
      }

      // Insert into quote_messages queue
      const { error: messageError } = await supabase
        .from('quote_messages')
        .insert({
          company_id: profile.company_id,
          quote_id: quote.id,
          to_email: customer.email,
          subject: defaultSubject,
          body: defaultBody,
          status: 'queued',
          created_by: user.id
        })

      if (messageError) {
        throw messageError
      }

      // Refresh quotes list
      await loadData()

      toast.success(`Quote resent to ${customer.email}`)
    } catch (err) {
      console.error('Error resending quote:', err)
      toast.error(err.message || 'Failed to resend quote')
    } finally {
      setResendingQuoteId(null)
    }
  }

  // Nudge quote (viewed no response reminder)
  const handleNudgeQuote = async (quote) => {
    setNudgingQuoteId(quote.id)
    try {
      const { data, error } = await supabase.rpc('enqueue_quote_reminder_for_quote', {
        p_quote_id: quote.id,
        p_type: 'viewed_no_response'
      })

      if (error) {
        throw error
      }

      if (data?.ok === true) {
        if (data.skipped) {
          toast.success(data.reason || 'Reminder already sent recently')
        } else {
          toast.success('Nudge reminder queued')
          // Refresh quotes to update last_reminded_at
          await loadData()
        }
      } else {
        throw new Error(data?.error || data?.reason || 'Failed to queue nudge')
      }
    } catch (err) {
      console.error('Error nudging quote:', err)
      toast.error(err.message || 'Failed to queue nudge')
    } finally {
      setNudgingQuoteId(null)
    }
  }

  // Remind quote (expiring soon reminder)
  const handleRemindQuote = async (quote) => {
    setRemindingQuoteId(quote.id)
    try {
      const { data, error } = await supabase.rpc('enqueue_quote_reminder_for_quote', {
        p_quote_id: quote.id,
        p_type: 'expiring_soon'
      })

      if (error) {
        throw error
      }

      if (data?.ok === true) {
        if (data.skipped) {
          toast.success(data.reason || 'Reminder already sent recently')
        } else {
          toast.success('Expiration reminder queued')
          // Refresh quotes to update last_reminded_at
          await loadData()
        }
      } else {
        throw new Error(data?.error || data?.reason || 'Failed to queue reminder')
      }
    } catch (err) {
      console.error('Error reminding quote:', err)
      toast.error(err.message || 'Failed to queue reminder')
    } finally {
      setRemindingQuoteId(null)
    }
  }

  // Run reminder sweep (manual trigger for automated reminders)
  const handleRunReminderSweep = async () => {
    setRunningReminderSweep(true)
    try {
      const { data, error } = await supabase.rpc('enqueue_quote_reminders', {
        p_mode: 'manual'
      })

      if (error) {
        throw error
      }

      if (data?.ok === true) {
        const expiring = data.expiring_enqueued || 0
        const viewed = data.viewed_enqueued || 0
        const skipped = data.skipped || 0
        const total = expiring + viewed
        
        if (total === 0) {
          toast.success('No eligible quotes found for reminders')
        } else {
          toast.success(
            `Reminder sweep complete: ${total} reminder(s) queued ` +
            `(${expiring} expiring, ${viewed} viewed)${skipped > 0 ? `, ${skipped} skipped` : ''}`
          )
        }
        
        // Refresh quotes to update last_reminded_at
        await loadData()
      } else {
        throw new Error(data?.error || 'Failed to run reminder sweep')
      }
    } catch (err) {
      console.error('Error running reminder sweep:', err)
      toast.error(err.message || 'Failed to run reminder sweep')
    } finally {
      setRunningReminderSweep(false)
    }
  }

  // Process email queue
  const handleProcessEmailQueue = async () => {
    setProcessingQueue(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-quote-emails', {
        method: 'POST'
      })

      if (error) {
        throw error
      }

      const result = data || {}
      const { sentCount = 0, failedCount = 0, total = 0 } = result

      if (total === 0) {
        toast.success('No queued messages to process')
      } else {
        toast.success(`Processed ${total} message(s): ${sentCount} sent, ${failedCount} failed`)
        // Reload quotes to refresh status
        loadData()
      }
    } catch (err) {
      console.error('Error processing email queue:', err)
      toast.error(err.message || 'Failed to process email queue')
    } finally {
      setProcessingQueue(false)
    }
  }

  // Helper: Compute expiration status for a quote
  const getQuoteExpirationInfo = (quote) => {
    const now = new Date()
    const expiresAt = quote.expires_at ? new Date(quote.expires_at) : null
    const isExpired = expiresAt && expiresAt < now
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const isExpiringSoon = expiresAt && expiresAt >= now && expiresAt <= threeDaysFromNow
    
    let daysUntilExpiry = null
    if (expiresAt && !isExpired) {
      const diffMs = expiresAt.getTime() - now.getTime()
      daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    }
    
    return { isExpired, isExpiringSoon, daysUntilExpiry, expiresAt }
  }

  // Filter and sort quotes based on inbox tab
  const filteredQuotes = useMemo(() => {
    const now = new Date()
    let filtered = [...quotes]

    // Apply inbox tab filter
    if (inboxTab === 'expiring_soon') {
      filtered = filtered.filter(q => {
        const { isExpiringSoon } = getQuoteExpirationInfo(q)
        return isExpiringSoon && q.status === 'sent'
      })
    } else if (inboxTab === 'expired') {
      filtered = filtered.filter(q => {
        const { isExpired } = getQuoteExpirationInfo(q)
        return isExpired || q.status === 'expired'
      })
    } else if (inboxTab === 'sent') {
      filtered = filtered.filter(q => {
        const { isExpired } = getQuoteExpirationInfo(q)
        return q.status === 'sent' && !isExpired
      })
    } else if (inboxTab === 'accepted') {
      filtered = filtered.filter(q => q.status === 'accepted' && q.converted_job_id !== null)
    } else if (inboxTab === 'rejected') {
      filtered = filtered.filter(q => q.status === 'rejected')
    } else if (inboxTab === 'viewed') {
      filtered = filtered.filter(q => {
        const { isExpired } = getQuoteExpirationInfo(q)
        return q.status === 'sent' && q.last_viewed_at !== null && !isExpired
      })
    }
    // 'all' tab shows everything (no filter)

    // Status filter (legacy, still works alongside inbox tab)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(q => q.status === statusFilter)
    }

    // Customer filter
    if (customerFilter !== 'all') {
      filtered = filtered.filter(q => q.customer_id === customerFilter)
    }

    // Search filter (quote_number)
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase()
      filtered = filtered.filter(q => 
        q.quote_number?.toLowerCase().includes(lower)
      )
    }

    // Sort based on inbox tab
    if (inboxTab === 'expiring_soon') {
      // Soonest expires first
      filtered.sort((a, b) => {
        const aExp = a.expires_at ? new Date(a.expires_at) : new Date(0)
        const bExp = b.expires_at ? new Date(b.expires_at) : new Date(0)
        return aExp.getTime() - bExp.getTime()
      })
    } else if (inboxTab === 'expired') {
      // Most recently expired first (expires_at desc)
      filtered.sort((a, b) => {
        const aExp = a.expires_at ? new Date(a.expires_at) : new Date(0)
        const bExp = b.expires_at ? new Date(b.expires_at) : new Date(0)
        return bExp.getTime() - aExp.getTime()
      })
    } else if (inboxTab === 'sent') {
      // Newest sent first (sent_at desc, fallback created_at desc)
      filtered.sort((a, b) => {
        const aDate = a.sent_at ? new Date(a.sent_at) : (a.created_at ? new Date(a.created_at) : new Date(0))
        const bDate = b.sent_at ? new Date(b.sent_at) : (b.created_at ? new Date(b.created_at) : new Date(0))
        return bDate.getTime() - aDate.getTime()
      })
    } else if (inboxTab === 'viewed') {
      // Most recently viewed first (last_viewed_at desc)
      filtered.sort((a, b) => {
        const aDate = a.last_viewed_at ? new Date(a.last_viewed_at) : new Date(0)
        const bDate = b.last_viewed_at ? new Date(b.last_viewed_at) : new Date(0)
        return bDate.getTime() - aDate.getTime()
      })
    } else {
      // Accepted/Rejected/All: updated_at desc, fallback created_at desc
      filtered.sort((a, b) => {
        const aDate = a.updated_at ? new Date(a.updated_at) : (a.created_at ? new Date(a.created_at) : new Date(0))
        const bDate = b.updated_at ? new Date(b.updated_at) : (b.created_at ? new Date(b.created_at) : new Date(0))
        return bDate.getTime() - aDate.getTime()
      })
    }

    return filtered
  }, [quotes, inboxTab, statusFilter, customerFilter, searchTerm])

  // Format currency
  const formatMoney = (amount) => {
    const num = parseFloat(amount || 0)
    if (isNaN(num)) return '$0.00'
    return `$${num.toFixed(2)}`
  }

  // Format date
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

  // Status badge colors
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700'
      case 'sent':
        return 'bg-blue-100 text-blue-700'
      case 'accepted':
        return 'bg-green-100 text-green-700'
      case 'rejected':
        return 'bg-red-100 text-red-700'
      case 'expired':
        return 'bg-amber-100 text-amber-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Create and manage customer quotes"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={handleProcessEmailQueue}
              className="btn-secondary"
              disabled={processingQueue}
            >
              {processingQueue ? 'Processing...' : 'Process Email Queue'}
            </Button>
            <Button
              onClick={() => navigate('/admin/quotes/new')}
              className="btn-accent"
            >
              New Quote
            </Button>
          </div>
        }
      />

      {/* Inbox Tabs */}
      <Card className="mb-6">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-700">Inbox:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'expiring_soon', label: 'Expiring Soon' },
                  { key: 'expired', label: 'Expired' },
                  { key: 'sent', label: 'Sent' },
                  { key: 'viewed', label: 'Viewed' },
                  { key: 'accepted', label: 'Accepted' },
                  { key: 'rejected', label: 'Rejected' }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setInboxTab(tab.key)}
                    className={`px-3 py-1 rounded-full text-sm border transition ${
                      inboxTab === tab.key
                        ? 'bg-blue-100 text-blue-700 font-medium border-blue-400'
                        : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleRunReminderSweep}
              className="btn-secondary text-sm"
              disabled={runningReminderSweep}
            >
              {runningReminderSweep ? 'Running...' : 'Run Reminder Sweep'}
            </Button>
          </div>
        </div>

        {/* Quick Filter Chips (Legacy Status Filter) */}
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-700">Status Filter:</span>
            <div className="flex flex-wrap gap-2">
              {['all', 'draft', 'sent', 'accepted', 'rejected', 'expired'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1 rounded-full text-sm border transition ${
                    statusFilter === filter
                      ? 'bg-slate-200 font-medium border-slate-400'
                      : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer
            </label>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Customers</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {getCustomerName(customer)}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Search Quote #
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Q-0001"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Card>

      {/* Quotes Table */}
      {loading ? (
        <Card>
          <div className="text-center py-8 text-slate-500">Loading quotes...</div>
        </Card>
      ) : filteredQuotes.length === 0 ? (
        <Card>
          {quotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotes yet"
              description="Create your first quote to send pricing to customers. Quotes can be converted to jobs once accepted."
              actionLabel="Create Your First Quote"
              onAction={() => navigate('/admin/quotes/new')}
            />
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>No quotes match these filters.</p>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Quote #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Expires</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Created</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Next Action</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredQuotes.map(quote => {
                  const customer = customersById[quote.customer_id]
                  const { isExpired, isExpiringSoon, daysUntilExpiry } = getQuoteExpirationInfo(quote)
                  const expiresAt = quote.expires_at || quote.valid_until
                  
                  return (
                    <tr key={quote.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(`/admin/quotes/${quote.id}`)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {quote.quote_number}
                          </button>
                          {isExpiringSoon && daysUntilExpiry !== null && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                              Expires in {daysUntilExpiry}d
                            </span>
                          )}
                          {isExpired && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              Expired
                            </span>
                          )}
                          {quote.last_viewed_at && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700" title={`Viewed: ${formatDate(quote.last_viewed_at)}`}>
                              Viewed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {getCustomerName(customer)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {formatMoney(quote.total)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(quote.status)}`}>
                            {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {getQuoteNextStep(quote)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {expiresAt ? formatDate(expiresAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(quote.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const nextAction = getQuoteNextAction(quote)
                          if (!nextAction) return null
                          return (
                            <Button
                              variant={nextAction.kind === 'primary' ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => {
                                if (nextAction.route) {
                                  navigate(nextAction.route)
                                } else if (nextAction.key === 'send_quote') {
                                  navigate(`/admin/quotes/${quote.id}`)
                                } else if (nextAction.key === 'resend_quote' || nextAction.key === 'send_reminder') {
                                  handleResendQuote(quote)
                                } else if (nextAction.key === 'convert_to_job') {
                                  navigate(`/admin/quotes/${quote.id}`)
                                }
                              }}
                              className="text-xs"
                            >
                              {nextAction.label}
                            </Button>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(`/admin/quotes/${quote.id}`)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            title="View quote details"
                          >
                            View
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => navigate(`/admin/quotes/${quote.id}?edit=1`)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            title="Edit quote"
                          >
                            Edit
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={async () => {
                              try {
                                // Fetch full quote data
                                const { data: quoteData, error: quoteError } = await supabase
                                  .from('quotes')
                                  .select('*')
                                  .eq('id', quote.id)
                                  .single()

                                if (quoteError || !quoteData) {
                                  toast.error('Failed to load quote')
                                  return
                                }

                                // Fetch customer
                                const customer = customersById[quote.customer_id]
                                if (!customer) {
                                  toast.error('Customer not found')
                                  return
                                }

                                // Fetch company
                                const { data: { user } } = await supabase.auth.getUser()
                                if (!user) {
                                  toast.error('User not found')
                                  return
                                }

                                const { data: profile } = await supabase
                                  .from('profiles')
                                  .select('company_id')
                                  .eq('id', user.id)
                                  .single()

                                if (!profile?.company_id) {
                                  toast.error('Company not found')
                                  return
                                }

                                const { data: companyData, error: companyError } = await supabase
                                  .from('companies')
                                  .select('id, name, display_name, address, support_phone, support_email, logo_path')
                                  .eq('id', profile.company_id)
                                  .single()

                                if (companyError || !companyData) {
                                  toast.error('Failed to load company information')
                                  return
                                }

                                await generateQuotePDF(quoteData, customer, companyData)
                                toast.success('Quote PDF generated')
                              } catch (err) {
                                console.error('Error generating PDF:', err)
                                toast.error(err.message || 'Failed to generate PDF')
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            title="Generate PDF"
                          >
                            PDF
                          </button>
                          <span className="text-slate-300">|</span>
                          {quote.status === 'accepted' && quote.converted_job_id ? (
                            <button
                              onClick={() => navigate(`/admin/jobs?openJobId=${quote.converted_job_id}`)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                              title="Open job created from this quote"
                            >
                              Open Job
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                // Navigate to quote detail page where conversion can happen
                                navigate(`/admin/quotes/${quote.id}`)
                              }}
                              disabled={quote.status !== 'accepted' || !!quote.converted_job_id}
                              className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              title={
                                quote.status !== 'accepted'
                                  ? 'Quote must be accepted before converting to job'
                                  : quote.converted_job_id
                                  ? 'Job already created from this quote'
                                  : 'Convert quote to job'
                              }
                            >
                              Convert to Job
                            </button>
                          )}
                          <span className="text-slate-300">|</span>
                          {quote.status === 'sent' && (
                            <>
                              <button
                                onClick={() => handleExtendExpiration(quote.id, 14)}
                                disabled={extendingQuoteId === quote.id}
                                className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Extend expiration by 14 days"
                              >
                                {extendingQuoteId === quote.id ? 'Extending...' : 'Extend 14d'}
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                onClick={() => handleResendQuote(quote)}
                                disabled={resendingQuoteId === quote.id}
                                className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Resend quote email"
                              >
                                {resendingQuoteId === quote.id ? 'Resending...' : 'Resend'}
                              </button>
                              <span className="text-slate-300">|</span>
                              {quote.last_viewed_at && !isExpired && (
                                <>
                                  <button
                                    onClick={() => handleNudgeQuote(quote)}
                                    disabled={nudgingQuoteId === quote.id}
                                    className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Send follow-up reminder (viewed but no response)"
                                  >
                                    {nudgingQuoteId === quote.id ? 'Nudging...' : 'Nudge'}
                                  </button>
                                  <span className="text-slate-300">|</span>
                                </>
                              )}
                              {isExpiringSoon && (
                                <>
                                  <button
                                    onClick={() => handleRemindQuote(quote)}
                                    disabled={remindingQuoteId === quote.id}
                                    className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Send expiration reminder"
                                  >
                                    {remindingQuoteId === quote.id ? 'Reminding...' : 'Reminder'}
                                  </button>
                                  <span className="text-slate-300">|</span>
                                </>
                              )}
                            </>
                          )}
                          {quote.status === 'expired' && (
                            <>
                              <button
                                onClick={() => handleExtendExpiration(quote.id, 14)}
                                disabled={extendingQuoteId === quote.id}
                                className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Extend expiration by 14 days"
                              >
                                {extendingQuoteId === quote.id ? 'Extending...' : 'Extend 14d'}
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                onClick={() => handleResendQuote(quote)}
                                disabled={resendingQuoteId === quote.id}
                                className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Resend quote email"
                              >
                                {resendingQuoteId === quote.id ? 'Resending...' : 'Resend'}
                              </button>
                              <span className="text-slate-300">|</span>
                            </>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                // Get current user and profile
                                const { data: { user } } = await supabase.auth.getUser()
                                if (!user) {
                                  toast.error('User not found')
                                  return
                                }

                                const { data: profile, error: profileError } = await supabase
                                  .from('profiles')
                                  .select('company_id')
                                  .eq('id', user.id)
                                  .single()

                                if (profileError || !profile?.company_id) {
                                  toast.error('Company not found')
                                  return
                                }

                                // Fetch full quote data
                                const { data: quoteData, error: quoteError } = await supabase
                                  .from('quotes')
                                  .select('*')
                                  .eq('id', quote.id)
                                  .single()

                                if (quoteError || !quoteData) {
                                  toast.error('Failed to load quote')
                                  return
                                }

                                // Fetch customer with email
                                const { data: customer, error: customerError } = await supabase
                                  .from('customers')
                                  .select('id, full_name, email')
                                  .eq('id', quote.customer_id)
                                  .single()

                                if (customerError || !customer) {
                                  toast.error('Customer not found')
                                  return
                                }

                                // Fetch company for defaults
                                const { data: companyData, error: companyError } = await supabase
                                  .from('companies')
                                  .select('display_name, name')
                                  .eq('id', profile.company_id)
                                  .single()

                                const companyName = companyData?.display_name || companyData?.name || 'Your Company'
                                const customerName = customer.full_name || 'Customer'
                                const toEmail = customer.email || ''
                                
                                // Generate default subject
                                const defaultSubject = `Quote ${quoteData.quote_number} from ${companyName}`
                                
                                // Generate default body
                                const formatMoney = (amount) => {
                                  const num = Math.max(0, parseFloat(amount) || 0)
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
                                const validUntil = quoteData.expires_at 
                                  ? formatDate(quoteData.expires_at) 
                                  : (quoteData.valid_until ? formatDate(quoteData.valid_until) : null)
                                
                                let defaultBody = `Dear ${customerName},\n\n`
                                defaultBody += `Thank you for your interest in our services. Please find your quote details below:\n\n`
                                defaultBody += `Quote Number: ${quoteData.quote_number}\n`
                                defaultBody += `Total Amount: ${formatMoney(quoteData.total)}\n`
                                if (validUntil) {
                                  defaultBody += `Valid Until: ${validUntil}\n`
                                }
                                defaultBody += `\nPlease let us know if you have any questions or would like to proceed with this quote.\n\n`
                                defaultBody += `Best regards,\n${companyName}`

                                // Set defaults and open modal
                                setEmailDefaults({
                                  to: toEmail,
                                  subject: defaultSubject,
                                  body: defaultBody
                                })
                                setSelectedQuoteForEmail({ quote: quoteData, customer, profile, user })
                                setComposeEmailOpen(true)
                              } catch (err) {
                                console.error('Error preparing email:', err)
                                toast.error(err.message || 'Failed to prepare email')
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Send
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Compose Email Modal */}
      <ComposeEmailModal
        open={composeEmailOpen}
        to={emailDefaults.to}
        subject={emailDefaults.subject}
        body={emailDefaults.body}
        onCancel={() => {
          setComposeEmailOpen(false)
          setSelectedQuoteForEmail(null)
        }}
        onConfirm={async (to, subject, body) => {
          if (!selectedQuoteForEmail) return

          try {
            const { quote, profile, user } = selectedQuoteForEmail

            // Update quote: set status='sent' and sent_at (only if not already set)
            const updateData = {
              status: 'sent'
            }
            if (!quote.sent_at) {
              updateData.sent_at = new Date().toISOString()
            }

            const { error: updateError } = await supabase
              .from('quotes')
              .update(updateData)
              .eq('id', quote.id)

            if (updateError) {
              throw updateError
            }

            // Insert into quote_messages
            const { error: messageError } = await supabase
              .from('quote_messages')
              .insert({
                company_id: profile.company_id,
                quote_id: quote.id,
                to_email: to,
                subject: subject,
                body: body || null,
                status: 'queued',
                created_by: user.id
              })

            if (messageError) {
              throw messageError
            }

            // Refresh quotes list
            await loadData()

            setComposeEmailOpen(false)
            setSelectedQuoteForEmail(null)
            toast.success('Email queued')
          } catch (err) {
            console.error('Error queueing email:', err)
            toast.error(err.message || 'Failed to queue email')
          }
        }}
        loading={false}
      />
    </div>
  )
}

