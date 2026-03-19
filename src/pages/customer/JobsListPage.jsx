import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import JobCard from '../../components/customer/JobCard'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import EmptyState from '../../components/customer/EmptyState'
import Button from '../../components/ui/Button'
import { Briefcase, Filter } from 'lucide-react'

export default function JobsListPage() {
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('all') // all, upcoming, completed

  useEffect(() => {
    loadJobs()
  }, [filter])

  async function loadJobs() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!customer) {
        setLoading(false)
        return
      }

      // Use exact same query pattern as DashboardPage - proven to work
      // Match DashboardPage format exactly: single-line comma-separated string
      // Only include fields that exist and are needed
      const { data: allJobs, error } = await supabase
        .from('jobs')
        .select('id, services_performed, status, job_cost, notes, service_date, before_image, after_image, invoice_path, completed_at, created_at')
        .eq('customer_id', customer.id)
        .order('service_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) {
        // Enhanced error logging to see exact Supabase/PostgREST error
        console.error('JobsListPage query error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error
        })
        throw error
      }

      // Apply client-side filtering (same pattern as DashboardPage uses)
      let filteredJobs = allJobs || []
      
      if (filter === 'upcoming') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        filteredJobs = filteredJobs.filter(job => {
          if (!job.service_date) return false
          const serviceDate = new Date(job.service_date)
          serviceDate.setHours(0, 0, 0, 0)
          return serviceDate >= today && job.status !== 'Completed' && job.status !== 'Canceled'
        })
      } else if (filter === 'completed') {
        filteredJobs = filteredJobs.filter(job => {
          return job.completed_at || job.status === 'Completed'
        })
      }
      // 'all' filter shows all jobs (no filtering)

      setJobs(filteredJobs)
    } catch (err) {
      // Enhanced error logging to see exact Supabase/PostgREST error
      console.error('JobsListPage loadJobs error:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        fullError: err
      })
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerAppShell title="My Jobs">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={filter === 'all' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Jobs
          </Button>
          <Button
            variant={filter === 'upcoming' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('upcoming')}
          >
            Upcoming
          </Button>
          <Button
            variant={filter === 'completed' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('completed')}
          >
            Completed
          </Button>
        </div>

        {/* Jobs List */}
        {loading ? (
          <LoadingSkeleton count={3} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs found"
            description={
              filter === 'all'
                ? "You don't have any jobs yet. Contact us to get started!"
                : filter === 'upcoming'
                ? "You don't have any upcoming jobs scheduled."
                : "You don't have any completed jobs yet."
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </CustomerAppShell>
  )
}
