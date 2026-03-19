import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { supabase } from '../../supabaseClient'
import { useUser } from '../../context/UserContext'

export default function CompanyBootstrap() {
  const navigate = useNavigate()
  const { session, profile, loading } = useUser()

  const [companyName, setCompanyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const redirectWithReload = (path) => {
    window.location.assign(path)
  }

  const getPostBootstrapPath = () => {
    // Source of truth: onboarding is complete if setup_completed_at is NOT null
    const isOnboardingComplete = profile?.setup_completed_at !== null;
    return isOnboardingComplete ? '/admin' : '/admin/onboarding'
  }

  useEffect(() => {
    if (loading) return

    if (!session?.user?.id) {
      navigate('/login', { replace: true })
      return
    }

    if (profile?.company_id) {
      navigate(getPostBootstrapPath(), { replace: true })
    }
  }, [loading, session, profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult('')

    const trimmedCompanyName = companyName.trim()
    const trimmedDisplayName = displayName.trim()

    if (!trimmedCompanyName) {
      setError('Company name is required.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('bootstrap_tenant_for_current_user', {
        p_company_name: trimmedCompanyName,
        p_display_name: trimmedDisplayName || null,
      })

      if (rpcError) {
        const rawMessage = rpcError.message || ''
        if (rawMessage.includes('COMPANY_NAME_REQUIRED')) {
          setError('Company name is required.')
        } else if (rawMessage.includes('AUTH_REQUIRED')) {
          setError('Please sign in to continue.')
        } else if (rawMessage.includes('PROFILE_NOT_FOUND')) {
          setError('We could not find your profile. Please contact support.')
        } else {
          console.error('[CompanyBootstrap] bootstrap rpc error:', rpcError)
          setError('Unable to create your company right now.')
        }
        return
      }

      const status = data?.status
      if (data?.ok === true && (status === 'created' || status === 'already_linked')) {
        setResult(status === 'created' ? 'Company created successfully.' : 'Company already linked.')

        // Created tenants should begin onboarding immediately.
        if (status === 'created') {
          redirectWithReload('/admin/onboarding')
          return
        }

        // For already-linked users, route based on company onboarding state.
        const companyId = data?.company_id
        if (companyId) {
          const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('onboarding_step, setup_completed_at')
            .eq('id', companyId)
            .maybeSingle()

          if (!companyError) {
            // Source of truth: onboarding is complete if setup_completed_at is NOT null
            const isOnboardingComplete = company?.setup_completed_at !== null;
            redirectWithReload(isOnboardingComplete ? '/admin' : '/admin/onboarding')
            return
          }
          console.error('[CompanyBootstrap] failed to load company onboarding state:', companyError)
        }

        redirectWithReload('/admin/onboarding')
        return
      }

      console.error('[CompanyBootstrap] unexpected rpc response:', data)
      setError('Unable to create your company right now.')
    } catch (err) {
      console.error('[CompanyBootstrap] unexpected error:', err)
      setError('Unable to create your company right now.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: 'var(--brand-primary, #22c55e)' }}>
            Create your company
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">
            Set up your workspace to start onboarding.
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
            {result && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {result}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1">
                Company Name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Lawn Care"
                required
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 mb-1">
                Your Name (optional)
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Owner"
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full py-2" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Company'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-600">
            You can update company details later during onboarding.
          </p>
        </div>
      </div>
    </div>
  )
}
