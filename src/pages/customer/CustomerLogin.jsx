import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { useBrand } from '../../context/BrandContext'
import { useUser } from '../../context/UserContext'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

export default function CustomerLogin() {
  const { brand } = useBrand() || {}
  const { session, role } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSendingLink, setIsSendingLink] = useState(false)
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    if (session?.user?.id) {
      if (role === 'customer') {
        navigate('/customer/dashboard', { replace: true })
      } else if (role === 'admin') {
        navigate('/admin', { replace: true })
      } else if (role === 'crew') {
        navigate('/crew', { replace: true })
      }
    }
  }, [session, role, navigate])

  const companyDisplayName = brand?.companyDisplayName || 'Customer Portal'

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Trim email to avoid whitespace issues
      const emailTrimmed = email.trim()
      
      console.log('[CustomerLogin] Signing in', { 
        email: emailTrimmed, 
        hasPassword: !!password 
      })
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password,
      })

      if (error) {
        console.error('[CustomerLogin] signInWithPassword error', {
          code: error.status || error.code,
          message: error.message,
          email: emailTrimmed,
          fullError: error
        })
        setError(error.message)
        return
      }

      // Fetch the user's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError) {
        console.error('Error fetching profile:', profileError)
        setError('Could not fetch profile. Contact admin.')
        return
      }

      const userRole = profile?.role

      if (!userRole) {
        setError('Role not assigned. Contact admin.')
        return
      }

      // Redirect customers to customer portal, others to their respective portals
      if (userRole === 'customer') {
        navigate('/customer/dashboard')
      } else if (userRole === 'admin') {
        navigate('/admin')
      } else if (userRole === 'crew') {
        navigate('/crew')
      } else {
        setError('Role not assigned. Contact admin.')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An error occurred during login. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendLoginLink = async () => {
    if (!email || !email.trim()) {
      toast.error('Enter your email first.')
      return
    }

    setIsSendingLink(true)

    try {
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : import.meta.env.VITE_SITE_URL || 'http://localhost:5173'

      const { data, error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      })

      if (error) {
        console.error('Error sending login link:', error)
        toast.error(`Failed to send login link: ${error.message || 'Unknown error'}`)
        return
      }

      toast.success('Check your email for a login link.')
    } catch (err) {
      console.error('Error sending login link:', err)
      toast.error('Failed to send login link. Please try again.')
    } finally {
      setIsSendingLink(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Brand Logo/Name */}
          {brand?.logoUrl && (
            <div className="flex justify-center mb-6">
              <img
                src={brand.logoUrl}
                alt={companyDisplayName}
                className="h-12 w-auto object-contain"
              />
            </div>
          )}
          
          <h1 
            className="text-2xl font-bold mb-2 text-center"
            style={{ color: 'var(--brand-primary, #22c55e)' }}
          >
            {companyDisplayName}
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">Customer Portal Login</p>

          <form onSubmit={handleLogin}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2"
              disabled={loading || isSendingLink}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">or</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full py-2"
              onClick={handleSendLoginLink}
              disabled={!email.trim() || isSendingLink || loading}
            >
              {isSendingLink ? 'Sending...' : 'Email me a login link'}
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-slate-600">
            <p>Need help? Contact support for assistance.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
