import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import toast from 'react-hot-toast'
import { User, Mail, Phone, MapPin } from 'lucide-react'

export default function ProfilePage() {
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState(null)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
  })

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customerData, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error

      if (customerData) {
        setCustomer(customerData)
        setFormData({
          full_name: customerData.full_name || '',
          email: customerData.email || user.email || '',
          phone: customerData.phone || '',
          address: customerData.address || '',
        })
      }
    } catch (err) {
      console.error('Error loading profile:', err)
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!customer) return

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          address: formData.address,
        })
        .eq('id', customer.id)

      if (error) throw error

      toast.success('Profile updated successfully')
      setEditing(false)
      loadProfile()
    } catch (err) {
      console.error('Error updating profile:', err)
      toast.error('Failed to update profile')
    }
  }

  if (loading) {
    return (
      <CustomerAppShell>
        <LoadingSkeleton count={1} />
      </CustomerAppShell>
    )
  }

  if (!customer) {
    return (
      <CustomerAppShell>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Profile not found</h2>
          <p className="text-slate-600">Unable to load your profile information.</p>
        </div>
      </CustomerAppShell>
    )
  }

  return (
    <CustomerAppShell title="Profile">
      <div className="max-w-2xl">
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Account Information</h2>
            {!editing && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit Profile
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <User className="h-4 w-4 inline mr-1" />
                Full Name
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2"
                  style={{ focusRingColor: 'var(--brand-primary, #22c55e)' }}
                />
              ) : (
                <p className="text-slate-900">{customer.full_name || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Mail className="h-4 w-4 inline mr-1" />
                Email
              </label>
              <p className="text-slate-900">{formData.email || '—'}</p>
              <p className="text-xs text-slate-500 mt-1">Email cannot be changed here. Contact support to update your email.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Phone className="h-4 w-4 inline mr-1" />
                Phone
              </label>
              {editing ? (
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2"
                  style={{ focusRingColor: 'var(--brand-primary, #22c55e)' }}
                />
              ) : (
                <p className="text-slate-900">{customer.phone || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <MapPin className="h-4 w-4 inline mr-1" />
                Address
              </label>
              {editing ? (
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2"
                  style={{ focusRingColor: 'var(--brand-primary, #22c55e)' }}
                />
              ) : (
                <p className="text-slate-900 whitespace-pre-wrap">{customer.address || '—'}</p>
              )}
            </div>

            {editing && (
              <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
                <Button variant="primary" onClick={handleSave}>
                  Save Changes
                </Button>
                <Button variant="tertiary" onClick={() => {
                  setEditing(false)
                  loadProfile() // Reset form
                }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </CustomerAppShell>
  )
}
