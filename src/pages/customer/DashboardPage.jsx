import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import SummaryCard from '../../components/customer/SummaryCard'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import EmptyState from '../../components/customer/EmptyState'
import { Briefcase, FileText, Receipt, DollarSign, Calendar, ArrowRight, Clock } from 'lucide-react'

export default function DashboardPage() {
  const { brand } = useBrand()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    totalJobs: 0,
    openQuotes: 0,
    outstandingBalance: 0,
    upcomingJobs: 0,
  })
  const [recentJobs, setRecentJobs] = useState([])
  const [recentQuotes, setRecentQuotes] = useState([])

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get customer ID
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!customer) {
        setLoading(false)
        return
      }

      // Try to use RPC for summary, fallback to direct queries
      let summaryData = null
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_customer_dashboard_summary', {
          p_customer_id: customer.id
        })
        if (!rpcError && rpcData?.status === 'success') {
          summaryData = rpcData
        }
      } catch (err) {
        console.warn('RPC not available, using direct queries:', err)
      }

      // Set summary from RPC or calculate from direct queries
      if (summaryData) {
        setSummary({
          totalJobs: summaryData.total_jobs || 0,
          openQuotes: summaryData.open_quotes || 0,
          outstandingBalance: summaryData.outstanding_balance || 0,
          upcomingJobs: summaryData.upcoming_jobs || 0,
        })
      } else {
        // Fallback to direct queries if RPC not available
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, job_cost, service_date, status, created_at')
          .eq('customer_id', customer.id)

        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, quote_number, status, total, created_at')
          .eq('customer_id', customer.id)
          .in('status', ['draft', 'sent'])

        const { data: payments } = await supabase
          .from('payments')
          .select('job_id, amount')
          .in('job_id', (jobs || []).map(j => j.id))
          .eq('status', 'posted')

        // Calculate totals
        const totalBilled = (jobs || []).reduce((sum, j) => sum + (parseFloat(j.job_cost) || 0), 0)
        const totalPaid = (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        const outstanding = Math.max(totalBilled - totalPaid, 0)

        const upcomingJobs = (jobs || []).filter(j => {
          if (!j.service_date) return false
          const serviceDate = new Date(j.service_date)
          return serviceDate >= new Date() && j.status !== 'completed'
        }).length

        setSummary({
          totalJobs: jobs?.length || 0,
          openQuotes: quotes?.length || 0,
          outstandingBalance: outstanding,
          upcomingJobs,
        })

        // Recent jobs
        const recent = (jobs || [])
          .sort((a, b) => new Date(b.service_date || 0) - new Date(a.service_date || 0))
          .slice(0, 3)
        setRecentJobs(recent)

        // Recent quotes
        const recentQuotesData = (quotes || [])
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
          .slice(0, 3)
        setRecentQuotes(recentQuotesData)
      }

      // Load recent items (always needed for display)
      if (summaryData) {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, job_cost, service_date, status, created_at')
          .eq('customer_id', customer.id)
          .order('service_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(3)

        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, quote_number, status, total, created_at')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(3)

        setRecentJobs(jobs || [])
        setRecentQuotes(quotes || [])
      }
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0)
  }

  if (loading) {
    return (
      <CustomerAppShell>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </CustomerAppShell>
    )
  }

  return (
    <CustomerAppShell>
      <div className="space-y-8">
        {/* Summary Cards */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              title="Total Jobs"
              value={summary.totalJobs}
              icon={Briefcase}
              onClick={() => navigate('/customer/jobs')}
            />
            <SummaryCard
              title="Open Quotes"
              value={summary.openQuotes}
              icon={FileText}
              onClick={() => navigate('/customer/quotes')}
            />
            <SummaryCard
              title="Outstanding Balance"
              value={formatCurrency(summary.outstandingBalance)}
              icon={DollarSign}
              onClick={() => navigate('/customer/invoices')}
            />
            <SummaryCard
              title="Upcoming Jobs"
              value={summary.upcomingJobs}
              icon={Calendar}
              onClick={() => navigate('/customer/jobs')}
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => navigate('/customer/jobs')}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
            >
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: `${brand?.primaryColor || '#22c55e'}15` }}
              >
                <Briefcase 
                  className="h-5 w-5"
                  style={{ color: brand?.primaryColor || '#22c55e' }}
                />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">My Jobs</span>
            </button>
            <button
              onClick={() => navigate('/customer/quotes')}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
            >
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: `${brand?.primaryColor || '#22c55e'}15` }}
              >
                <FileText 
                  className="h-5 w-5"
                  style={{ color: brand?.primaryColor || '#22c55e' }}
                />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Quotes</span>
            </button>
            <button
              onClick={() => navigate('/customer/invoices')}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
            >
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: `${brand?.primaryColor || '#22c55e'}15` }}
              >
                <Receipt 
                  className="h-5 w-5"
                  style={{ color: brand?.primaryColor || '#22c55e' }}
                />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Invoices</span>
            </button>
            <button
              onClick={() => navigate('/customer/schedule')}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
            >
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: `${brand?.primaryColor || '#22c55e'}15` }}
              >
                <Calendar 
                  className="h-5 w-5"
                  style={{ color: brand?.primaryColor || '#22c55e' }}
                />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Schedule</span>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Jobs */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900">Recent Jobs</h3>
                <button
                  onClick={() => navigate('/customer/jobs')}
                  className="flex items-center gap-1 text-sm font-medium hover:gap-2 transition-all"
                  style={{ color: brand?.primaryColor || '#22c55e' }}
                >
                  View All
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {recentJobs.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No jobs yet"
                  description="Your jobs will appear here once they're created."
                />
              ) : (
                <div className="space-y-3">
                  {recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 cursor-pointer transition-all"
                      onClick={() => navigate(`/customer/jobs/${job.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${brand?.primaryColor || '#22c55e'}10` }}
                        >
                          <Briefcase 
                            className="h-4 w-4"
                            style={{ color: brand?.primaryColor || '#22c55e' }}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Job #{job.id.slice(0, 8)}</p>
                          <p className="text-sm text-slate-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {job.service_date ? new Date(job.service_date).toLocaleDateString() : 'Not scheduled'}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(job.job_cost || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Quotes */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900">Recent Quotes</h3>
                <button
                  onClick={() => navigate('/customer/quotes')}
                  className="flex items-center gap-1 text-sm font-medium hover:gap-2 transition-all"
                  style={{ color: brand?.primaryColor || '#22c55e' }}
                >
                  View All
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {recentQuotes.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No quotes yet"
                  description="Your quotes will appear here once they're sent."
                />
              ) : (
                <div className="space-y-3">
                  {recentQuotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 cursor-pointer transition-all"
                      onClick={() => navigate(`/customer/quotes/${quote.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${brand?.primaryColor || '#22c55e'}10` }}
                        >
                          <FileText 
                            className="h-4 w-4"
                            style={{ color: brand?.primaryColor || '#22c55e' }}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{quote.quote_number || `Quote #${quote.id.slice(0, 8)}`}</p>
                          <p className="text-sm text-slate-600 capitalize">{quote.status}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(quote.total || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CustomerAppShell>
  )
}
