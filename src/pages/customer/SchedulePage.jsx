import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import Card from '../../components/ui/Card'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import EmptyState from '../../components/customer/EmptyState'
import Button from '../../components/ui/Button'
import { Calendar } from 'lucide-react'

export default function SchedulePage() {
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [scheduleRequests, setScheduleRequests] = useState([])

  useEffect(() => {
    loadScheduleRequests()
  }, [])

  async function loadScheduleRequests() {
    setLoading(true)
    try {
      // Phase 4.2: Implement schedule request loading
      // For now, show empty state
      setScheduleRequests([])
    } catch (err) {
      console.error('Error loading schedule requests:', err)
      setScheduleRequests([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerAppShell title="Schedule">
      <div className="space-y-6">
        {loading ? (
          <LoadingSkeleton count={3} />
        ) : (
          <EmptyState
            icon={Calendar}
            title="Schedule Requests"
            description="Schedule request functionality will be available in Phase 4.2. For now, please contact us to schedule your service."
          />
        )}
      </div>
    </CustomerAppShell>
  )
}
