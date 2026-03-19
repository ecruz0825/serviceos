import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { generateQuotePDF } from '../../utils/quotePdf'
import ComposeEmailModal from '../../components/ui/ComposeEmailModal'
import { getQuoteNextStep } from '../../lib/nextStepHints'

export default function QuoteBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isEdit = searchParams.get('edit') === '1'
  const isNew = !id
  const mode = isNew ? 'new' : (isEdit ? 'edit' : 'view')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [customers, setCustomers] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [teams, setTeams] = useState([])
  const [quoteStatus, setQuoteStatus] = useState(null)
  const [composeEmailOpen, setComposeEmailOpen] = useState(false)
  const [emailDefaults, setEmailDefaults] = useState({ to: '', subject: '', body: '' })
  const [emailContext, setEmailContext] = useState(null)
  const [quoteMetadata, setQuoteMetadata] = useState({
    created_at: null,
    sent_at: null,
    accepted_at: null,
    rejected_at: null,
    accepted_by_name: null,
    rejected_by_name: null,
    customer_comment: null,
    public_token: null,
    converted_job_id: null,
    quote_number: null
  })
  const [formData, setFormData] = useState({
    customer_id: '',
    services: [{ name: '', qty: 1, rate: 0 }],
    tax: 0,
    valid_until: '',
    notes: ''
  })

  // Load customers and existing quote
  useEffect(() => {
    loadData()
  }, [id])

  // Handle customer_id from query params for new quotes
  useEffect(() => {
    if (isNew) {
      const customerIdParam = searchParams.get('customer_id')
      if (customerIdParam) {
        setFormData(prev => ({
          ...prev,
          customer_id: customerIdParam
        }))
      }
    }
  }, [isNew, searchParams])

  async function loadData() {
    setLoading(true)
    try {
      // Load company_id from user profile
      let currentCompanyId = companyId
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .single()
        
        if (profileError) {
          console.error('Error fetching company_id:', profileError)
          toast.error('Failed to load company information')
        } else if (profile?.company_id) {
          currentCompanyId = profile.company_id
          setCompanyId(profile.company_id)
        }
      }

      // Load customers (RLS will scope to company)
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, full_name, email')
        .order('full_name')

      if (customersError) {
        console.error('Error fetching customers:', customersError)
        toast.error('Failed to load customers')
        setCustomers([])
      } else {
        setCustomers(customersData || [])
      }

      // Load teams for company (for convert-to-job modal)
      if (currentCompanyId) {
        const { data: teamsData, error: teamsError } = await supabase
          .from('teams')
          .select('id, name')
          .eq('company_id', currentCompanyId)
          .order('name')

        if (teamsError) {
          console.error('Error fetching teams:', teamsError)
          // Don't show error toast - teams are optional
        } else {
          setTeams(teamsData || [])
        }
      }

      // Load existing quote if editing/viewing
      if (!isNew) {
        const { data: quoteData, error: quoteError } = await supabase
          .from('quotes')
          .select('*')
          .eq('id', id)
          .single()

        if (quoteError) {
          console.error('Error fetching quote:', quoteError)
          toast.error('Failed to load quote')
          navigate('/admin/quotes')
          return
        }

        if (quoteData) {
          setQuoteStatus(quoteData.status)
          setQuoteMetadata({
            created_at: quoteData.created_at,
            sent_at: quoteData.sent_at,
            accepted_at: quoteData.accepted_at,
            rejected_at: quoteData.rejected_at,
            accepted_by_name: quoteData.accepted_by_name,
            rejected_by_name: quoteData.rejected_by_name,
            customer_comment: quoteData.customer_comment,
            public_token: quoteData.public_token,
            converted_job_id: quoteData.converted_job_id,
            quote_number: quoteData.quote_number
          })
          setFormData({
            customer_id: quoteData.customer_id || '',
            services: quoteData.services && quoteData.services.length > 0 
              ? quoteData.services 
              : [{ name: '', qty: 1, rate: 0 }],
            tax: quoteData.tax || 0,
            valid_until: quoteData.valid_until ? quoteData.valid_until.split('T')[0] : '',
            notes: quoteData.notes || ''
          })

          // Edit restrictions: Only allow editing if status is 'draft'
          if (isEdit && quoteData.status !== 'draft') {
            toast.error('Only draft quotes can be edited')
            navigate(`/admin/quotes/${id}`)
            return
          }
        }
      }
    } catch (err) {
      console.error('Unexpected error loading data:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Compute totals
  const { subtotal, total } = useMemo(() => {
    const sub = formData.services.reduce((sum, service) => {
      const qty = Math.max(0, parseFloat(service.qty) || 0)
      const rate = Math.max(0, parseFloat(service.rate) || 0)
      return sum + (qty * rate)
    }, 0)
    
    const taxAmount = Math.max(0, parseFloat(formData.tax) || 0)
    const totalAmount = sub + taxAmount

    return {
      subtotal: sub,
      total: totalAmount
    }
  }, [formData.services, formData.tax])

  // Helper: Get customer name
  const getCustomerName = (customer) => {
    if (!customer) return ''
    return customer.full_name || customer.name || ''
  }

  // Helper: Get customer by ID
  const getCustomerById = (customerId) => {
    return customers.find(c => c.id === customerId)
  }

  // Status badge colors (matching QuotesAdmin)
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

  // Format currency
  const formatMoney = (amount) => {
    const num = Math.max(0, parseFloat(amount) || 0)
    return `$${num.toFixed(2)}`
  }

  // Normalize services before save
  const normalizeServices = (services) => {
    return services.map(service => ({
      name: (service.name || '').trim(),
      qty: Math.max(0, parseFloat(service.qty) || 0),
      rate: Math.max(0, parseFloat(service.rate) || 0)
    }))
  }

  // Convert to Job - Direct conversion matching public acceptance behavior
  async function handleConvertToJob() {
    if (!id) {
      toast.error('Save quote first')
      return
    }
    
    // If already converted, open the job
    if (quoteMetadata.converted_job_id) {
      navigate(`/admin/jobs?openJobId=${quoteMetadata.converted_job_id}`)
      return
    }
    
    setConverting(true)
    try {
      const { data, error } = await supabase.rpc('admin_convert_quote_to_job', {
        p_quote_id: id
      })
      
      if (error) {
        console.error('Error converting quote to job:', error)
        // Handle specific error messages
        if (error.message?.includes('QUOTE_NOT_FOUND') || error.message?.includes('quote_not_found')) {
          toast.error('Quote not found or access denied')
        } else if (error.message?.includes('FORBIDDEN') || error.message?.includes('forbidden')) {
          toast.error('Only admins, managers, and dispatchers can convert quotes to jobs')
        } else if (error.message?.includes('AUTH_REQUIRED') || error.message?.includes('Authentication required')) {
          toast.error('Please log in to convert quotes')
        } else {
          toast.error(error.message || 'Failed to convert quote to job')
        }
        return
      }
      
      // Handle JSONB response: {status: "created" | "job_already_created", job_id: "<uuid>"}
      if (data) {
        if (data.status === 'created') {
          // Refetch quote to get updated data
          await loadData()
          
          // Show success toast
          toast.success('Job created from quote.')
          
          // Navigate to job
          if (data.job_id) {
            navigate(`/admin/jobs?openJobId=${data.job_id}`)
          }
        } else if (data.status === 'job_already_created') {
          // Idempotent case: job already exists
          toast('Job already exists for this quote.')
          
          // Refetch quote to get updated data
          await loadData()
          
          // Navigate to existing job
          if (data.job_id) {
            navigate(`/admin/jobs?openJobId=${data.job_id}`)
          }
        } else if (data.status === 'error') {
          // Error response from RPC
          toast.error(data.message || 'Failed to convert quote to job')
        } else {
          toast.error('Unexpected response from server')
        }
      } else {
        toast.error('Unexpected response from server')
      }
    } catch (err) {
      console.error('Unexpected error converting quote to job:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setConverting(false)
    }
  }


  // Update form field
  function handleFieldChange(field, value) {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Update service row
  function handleServiceChange(index, field, value) {
    setFormData(prev => {
      const newServices = [...prev.services]
      newServices[index] = {
        ...newServices[index],
        [field]: value
      }
      return {
        ...prev,
        services: newServices
      }
    })
  }

  // Add service row
  function addServiceRow() {
    setFormData(prev => ({
      ...prev,
      services: [...prev.services, { name: '', qty: 1, rate: 0 }]
    }))
  }

  // Remove service row
  function removeServiceRow(index) {
    if (formData.services.length <= 1) {
      toast.error('At least one service item is required')
      return
    }
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }))
  }

  // Validation helper
  function validateForm() {
    if (!formData.customer_id) {
      toast.error('Please select a customer')
      return false
    }

    const hasValidService = formData.services.some(s => s.name && s.name.trim())
    if (!hasValidService) {
      toast.error('Please add at least one service with a name')
      return false
    }

    return true
  }

  // Save draft
  async function handleSaveDraft() {
    if (!validateForm()) return

    setSaving(true)
    try {
      const normalizedServices = normalizeServices(formData.services)
      const payload = {
        customer_id: formData.customer_id,
        services: normalizedServices,
        subtotal: subtotal,
        tax: formData.tax || 0,
        total: total,
        status: 'draft', // Always set to draft for Save Draft
        valid_until: formData.valid_until || null,
        notes: formData.notes || null
      }

      // Get current user for created_by
      const { data: { user } } = await supabase.auth.getUser()
      if (user && isNew) {
        payload.created_by = user.id
      }

      if (isNew) {
        // Defensive: require company_id for new quotes
        if (!companyId) {
          toast.error('Company not found. Please refresh and try again.')
          setSaving(false)
          return
        }
        payload.company_id = companyId

        // Insert new quote
        const { data, error } = await supabase
          .from('quotes')
          .insert([payload])
          .select()
          .single()

        if (error) {
          console.error('Error creating quote:', error)
          toast.error('Failed to save quote')
          return
        }

        // Log quote created
        if (data?.customer_id) {
          try {
            await supabase.rpc('log_customer_activity', {
              p_customer_id: data.customer_id,
              p_event_type: 'quote.created',
              p_event_title: 'Quote created',
              p_event_description: `Quote #${data.quote_number || data.id} created`,
              p_related_id: data.id,
              p_event_data: { 
                quote_id: data.id, 
                status: 'draft',
                total: data.total 
              },
              p_event_category: 'quotes',
              p_related_type: 'quote',
              p_severity: 'info'
            });
          } catch (logError) {
            console.warn('Failed to log quote created activity:', logError);
          }
        }

        toast.success('Quote saved as draft')
        navigate(`/admin/quotes/${data.id}?edit=1`)
      } else {
        // Update existing quote (only if status is draft)
        if (quoteStatus !== 'draft') {
          toast.error('Only draft quotes can be edited')
          return
        }

        const { error } = await supabase
          .from('quotes')
          .update(payload)
          .eq('id', id)

        if (error) {
          console.error('Error updating quote:', error)
          toast.error('Failed to update quote')
          return
        }

        toast.success('Quote updated')
        // Reload to get fresh data
        await loadData()
      }
    } catch (err) {
      console.error('Unexpected error saving quote:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  // Save & Send
  async function handleSaveAndSend() {
    if (!validateForm()) return

    setSaving(true)
    try {
      const normalizedServices = normalizeServices(formData.services)
      const payload = {
        customer_id: formData.customer_id,
        services: normalizedServices,
        subtotal: subtotal,
        tax: formData.tax || 0,
        total: total,
        status: 'sent', // Always set to sent for Save & Send
        sent_at: new Date().toISOString(),
        valid_until: formData.valid_until || null,
        notes: formData.notes || null
      }

      // Get current user for created_by
      const { data: { user } } = await supabase.auth.getUser()
      if (user && isNew) {
        payload.created_by = user.id
      }

      if (isNew) {
        // Defensive: require company_id for new quotes
        if (!companyId) {
          toast.error('Company not found. Please refresh and try again.')
          setSaving(false)
          return
        }
        payload.company_id = companyId

        // Insert new quote
        const { data, error } = await supabase
          .from('quotes')
          .insert([payload])
          .select()
          .single()

        if (error) {
          console.error('Error creating quote:', error)
          toast.error('Failed to send quote')
          return
        }

        // Log quote created and sent
        if (data?.customer_id) {
          try {
            await supabase.rpc('log_customer_activity', {
              p_customer_id: data.customer_id,
              p_event_type: 'quote.sent',
              p_event_title: 'Quote sent',
              p_event_description: `Quote #${data.quote_number || data.id} sent to customer`,
              p_related_id: data.id,
              p_event_data: { 
                quote_id: data.id, 
                status: 'sent',
                total: data.total 
              },
              p_event_category: 'quotes',
              p_related_type: 'quote',
              p_severity: 'success'
            });
          } catch (logError) {
            console.warn('Failed to log quote sent activity:', logError);
          }
        }

        toast.success('Quote sent')
        navigate(`/admin/quotes/${data.id}`)
      } else {
        // Update existing quote (only if status is draft)
        if (quoteStatus !== 'draft') {
          toast.error('Only draft quotes can be sent')
          return
        }

        const { error } = await supabase
          .from('quotes')
          .update(payload)
          .eq('id', id)

        if (error) {
          console.error('Error updating quote:', error)
          toast.error('Failed to send quote')
          return
        }

        toast.success('Quote sent')
        navigate(`/admin/quotes/${id}`)
      }
    } catch (err) {
      console.error('Unexpected error sending quote:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title={isNew ? 'New Quote' : isEdit ? 'Edit Quote' : 'Quote Details'}
          subtitle={isNew ? 'Create a new customer quote' : isEdit ? 'Update quote details' : 'View quote information'}
          actions={
            <Button
              onClick={() => navigate('/admin/quotes')}
              variant="secondary"
            >
              Back to Quotes
            </Button>
          }
        />
        <Card>
          <div className="text-center py-8 text-slate-500">Loading...</div>
        </Card>
      </div>
    )
  }

  const isReadOnly = mode === 'view'

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Quote' : isEdit ? 'Edit Quote' : 'Quote Details'}
        subtitle={isNew ? 'Create a new customer quote' : isEdit ? 'Update quote details' : 'View quote information'}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => navigate('/admin/quotes')}
              variant="secondary"
            >
              Back to Quotes
            </Button>
            {isReadOnly && quoteStatus === 'draft' && (
              <Button
                onClick={() => navigate(`/admin/quotes/${id}?edit=1`)}
                variant="primary"
              >
                Edit Quote
              </Button>
            )}
          </div>
        }
      />

      {/* Status Display (View Mode Only) */}
      {isReadOnly && quoteStatus && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Status:</span>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(quoteStatus)}`}>
                  {quoteStatus.charAt(0).toUpperCase() + quoteStatus.slice(1)}
                </span>
              </div>
              <span className="text-xs text-slate-500 ml-0">
                {getQuoteNextStep(quoteMetadata)}
              </span>
            </div>
            {quoteMetadata.created_at && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Created:</span>
                <span className="text-sm text-slate-600">{formatDate(quoteMetadata.created_at)}</span>
              </div>
            )}
            {quoteMetadata.sent_at && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Sent:</span>
                <span className="text-sm text-slate-600">{formatDate(quoteMetadata.sent_at)}</span>
              </div>
            )}
            {quoteStatus === 'accepted' && quoteMetadata.accepted_at && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Accepted:</span>
                <span className="text-sm text-slate-600">{formatDate(quoteMetadata.accepted_at)}</span>
              </div>
            )}
            {quoteStatus === 'rejected' && quoteMetadata.rejected_at && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Rejected:</span>
                <span className="text-sm text-slate-600">{formatDate(quoteMetadata.rejected_at)}</span>
              </div>
            )}
          </div>
          {/* Accept/Reject Details */}
          {quoteStatus === 'accepted' && quoteMetadata.accepted_by_name && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="text-sm">
                <span className="font-medium text-slate-700">Accepted by: </span>
                <span className="text-slate-600">{quoteMetadata.accepted_by_name}</span>
              </div>
              {quoteMetadata.customer_comment && (
                <div className="mt-2 text-sm">
                  <span className="font-medium text-slate-700">Comment: </span>
                  <span className="text-slate-600">{quoteMetadata.customer_comment}</span>
                </div>
              )}
            </div>
          )}
          {quoteStatus === 'rejected' && quoteMetadata.rejected_by_name && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="text-sm">
                <span className="font-medium text-slate-700">Rejected by: </span>
                <span className="text-slate-600">{quoteMetadata.rejected_by_name}</span>
              </div>
              {quoteMetadata.customer_comment && (
                <div className="mt-2 text-sm">
                  <span className="font-medium text-slate-700">Comment: </span>
                  <span className="text-slate-600">{quoteMetadata.customer_comment}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Customer Selector */}
      <Card className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Customer <span className="text-red-500">*</span>
        </label>
        {isReadOnly ? (
          <div className="text-slate-700">
            {formData.customer_id ? getCustomerName(getCustomerById(formData.customer_id)) : '—'}
          </div>
        ) : (
          <select
            value={formData.customer_id}
            onChange={(e) => handleFieldChange('customer_id', e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a customer</option>
            {customers.map(customer => (
              <option key={customer.id} value={customer.id}>
                {getCustomerName(customer)}
              </option>
            ))}
          </select>
        )}
      </Card>

      {/* Quote Items Table */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Services</h3>
          {!isReadOnly && (
            <Button
              onClick={addServiceRow}
              variant="secondary"
              className="text-sm"
            >
              + Add Service
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Service Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Rate</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Line Total</th>
                {!isReadOnly && <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {formData.services.map((service, index) => {
                const qty = Math.max(0, parseFloat(service.qty) || 0)
                const rate = Math.max(0, parseFloat(service.rate) || 0)
                const lineTotal = qty * rate

                return (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {isReadOnly ? (
                        <span className="text-slate-700">{service.name || '—'}</span>
                      ) : (
                        <input
                          type="text"
                          value={service.name || ''}
                          onChange={(e) => handleServiceChange(index, 'name', e.target.value)}
                          placeholder="Service name"
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isReadOnly ? (
                        <span className="text-slate-700">{qty}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={service.qty || ''}
                          onChange={(e) => handleServiceChange(index, 'qty', e.target.value)}
                          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isReadOnly ? (
                        <span className="text-slate-700">{formatMoney(rate)}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={service.rate || ''}
                          onChange={(e) => handleServiceChange(index, 'rate', e.target.value)}
                          className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {formatMoney(lineTotal)}
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeServiceRow(index)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Totals Card */}
      <Card className="mb-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-700 font-medium">Subtotal:</span>
            <span className="text-slate-800 font-semibold">{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-slate-700 font-medium">
              Tax:
              {!isReadOnly && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.tax || ''}
                  onChange={(e) => handleFieldChange('tax', e.target.value)}
                  className="ml-2 w-24 border border-slate-300 rounded px-2 py-1 text-sm"
                />
              )}
              {isReadOnly && <span className="ml-2">{formatMoney(formData.tax || 0)}</span>}
            </label>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
            <span className="text-slate-800 font-semibold text-lg">Total:</span>
            <span className="text-slate-800 font-bold text-lg">{formatMoney(total)}</span>
          </div>
        </div>
      </Card>

      {/* Valid Until & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Valid Until
          </label>
          {isReadOnly ? (
            <div className="text-slate-700">
              {formData.valid_until ? new Date(formData.valid_until).toLocaleDateString() : '—'}
            </div>
          ) : (
            <input
              type="date"
              value={formData.valid_until || ''}
              onChange={(e) => handleFieldChange('valid_until', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          )}
        </Card>

        <Card>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Notes
          </label>
          {isReadOnly ? (
            <div className="text-slate-700 whitespace-pre-wrap min-h-[60px]">
              {formData.notes || '—'}
            </div>
          ) : (
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Additional notes..."
            />
          )}
        </Card>
      </div>

      {/* Action Buttons */}
      {!isReadOnly && (
        <Card>
          <div className="flex gap-2">
            <Button
              onClick={handleSaveDraft}
              variant="secondary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              onClick={handleSaveAndSend}
              variant="primary"
              disabled={saving}
            >
              {saving ? 'Sending...' : 'Save & Send'}
            </Button>
            <Button
              onClick={() => navigate('/admin/quotes')}
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Convert to Job & Download PDF Buttons (View Mode Only) */}
      {isReadOnly && id && (
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            {quoteMetadata.converted_job_id ? (
              <Button
                onClick={handleConvertToJob}
                variant="primary"
                title="Open job created from this quote"
              >
                View Job
              </Button>
            ) : (
              <Button
                onClick={handleConvertToJob}
                variant="primary"
                disabled={converting || !id || quoteMetadata.status !== 'accepted'}
                title={
                  !id
                    ? 'Save quote first'
                    : quoteMetadata.status !== 'accepted'
                    ? 'Quote must be accepted before converting to job'
                    : converting
                    ? 'Converting...'
                    : 'Convert quote to job'
                }
              >
                {converting ? 'Converting...' : 'Convert to Job'}
              </Button>
            )}
            <Button
              onClick={async () => {
                try {
                  // Fetch full quote data
                  const { data: quoteData, error: quoteError } = await supabase
                    .from('quotes')
                    .select('*')
                    .eq('id', id)
                    .single()

                  if (quoteError || !quoteData) {
                    toast.error('Failed to load quote')
                    return
                  }

                  // Get customer
                  const customer = getCustomerById(formData.customer_id)
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
              variant="secondary"
            >
              Download PDF
            </Button>
            <Button
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
                    .eq('id', id)
                    .single()

                  if (quoteError || !quoteData) {
                    toast.error('Failed to load quote')
                    return
                  }

                  // Get customer with email
                  const customer = getCustomerById(formData.customer_id)
                  if (!customer) {
                    toast.error('Customer not found')
                    return
                  }

                  // Fetch customer with email to ensure we have it
                  const { data: customerWithEmail, error: customerError } = await supabase
                    .from('customers')
                    .select('id, full_name, email')
                    .eq('id', formData.customer_id)
                    .single()

                  if (customerError || !customerWithEmail) {
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
                  const customerName = customerWithEmail.full_name || 'Customer'
                  const toEmail = customerWithEmail.email || ''
                  
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
                  const validUntil = quoteData.valid_until ? formatDate(quoteData.valid_until) : null
                  
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
                  setEmailContext({ quote: quoteData, customer: customerWithEmail, profile, user })
                  setComposeEmailOpen(true)
                } catch (err) {
                  console.error('Error preparing email:', err)
                  toast.error(err.message || 'Failed to prepare email')
                }
              }}
              variant="secondary"
            >
              Send
            </Button>
            {quoteMetadata.public_token && (
              <Button
                onClick={() => {
                  const publicUrl = `${window.location.origin}/quote/${quoteMetadata.public_token}`
                  navigator.clipboard.writeText(publicUrl)
                  toast.success('Public link copied to clipboard')
                }}
                variant="tertiary"
              >
                Copy Link
              </Button>
            )}
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
          setEmailContext(null)
        }}
        onConfirm={async (to, subject, body) => {
          if (!emailContext) return

          try {
            const { quote, profile, user } = emailContext

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

            // Refresh quote data
            await loadData()

            // Log quote sent (if status changed to sent)
            if (quote.customer_id && !quote.sent_at) {
              try {
                await supabase.rpc('log_customer_activity', {
                  p_customer_id: quote.customer_id,
                  p_event_type: 'quote.sent',
                  p_event_title: 'Quote sent',
                  p_event_description: `Quote #${quote.quote_number || quote.id} sent to customer`,
                  p_related_id: quote.id,
                  p_event_data: { 
                    quote_id: quote.id, 
                    status: 'sent',
                    total: quote.total 
                  },
                  p_event_category: 'quotes',
                  p_related_type: 'quote',
                  p_severity: 'success'
                });
              } catch (logError) {
                console.warn('Failed to log quote sent activity:', logError);
              }
            }

            setComposeEmailOpen(false)
            setEmailContext(null)
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
