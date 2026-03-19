import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { supabase } from '../../supabaseClient'
import { useUser } from '../../context/UserContext'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { session, loading } = useUser()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!loading && !session?.user?.id) {
      setError('Reset session not found or expired. Please request a new reset link.')
    }
  }, [loading, session])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const trimmedPassword = password.trim()
    if (trimmedPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      setError('Passwords do not match.')
      return
    }

    if (!session?.user?.id) {
      setError('Reset session not found or expired. Please request a new reset link.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: trimmedPassword })
      if (updateError) {
        console.error('[ResetPassword] updateUser error:', updateError)
        setError('Unable to update password. Please request a new reset link.')
        return
      }

      setSuccess('Password updated successfully. Redirecting to login...')
      await supabase.auth.signOut()
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 800)
    } catch (err) {
      console.error('[ResetPassword] unexpected error:', err)
      setError('Unable to update password. Please request a new reset link.')
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
            Set New Password
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">
            Choose a new password for your account.
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

            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full py-2" disabled={submitting || !session?.user?.id}>
              {submitting ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
