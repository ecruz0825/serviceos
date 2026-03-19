import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { supabase } from '../../supabaseClient'
import { useUser } from '../../context/UserContext'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const { session, role } = useUser()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (session?.user?.id) {
      if (role === 'customer') {
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Email is required.')
      return
    }

    setSubmitting(true)
    try {
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : import.meta.env.VITE_SITE_URL || 'http://localhost:5173'

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      })

      if (resetError) {
        console.error('[ForgotPassword] resetPasswordForEmail error:', resetError)
        setError('Unable to send reset email right now. Please try again.')
        return
      }

      setSuccess('If an account exists for that email, a reset link has been sent.')
    } catch (err) {
      console.error('[ForgotPassword] unexpected error:', err)
      setError('Unable to send reset email right now. Please try again.')
    } finally {
      setSubmitting(false)
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
            Reset Password
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">
            Enter your work email and we&apos;ll send a reset link.
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full py-2" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="text-blue-600 hover:text-blue-700">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
