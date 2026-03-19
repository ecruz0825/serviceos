import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Link, useNavigate } from 'react-router-dom'
import Button from './components/ui/Button'

import { useUser } from './context/UserContext'

export default function Login() {
  const { session, role } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    if (session?.user?.id) {
      if (role === 'platform_admin') {
        navigate('/platform', { replace: true })
      } else if (role === 'customer') {
        navigate('/customer/dashboard', { replace: true })
      } else if (role === 'admin') {
        navigate('/admin', { replace: true })
      } else if (role === 'manager' || role === 'dispatcher') {
        navigate('/admin/revenue-hub', { replace: true })
      } else if (role === 'crew') {
        navigate('/crew', { replace: true })
      }
    }
  }, [session, role, navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    // Trim email to avoid whitespace issues
    const emailTrimmed = email.trim()
    
    console.log('[AdminLogin] Signing in', { 
      email: emailTrimmed, 
      hasPassword: !!password 
    })

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailTrimmed,
      password,
    })

    if (error) {
      console.error('[AdminLogin] signInWithPassword error', {
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

    // Redirect based on role
    if (userRole === 'platform_admin') {
      navigate('/platform')
    } else if (userRole === 'admin') {
      navigate('/admin')
    } else if (userRole === 'manager' || userRole === 'dispatcher') {
      navigate('/admin/revenue-hub')
    } else if (userRole === 'crew') {
      navigate('/crew')
    } else if (userRole === 'customer') {
      navigate('/customer/dashboard')
    } else {
      setError('Role not assigned. Contact admin.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 
            className="text-2xl font-bold mb-2 text-center"
            style={{ color: 'var(--brand-primary, #22c55e)' }}
          >
            Login
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">Admin & Crew Portal</p>

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
                disabled={false}
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
                disabled={false}
              />
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            <p>Need help? Contact support for assistance.</p>
          </div>
        </div>
      </div>
    </div>
  )
}