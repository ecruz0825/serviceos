import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import PageHeader from '../../components/ui/PageHeader'
import { isDemoMode } from '../../lib/demo-mode'

const STEPS = [
  { id: 'company', title: 'Company Info', description: 'Set up your company details' },
  { id: 'services', title: 'Services', description: 'Add your services' },
  { id: 'customer', title: 'First Customer', description: 'Create your first customer' },
  { id: 'quote', title: 'First Quote', description: 'Create your first quote' },
  { id: 'crew', title: 'Invite Crew (Optional)', description: 'Invite team members' },
  { id: 'finish', title: 'Complete', description: 'You\'re all set!' },
]

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [companyId, setCompanyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Step 1: Company Info
  const [companyForm, setCompanyForm] = useState({
    name: '',
    display_name: '',
    support_phone: '',
    address: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  // Step 2: Services
  const [services, setServices] = useState([
    { name: 'Lawn Mowing', default_price: 50 },
    { name: 'Weed Control', default_price: 75 },
    { name: 'Fertilization', default_price: 100 },
  ])

  // Step 3: Customer
  const [customerForm, setCustomerForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
  })
  const [createdCustomerId, setCreatedCustomerId] = useState(null)

  // Step 4: Quote (will navigate to QuoteBuilder)
  const [createdQuoteId, setCreatedQuoteId] = useState(null)

  // Step 5: Crew
  const [crewForm, setCrewForm] = useState({
    full_name: '',
    email: '',
    phone: '',
  })

  useEffect(() => {
    loadCompanyData()
  }, [])

  async function loadCompanyData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
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

      setCompanyId(profile.company_id)

      // Load existing company data
      const { data: company } = await supabase
        .from('companies')
        .select('name, display_name, support_phone, address, logo_path, onboarding_step, setup_completed_at')
        .eq('id', profile.company_id)
        .single()

      // If onboarding is already complete, redirect to admin dashboard
      if (company?.setup_completed_at) {
        console.log('[OnboardingWizard] Onboarding already complete, redirecting to admin');
        window.location.assign('/admin');
        return;
      }

      if (company) {
        setCompanyForm({
          name: company.name || '',
          display_name: company.display_name || company.name || '',
          support_phone: company.support_phone || '',
          address: company.address || '',
        })

        // Load logo preview if exists
        if (company.logo_path) {
          try {
            const { data: signedUrl } = await supabase.storage
              .from('branding')
              .createSignedUrl(company.logo_path, 3600)
            if (signedUrl?.signedUrl) {
              setLogoPreview(signedUrl.signedUrl)
            }
          } catch (e) {
            console.warn('Failed to load logo preview:', e)
          }
        }

        // Resume from saved step, but check if artifacts already exist
        let resumeStep = 0;
        if (company.onboarding_step) {
          const stepIndex = STEPS.findIndex(s => s.id === company.onboarding_step)
          if (stepIndex >= 0) {
            resumeStep = stepIndex;
          }
        }

        // Check if customer already exists (defensive: avoid duplicate creation)
        if (resumeStep >= 2) { // customer step or later
          const { data: existingCustomers } = await supabase
            .from('customers')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .order('created_at', { ascending: true })
            .limit(1)

          if (existingCustomers && existingCustomers.length > 0) {
            const firstCustomer = existingCustomers[0];
            setCreatedCustomerId(firstCustomer.id);
            setCustomerForm({
              full_name: firstCustomer.full_name || '',
              email: '',
              phone: '',
              address: '',
            });
            // If we're resuming at customer step but customer exists, skip to quote step
            if (resumeStep === 2) {
              resumeStep = 3;
            }
          }
        }

        // Check if quote already exists (defensive: avoid duplicate creation)
        if (resumeStep >= 3 && createdCustomerId) { // quote step or later
          const { data: existingQuotes } = await supabase
            .from('quotes')
            .select('id')
            .eq('company_id', profile.company_id)
            .eq('customer_id', createdCustomerId)
            .order('created_at', { ascending: true })
            .limit(1)

          if (existingQuotes && existingQuotes.length > 0) {
            setCreatedQuoteId(existingQuotes[0].id);
            // If we're resuming at quote step but quote exists, skip to crew step
            if (resumeStep === 3) {
              resumeStep = 4;
            }
          }
        }

        setCurrentStep(resumeStep);
      }

      // Load existing services
      const { data: existingServices } = await supabase
        .from('services')
        .select('id, name, default_price')
        .eq('company_id', profile.company_id)
        .order('name')

      if (existingServices && existingServices.length > 0) {
        setServices(existingServices.map(s => ({
          name: s.name,
          default_price: s.default_price || 0,
        })))
      }
    } catch (err) {
      console.error('Error loading company data:', err)
      toast.error('Failed to load company data')
    } finally {
      setLoading(false)
    }
  }

  async function saveProgress(stepId) {
    if (!companyId) {
      console.warn('saveProgress: No companyId available');
      return;
    }

    try {
      console.log(`[OnboardingWizard] Saving progress: stepId=${stepId}, companyId=${companyId}`);
      const { data, error } = await supabase
        .from('companies')
        .update({ onboarding_step: stepId })
        .eq('id', companyId)
        .select('id, onboarding_step')
        .single();

      if (error) {
        console.error('[OnboardingWizard] Error saving progress:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      if (data) {
        console.log('[OnboardingWizard] Progress saved successfully:', {
          companyId: data.id,
          onboarding_step: data.onboarding_step
        });
      } else {
        console.warn('[OnboardingWizard] Update succeeded but no data returned');
      }
    } catch (err) {
      console.error('[OnboardingWizard] Exception saving progress:', err);
      throw err;
    }
  }

  async function handleCompanyInfoNext() {
    if (!companyForm.name.trim()) {
      toast.error('Company name is required')
      return
    }

    setSaving(true)
    try {
      const updates = {
        name: companyForm.name.trim(),
        display_name: companyForm.display_name.trim() || companyForm.name.trim(),
        support_phone: companyForm.support_phone.trim() || null,
        address: companyForm.address.trim() || null,
      }

      // Upload logo if provided
      if (logoFile && companyId) {
        const ext = logoFile.name.split('.').pop().toLowerCase()
        const storagePath = `${companyId}/logo.${ext}`
        
        const { error: uploadError } = await supabase.storage
          .from('branding')
          .upload(storagePath, logoFile, {
            contentType: logoFile.type,
            upsert: true,
          })

        if (uploadError) {
          console.error('Logo upload error:', uploadError)
          toast.error('Failed to upload logo')
        } else {
          updates.logo_path = storagePath
        }
      }

      console.log('[OnboardingWizard] Updating company info:', { companyId, updates });
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', companyId)
        .select('id')
        .single();

      if (companyError) {
        console.error('[OnboardingWizard] Error updating company info:', {
          error: companyError,
          message: companyError.message,
          details: companyError.details,
          hint: companyError.hint,
          code: companyError.code
        });
        throw companyError;
      }

      if (!companyData) {
        console.error('[OnboardingWizard] Company update succeeded but no data returned');
        throw new Error('Company update failed: no data returned');
      }

      console.log('[OnboardingWizard] Company info updated successfully:', companyData);

      // Only advance if saveProgress succeeds
      await saveProgress('services');
      setCurrentStep(1);
      toast.success('Company info saved');
    } catch (err) {
      console.error('Error saving company info:', err)
      toast.error('Failed to save company info')
    } finally {
      setSaving(false)
    }
  }

  async function handleServicesNext() {
    if (services.length === 0 || services.some(s => !s.name.trim())) {
      toast.error('Please add at least one service with a name')
      return
    }

    setSaving(true)
    try {
      // Get existing services to avoid duplicates
      const { data: existingServices } = await supabase
        .from('services')
        .select('id, name')
        .eq('company_id', companyId)

      const existingNames = new Set((existingServices || []).map(s => s.name.toLowerCase()))

      // Insert new services (skip if name already exists)
      const servicesToInsert = services
        .filter(s => s.name.trim() && !existingNames.has(s.name.trim().toLowerCase()))
        .map(s => ({
          name: s.name.trim(),
          default_price: s.default_price ? Number(s.default_price) : null,
          company_id: companyId,
        }))

      if (servicesToInsert.length > 0) {
        console.log('[OnboardingWizard] Inserting services:', servicesToInsert);
        const { data: servicesData, error: servicesError } = await supabase
          .from('services')
          .insert(servicesToInsert)
          .select('id');

        if (servicesError) {
          console.error('[OnboardingWizard] Error inserting services:', {
            error: servicesError,
            message: servicesError.message,
            details: servicesError.details,
            hint: servicesError.hint,
            code: servicesError.code
          });
          throw servicesError;
        }

        console.log('[OnboardingWizard] Services inserted successfully:', servicesData);
      }

      // Only advance if saveProgress succeeds
      await saveProgress('customer');
      setCurrentStep(2);
      toast.success('Services saved');
    } catch (err) {
      console.error('Error saving services:', err)
      toast.error('Failed to save services')
    } finally {
      setSaving(false)
    }
  }

  async function handleCustomerNext() {
    if (!customerForm.full_name.trim()) {
      toast.error('Customer name is required')
      return
    }

    setSaving(true)
    try {
      // Defensive: Check if customer already exists (from resume logic)
      if (createdCustomerId) {
        console.log('[OnboardingWizard] Customer already exists, skipping creation:', createdCustomerId);
        await saveProgress('quote');
        setCurrentStep(3);
        toast.success('Customer found, continuing...');
        return;
      }

      const { data, error } = await supabase
        .from('customers')
        .insert({
          company_id: companyId,
          full_name: customerForm.full_name.trim(),
          email: customerForm.email.trim() || null,
          phone: customerForm.phone.trim() || null,
          address: customerForm.address.trim() || null,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[OnboardingWizard] Error creating customer:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      if (!data?.id) {
        console.error('[OnboardingWizard] Customer created but no ID returned');
        throw new Error('Customer creation failed: no ID returned');
      }

      console.log('[OnboardingWizard] Customer created successfully:', data.id);
      setCreatedCustomerId(data.id);

      // Only advance if saveProgress succeeds
      await saveProgress('quote');
      setCurrentStep(3);
      toast.success('Customer created');
    } catch (err) {
      console.error('Error creating customer:', err)
      toast.error('Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuoteNext() {
    if (!createdCustomerId) {
      toast.error('Please create a customer first')
      return
    }

    setSaving(true)
    try {
      // Defensive: Check if quote already exists (from resume logic)
      if (createdQuoteId) {
        console.log('[OnboardingWizard] Quote already exists, skipping creation:', createdQuoteId);
        await saveProgress('crew');
        setCurrentStep(4);
        toast.success('Quote found, continuing...');
        return;
      }

      // Get services for the quote
      const { data: companyServices } = await supabase
        .from('services')
        .select('id, name, default_price')
        .eq('company_id', companyId)
        .limit(3)

      const quoteServices = (companyServices || []).map(s => ({
        name: s.name,
        qty: 1,
        rate: s.default_price || 0,
      }))

      // Create draft quote
      const { data: quote, error } = await supabase
        .from('quotes')
        .insert({
          company_id: companyId,
          customer_id: createdCustomerId,
          services: quoteServices,
          subtotal: quoteServices.reduce((sum, s) => sum + (s.qty * s.rate), 0),
          tax: 0,
          total: quoteServices.reduce((sum, s) => sum + (s.qty * s.rate), 0),
          status: 'draft',
        })
        .select('id')
        .single()

      if (error) {
        console.error('[OnboardingWizard] Error creating quote:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      if (!quote?.id) {
        console.error('[OnboardingWizard] Quote created but no ID returned');
        throw new Error('Quote creation failed: no ID returned');
      }

      console.log('[OnboardingWizard] Quote created successfully:', quote.id);
      setCreatedQuoteId(quote.id);

      // Only advance if saveProgress succeeds
      await saveProgress('crew');
      setCurrentStep(4);
      toast.success('Quote created');
    } catch (err) {
      console.error('Error creating quote:', err)
      toast.error('Failed to create quote')
    } finally {
      setSaving(false)
    }
  }

  async function handleCrewNext() {
    // Crew step is optional, so we can skip it
    await handleFinish()
  }

  async function handleCrewInvite() {
    if (!crewForm.email.trim()) {
      toast.error('Email is required')
      return
    }

    setSaving(true)
    try {
      const email = crewForm.email.trim();
      // Align with CrewAdmin: use null instead of default string for empty full_name
      const fullName = crewForm.full_name.trim() || null;
      const phone = crewForm.phone.trim() || null;

      // Defensive: Check if crew member already exists for this email/company
      const { data: existingCrew, error: checkError } = await supabase
        .from('crew_members')
        .select('id, full_name, email')
        .eq('company_id', companyId)
        .eq('email', email)
        .maybeSingle();

      if (checkError) {
        console.error('[OnboardingWizard] Error checking existing crew:', checkError);
        throw checkError;
      }

      let crewMemberId;
      if (existingCrew) {
        // Crew member already exists - use existing ID
        console.log('[OnboardingWizard] Crew member already exists:', existingCrew.id);
        crewMemberId = existingCrew.id;
        toast.success('Crew member found, sending invite...');
      } else {
        // Create crew member record (aligned with CrewAdmin pattern)
        const { data: crewMember, error: crewError } = await supabase
          .from('crew_members')
          .insert({
            company_id: companyId,
            full_name: fullName,
            email: email,
            phone: phone,
            role: 'crew',
          })
          .select('id')
          .single();

        if (crewError) {
          console.error('[OnboardingWizard] Error creating crew member:', {
            error: crewError,
            message: crewError.message,
            details: crewError.details,
            hint: crewError.hint,
            code: crewError.code
          });
          throw crewError;
        }

        if (!crewMember?.id) {
          console.error('[OnboardingWizard] Crew member created but no ID returned');
          throw new Error('Crew member creation failed: no ID returned');
        }

        console.log('[OnboardingWizard] Crew member created successfully:', crewMember.id);
        crewMemberId = crewMember.id;
      }

      // Send invite using the same edge function as CrewAdmin (aligned pattern)
      // Payload must match CrewAdmin exactly: full_name can be null, not a default string
      const { data: inviteData, error: inviteError } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email,
          full_name: fullName, // null if empty (matches CrewAdmin pattern)
          role: 'crew',
          crew_member_id: crewMemberId,
          app_next: '/crew',
        },
      });

      if (inviteError) {
        console.error('[OnboardingWizard] Invite error:', {
          error: inviteError,
          message: inviteError.message,
          context: inviteError.context,
          status: inviteError.status,
          statusText: inviteError.statusText,
        });
        
        // Try to extract error message from response body if available
        let errorMessage = 'Failed to send invite';
        if (inviteError.message) {
          errorMessage = inviteError.message;
        } else if (inviteError.context?.body) {
          // Edge function returns error in body.message
          try {
            const errorBody = typeof inviteError.context.body === 'string' 
              ? JSON.parse(inviteError.context.body)
              : inviteError.context.body;
            if (errorBody?.message) {
              errorMessage = errorBody.message;
            } else if (errorBody?.error) {
              errorMessage = errorBody.error;
            }
          } catch (e) {
            console.warn('[OnboardingWizard] Could not parse error body:', e);
          }
        }
        
        toast.error(errorMessage);
        return;
      }

      if (inviteData?.status === 'already_registered') {
        toast.success('This worker already has an account.', { icon: 'ℹ️' });
      } else if (inviteData?.ok === true || inviteData?.status === 'invited') {
        toast.success('Invite sent!');
      } else {
        console.error('[OnboardingWizard] Unexpected invite response:', inviteData);
        toast.error('Invite sent but received unexpected response');
      }

      // Clear form on success
      setCrewForm({ full_name: '', email: '', phone: '' });
    } catch (err) {
      console.error('[OnboardingWizard] Error inviting crew:', err);
      // Check if it's a plan limit error
      if (err?.message?.includes('plan limit') || err?.code?.includes('PLAN_LIMIT')) {
        toast.error('Plan limit reached. Please upgrade to add more crew members.');
      } else {
        toast.error(err?.message || 'Failed to invite crew member');
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleFinish() {
    setSaving(true)
    try {
      console.log('[OnboardingWizard] Completing onboarding:', { companyId });
      
      // Atomic completion: set setup_completed_at and clear onboarding_step in one update
      const { data: companyData, error } = await supabase
        .from('companies')
        .update({
          setup_completed_at: new Date().toISOString(),
          onboarding_step: null,
        })
        .eq('id', companyId)
        .select('id, setup_completed_at, onboarding_step')
        .single();

      if (error) {
        console.error('[OnboardingWizard] Error completing onboarding:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      if (!companyData) {
        console.error('[OnboardingWizard] Onboarding completion succeeded but no data returned');
        throw new Error('Onboarding completion failed: no data returned');
      }

      // Verify completion was saved
      if (!companyData.setup_completed_at) {
        console.error('[OnboardingWizard] Onboarding completion failed: setup_completed_at not set');
        throw new Error('Onboarding completion failed: setup_completed_at not set');
      }

      console.log('[OnboardingWizard] Onboarding completed successfully:', {
        companyId: companyData.id,
        setup_completed_at: companyData.setup_completed_at,
        onboarding_step: companyData.onboarding_step
      });

      toast.success('Setup complete! Welcome to ServiceOS.')
      
      // Use window.location.assign to force full page reload and UserContext refresh
      // This ensures OnboardingGuard sees the updated setup_completed_at immediately
      window.location.assign('/admin')
    } catch (err) {
      console.error('Error completing setup:', err)
      toast.error('Failed to complete setup')
      setSaving(false)
    }
  }

  async function handleLoadDemoData() {
    if (!isDemoMode() || !companyId) return

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('seed_demo_data', {
        p_company_id: companyId,
      })

      if (error) throw error

      if (data?.status === 'ok') {
        toast.success(
          `Demo data loaded: ${data.customers_created} customers, ${data.quotes_created} quotes, ${data.jobs_created} jobs`
        )
        // Refresh data to show demo records
        await loadCompanyData()
      } else {
        toast.error(data?.message || 'Failed to load demo data')
      }
    } catch (err) {
      console.error('Error loading demo data:', err)
      toast.error(err.message || 'Failed to load demo data')
    } finally {
      setSaving(false)
    }
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

  const currentStepData = STEPS[currentStep]
  const progress = ((currentStep + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Welcome! Let's get you set up"
          subtitle="We'll guide you through the essential setup steps"
        />

        {/* Progress Bar */}
        <Card className="mb-6">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-700">
                Step {currentStep + 1} of {STEPS.length}: {currentStepData.title}
              </span>
              <span className="text-sm text-slate-500">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            {STEPS.map((step, idx) => (
              <div
                key={step.id}
                className={`flex-1 text-center ${
                  idx <= currentStep ? 'text-blue-600 font-medium' : ''
                }`}
              >
                {step.title}
              </div>
            ))}
          </div>
        </Card>

        {/* Step Content */}
        <Card>
          {/* Step 1: Company Info */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Company Information</h2>
                <p className="text-slate-600">Tell us about your business</p>
              </div>

              {isDemoMode() && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-amber-800">
                      Demo mode is enabled. You can load sample data to get started quickly.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleLoadDemoData}
                      disabled={saving}
                    >
                      Load Demo Data
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Acme Lawn Care"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={companyForm.display_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, display_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Acme Lawn Care"
                  />
                  <p className="text-xs text-slate-500 mt-1">Shown on quotes and invoices</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={companyForm.support_phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, support_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Address
                  </label>
                  <textarea
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="123 Main St, City, State ZIP"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Logo (Optional)
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setLogoFile(file)
                        const reader = new FileReader()
                        reader.onload = (e) => setLogoPreview(e.target.result)
                        reader.readAsDataURL(file)
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {logoPreview && (
                    <div className="mt-2">
                      <img src={logoPreview} alt="Logo preview" className="h-20 object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleCompanyInfoNext}
                  disabled={saving || !companyForm.name.trim()}
                  variant="primary"
                >
                  Next: Services
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Services */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Your Services</h2>
                <p className="text-slate-600">Add the services you offer (you can edit these later)</p>
              </div>

              <div className="space-y-3">
                {services.map((service, idx) => (
                  <div key={idx} className="flex gap-3 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={service.name}
                        onChange={(e) => {
                          const newServices = [...services]
                          newServices[idx].name = e.target.value
                          setServices(newServices)
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Service name"
                      />
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        value={service.default_price}
                        onChange={(e) => {
                          const newServices = [...services]
                          newServices[idx].default_price = Number(e.target.value) || 0
                          setServices(newServices)
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Price"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        const newServices = services.filter((_, i) => i !== idx)
                        setServices(newServices)
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="secondary"
                onClick={() => setServices([...services, { name: '', default_price: 0 }])}
              >
                + Add Service
              </Button>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  onClick={() => setCurrentStep(0)}
                  variant="secondary"
                >
                  Back
                </Button>
                <Button
                  onClick={handleServicesNext}
                  disabled={saving || services.length === 0 || services.some(s => !s.name.trim())}
                  variant="primary"
                >
                  Next: Customer
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Customer */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">First Customer</h2>
                <p className="text-slate-600">
                  {createdCustomerId 
                    ? 'Customer already exists. You can continue to the next step.' 
                    : 'Create your first customer record'}
                </p>
              </div>
              
              {createdCustomerId && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    ✓ Customer record found. You can continue to create your first quote.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerForm.full_name}
                    onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="John Smith"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Address
                  </label>
                  <textarea
                    value={customerForm.address}
                    onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="123 Main St, City, State ZIP"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  onClick={() => setCurrentStep(1)}
                  variant="secondary"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCustomerNext}
                  disabled={saving || (!createdCustomerId && !customerForm.full_name.trim())}
                  variant="primary"
                >
                  {createdCustomerId ? 'Continue to Quote' : 'Next: Quote'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Quote */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">First Quote</h2>
                <p className="text-slate-600">
                  {createdQuoteId 
                    ? 'Quote already exists. You can continue to the next step.' 
                    : `Create your first quote${createdCustomerId ? '' : ' (customer required first)'}`}
                </p>
              </div>
              
              {createdQuoteId && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 mb-2">
                    ✓ Quote record found. You can continue to invite crew or complete setup.
                  </p>
                  <Button
                    onClick={() => navigate(`/admin/quotes/${createdQuoteId}?edit=1`)}
                    variant="secondary"
                    size="sm"
                  >
                    Open Quote Builder
                  </Button>
                </div>
              )}

              {!createdQuoteId && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 mb-4">
                    We'll create a draft quote with the services you added. You can edit it and send it from the quote builder.
                  </p>
                  <Button
                    onClick={handleQuoteNext}
                    disabled={saving || !createdCustomerId}
                    variant="primary"
                  >
                    Create Quote
                  </Button>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t">
                <Button
                  onClick={() => setCurrentStep(2)}
                  variant="secondary"
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    if (createdQuoteId) {
                      setCurrentStep(4)
                    } else {
                      handleQuoteNext()
                    }
                  }}
                  disabled={saving || !createdCustomerId}
                  variant="primary"
                >
                  {createdQuoteId ? 'Next: Crew' : 'Create Quote & Continue'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Crew (Optional) */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Invite Crew (Optional)</h2>
                <p className="text-slate-600">You can invite team members now or skip this step</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={crewForm.full_name}
                    onChange={(e) => setCrewForm({ ...crewForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Jane Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={crewForm.email}
                    onChange={(e) => setCrewForm({ ...crewForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="jane@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={crewForm.phone}
                    onChange={(e) => setCrewForm({ ...crewForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <Button
                onClick={handleCrewInvite}
                disabled={saving || !crewForm.email.trim()}
                variant="secondary"
              >
                Send Invite
              </Button>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  onClick={() => setCurrentStep(3)}
                  variant="secondary"
                >
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button
                    onClick={handleCrewNext}
                    variant="secondary"
                  >
                    Skip
                  </Button>
                  <Button
                    onClick={handleFinish}
                    disabled={saving}
                    variant="primary"
                  >
                    Complete Setup
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Finish */}
          {currentStep === 5 && (
            <div className="space-y-6 text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">You're All Set!</h2>
              <p className="text-slate-600 mb-6">
                Your ServiceOS is ready to use. You can start creating quotes, managing jobs, and tracking revenue.
              </p>
              <Button
                onClick={handleFinish}
                disabled={saving}
                variant="primary"
                size="lg"
              >
                Go to Revenue Hub
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
