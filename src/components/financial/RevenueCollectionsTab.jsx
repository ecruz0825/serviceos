import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import Card from '../ui/Card'
import Button from '../ui/Button'
import LogCollectionActionModal from '../collections/LogCollectionActionModal'
import SetFollowupModal from '../collections/SetFollowupModal'
import SendCollectionEmailModal from '../collections/SendCollectionEmailModal'
import { warnIfMissingColumns } from '../../utils/schemaGuards'
import { exportRowsAsCsv } from '../../utils/exportCsv'
import { formatDate } from '../../utils/dateFormatting'
import { formatCurrency } from '../../utils/currencyFormatting'

/**
 * RevenueCollectionsTab - Collections management section extracted from RevenueHub
 * 
 * Handles:
 * - Collections Queue
 * - Collections Activity
 * - Collections Escalations
 * - Collections Cases
 * - Comms Activity
 * - Case Detail Modal
 * - All collections-related modals
 */
export default function RevenueCollectionsTab({ companyId, userRole, currentUserId, onSyncCases }) {
  // Collections data state
  const [collectionsQueue, setCollectionsQueue] = useState([])
  const [collectionsQueueLoading, setCollectionsQueueLoading] = useState(false)
  const [collectionsActivity, setCollectionsActivity] = useState([])
  const [collectionsActivityLoading, setCollectionsActivityLoading] = useState(false)
  const [collectionsFollowups, setCollectionsFollowups] = useState([])
  const [collectionsFollowupsLoading, setCollectionsFollowupsLoading] = useState(false)
  const [collectionsEscalations, setCollectionsEscalations] = useState([])
  const [collectionsEscalationsLoading, setCollectionsEscalationsLoading] = useState(false)
  const [commTemplates, setCommTemplates] = useState([])
  const [commTemplatesLoading, setCommTemplatesLoading] = useState(false)
  const [commsActivity, setCommsActivity] = useState([])
  const [commsActivityLoading, setCommsActivityLoading] = useState(false)
  const [collectionsCases, setCollectionsCases] = useState([])
  const [collectionsCasesLoading, setCollectionsCasesLoading] = useState(false)
  const [caseMetrics, setCaseMetrics] = useState(null)
  const [caseMetricsLoading, setCaseMetricsLoading] = useState(false)
  
  // Filter state
  const [collectionsFilter, setCollectionsFilter] = useState('all')
  const [casesStatusFilter, setCasesStatusFilter] = useState(null)
  const [casesAssignedFilter, setCasesAssignedFilter] = useState(null)
  const [casesSlaFilter, setCasesSlaFilter] = useState('all')
  
  // Collections Ops modal state
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [actionModalType, setActionModalType] = useState(null)
  const [actionModalCustomerId, setActionModalCustomerId] = useState(null)
  const [actionModalCustomerName, setActionModalCustomerName] = useState('')
  const [actionModalLoading, setActionModalLoading] = useState(false)
  
  // Follow-up modal state
  const [followupModalOpen, setFollowupModalOpen] = useState(false)
  const [followupModalCustomerId, setFollowupModalCustomerId] = useState(null)
  const [followupModalCustomerName, setFollowupModalCustomerName] = useState('')
  const [followupModalExistingDate, setFollowupModalExistingDate] = useState(null)
  const [followupModalLoading, setFollowupModalLoading] = useState(false)
  
  // Send Email modal state
  const [sendEmailModalOpen, setSendEmailModalOpen] = useState(false)
  const [sendEmailCustomerId, setSendEmailCustomerId] = useState(null)
  const [sendEmailDefaultTemplateKey, setSendEmailDefaultTemplateKey] = useState(null)
  
  // Case detail modal state
  const [caseDetailModalOpen, setCaseDetailModalOpen] = useState(false)
  const [caseDetail, setCaseDetail] = useState(null)
  const [caseDetailLoading, setCaseDetailLoading] = useState(false)
  const [availableUsers, setAvailableUsers] = useState([])
  const [caseDetailSaving, setCaseDetailSaving] = useState(false)
  
  // Case detail form state
  const [caseDetailAssignedTo, setCaseDetailAssignedTo] = useState(null)
  const [caseDetailDueAt, setCaseDetailDueAt] = useState('')
  const [caseDetailNextAction, setCaseDetailNextAction] = useState('')
  const [caseDetailNote, setCaseDetailNote] = useState('')
  const [syncingCases, setSyncingCases] = useState(false)

  // Fetch Collections Queue
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchCollectionsQueue = async () => {
      setCollectionsQueueLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_queue_for_company', {
          p_limit: 25,
          p_as_of: new Date().toISOString()
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Collections queue not available for this role')
            setCollectionsQueue([])
          } else {
            console.error('Error fetching collections queue:', error)
            setCollectionsQueue([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          // Schema guardrail: warn if expected columns are missing
          if (data.length > 0) {
            warnIfMissingColumns('RevenueCollectionsTab.collectionsQueue', data, [
              'customer_id',
              'customer_name',
              'open_invoice_count',
              'total_balance_due',
              'oldest_due_date',
              'days_past_due_max',
              'overdue_balance',
              'last_payment_at',
              'avg_days_to_pay',
              'priority_score',
              'suggested_action',
              'last_action_at',
              'last_action_type',
              'promise_breached',
              'days_since_last_action',
              'next_followup_at',
              'followup_due',
              'last_comm_at',
              'comm_count_30d'
            ])
          }
          setCollectionsQueue(data || [])
        }
      } catch (err) {
        console.error('Error fetching collections queue:', err)
        setCollectionsQueue([])
      } finally {
        setCollectionsQueueLoading(false)
      }
    }

    fetchCollectionsQueue()
  }, [companyId, userRole])

  // Fetch Collections Activity
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCollectionsActivity = async () => {
      setCollectionsActivityLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_activity_for_company', {
          p_limit: 25
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Collections activity not available for this role')
            setCollectionsActivity([])
          } else {
            console.error('Error fetching collections activity:', error)
            setCollectionsActivity([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          if (data.length > 0) {
            warnIfMissingColumns('RevenueCollectionsTab.collectionsActivity', data, [
              'created_at',
              'customer_id',
              'customer_name',
              'invoice_id',
              'action_type',
              'action_note',
              'promise_date',
              'promise_amount',
              'created_by_name'
            ])
          }
          setCollectionsActivity(data || [])
        }
      } catch (err) {
        console.error('Error fetching collections activity:', err)
        setCollectionsActivity([])
      } finally {
        setCollectionsActivityLoading(false)
      }
    }
    fetchCollectionsActivity()
  }, [companyId, userRole])

  // Fetch Collections Follow-ups
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCollectionsFollowups = async () => {
      setCollectionsFollowupsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_followups_for_company', {
          p_as_of: new Date().toISOString(),
          p_days: 14
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Collections follow-ups not available for this role')
            setCollectionsFollowups([])
          } else {
            console.error('Error fetching collections follow-ups:', error)
            setCollectionsFollowups([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          if (data.length > 0) {
            warnIfMissingColumns('RevenueCollectionsTab.collectionsFollowups', data, [
              'id',
              'customer_id',
              'customer_name',
              'next_followup_at',
              'status',
              'created_at'
            ])
          }
          setCollectionsFollowups(data || [])
        }
      } catch (err) {
        console.error('Error fetching collections follow-ups:', err)
        setCollectionsFollowups([])
      } finally {
        setCollectionsFollowupsLoading(false)
      }
    }
    fetchCollectionsFollowups()
  }, [companyId, userRole])

  // Fetch Collections Escalations
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCollectionsEscalations = async () => {
      setCollectionsEscalationsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_escalations_for_company', {
          p_limit: 25,
          p_as_of: new Date().toISOString()
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Collections escalations not available for this role')
            setCollectionsEscalations([])
          } else {
            console.error('Error fetching collections escalations:', error)
            setCollectionsEscalations([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          if (data.length > 0) {
            warnIfMissingColumns('RevenueCollectionsTab.collectionsEscalations', data, [
              'customer_id',
              'customer_name',
              'overdue_balance',
              'total_balance_due',
              'days_past_due_max',
              'promise_breached',
              'followup_due',
              'next_followup_at',
              'last_action_at',
              'last_action_type',
              'escalation_level',
              'reason',
              'recommended_action',
              'priority_score',
              'last_comm_at',
              'comm_count_30d'
            ])
          }
          setCollectionsEscalations(data || [])
        }
      } catch (err) {
        console.error('Error fetching collections escalations:', err)
        setCollectionsEscalations([])
      } finally {
        setCollectionsEscalationsLoading(false)
      }
    }
    fetchCollectionsEscalations()
  }, [companyId, userRole])

  // Fetch Communication Templates
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCommTemplates = async () => {
      setCommTemplatesLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_comm_templates_for_company')

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Comm templates not available for this role')
            setCommTemplates([])
          } else {
            console.error('Error fetching comm templates:', error)
            setCommTemplates([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          setCommTemplates(data || [])
        }
      } catch (err) {
        console.error('Error fetching comm templates:', err)
        setCommTemplates([])
      } finally {
        setCommTemplatesLoading(false)
      }
    }
    fetchCommTemplates()
  }, [companyId, userRole])

  // Fetch Communications Activity
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCommsActivity = async () => {
      setCommsActivityLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_comms_activity_for_company', {
          p_limit: 25
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Comms activity not available for this role')
            setCommsActivity([])
          } else {
            console.error('Error fetching comms activity:', error)
            setCommsActivity([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          if (data.length > 0) {
            warnIfMissingColumns('RevenueCollectionsTab.commsActivity', data, [
              'created_at',
              'customer_id',
              'customer_name',
              'channel',
              'template_key',
              'to_address',
              'subject',
              'created_by_name'
            ])
          }
          setCommsActivity(data || [])
        }
      } catch (err) {
        console.error('Error fetching comms activity:', err)
        setCommsActivity([])
      } finally {
        setCommsActivityLoading(false)
      }
    }
    fetchCommsActivity()
  }, [companyId, userRole])

  // Fetch Collections Cases
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCollectionsCases = async () => {
      setCollectionsCasesLoading(true)
      try {
        // Determine assigned_to filter value
        let assignedToParam = null
        if (casesAssignedFilter === 'mine' && currentUserId) {
          assignedToParam = currentUserId
        } else if (casesAssignedFilter === 'unassigned') {
          // We'll need to handle this client-side or use a special value
          // For now, pass null and filter client-side
          assignedToParam = null
        }

        const { data, error } = await supabase.rpc('get_collections_cases_for_company', {
          p_status: casesStatusFilter || null,
          p_assigned_to: assignedToParam,
          p_limit: 100,
          p_offset: 0
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Collections cases not available for this role')
            setCollectionsCases([])
          } else {
            console.error('Error fetching collections cases:', error)
            toast.error('Failed to load collections cases')
            setCollectionsCases([])
          }
          return
        }

        if (data && Array.isArray(data)) {
          // Filter for unassigned if needed (since RPC doesn't support null filter directly)
          let filteredData = data
          if (casesAssignedFilter === 'unassigned') {
            filteredData = data.filter(c => c.assigned_to === null)
          }

          if (filteredData.length > 0) {
            warnIfMissingColumns('RevenueCollectionsTab.collectionsCases', filteredData, [
              'id',
              'customer_id',
              'status',
              'priority',
              'assigned_to',
              'due_at',
              'next_action',
              'created_at',
              'updated_at',
              'closed_at',
              'customer_name',
              'customer_email',
              'is_overdue',
              'is_due_soon',
              'days_overdue',
              'sla_breached',
              'assigned_owner_name'
            ])
          }
          setCollectionsCases(filteredData || [])
        }
      } catch (err) {
        console.error('Error fetching collections cases:', err)
        toast.error('An unexpected error occurred')
        setCollectionsCases([])
      } finally {
        setCollectionsCasesLoading(false)
      }
    }
    fetchCollectionsCases()
  }, [companyId, userRole, casesStatusFilter, casesAssignedFilter, currentUserId])

  // Fetch available users for case assignment
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchAvailableUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('company_id', companyId)
          .in('role', ['admin', 'manager', 'dispatcher'])
          .order('full_name')
        
        if (error) {
          console.error('Error fetching available users:', error)
          setAvailableUsers([])
          return
        }
        
        setAvailableUsers(data || [])
      } catch (err) {
        console.error('Error fetching available users:', err)
        setAvailableUsers([])
      }
    }
    
    fetchAvailableUsers()
  }, [companyId, userRole])

  // Fetch case metrics
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) { return }
    
    const fetchCaseMetrics = async () => {
      setCaseMetricsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_collections_case_metrics', {
          p_as_of: new Date().toISOString()
        })
        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Case metrics not available for this role')
            setCaseMetrics(null)
          } else {
            console.error('Error fetching case metrics:', error)
            setCaseMetrics(null)
          }
          return
        }
        if (data && data.length > 0) {
          setCaseMetrics(data[0])
        } else {
          setCaseMetrics(null)
        }
      } catch (err) {
        console.error('Error fetching case metrics:', err)
        setCaseMetrics(null)
      } finally {
        setCaseMetricsLoading(false)
      }
    }
    fetchCaseMetrics()
  }, [companyId, userRole])

  // Handle sync cases from escalations
  const handleSyncCases = async () => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) return

    setSyncingCases(true)
    try {
      const { data, error } = await supabase.rpc('sync_collections_cases_from_escalations', {
        p_as_of: new Date().toISOString(),
        p_limit: 200
      })

      if (error) {
        console.error('Error syncing cases:', error)
        toast.error(error.message || 'Failed to sync cases from escalations')
        return
      }

      if (data && data.length > 0) {
        const result = data[0]
        const createdCount = result.cases_created_count || 0
        const existingCount = result.cases_existing_count || 0
        toast.success(`Cases synced: ${createdCount} created, ${existingCount} already active`)

        // Refetch cases queue
        const { data: queueData } = await supabase.rpc('get_collections_cases_for_company', {
          p_status: casesStatusFilter || null,
          p_assigned_to: casesAssignedFilter === 'mine' && currentUserId ? currentUserId : null,
          p_limit: 100,
          p_offset: 0
        })
        if (queueData) {
          let filteredData = queueData
          if (casesAssignedFilter === 'unassigned') {
            filteredData = queueData.filter(c => c.assigned_to === null)
          }
          setCollectionsCases(filteredData || [])
        }

        // Refetch escalations queue
        const { data: escalationsData } = await supabase.rpc('get_collections_escalations_for_company', {
          p_limit: 25,
          p_as_of: new Date().toISOString()
        })
        if (escalationsData) {
          setCollectionsEscalations(escalationsData || [])
        }

        // Refetch case metrics
        const { data: metricsData } = await supabase.rpc('get_collections_case_metrics', {
          p_as_of: new Date().toISOString()
        })
        if (metricsData && metricsData.length > 0) {
          setCaseMetrics(metricsData[0])
        }
      } else {
        toast.error('Unexpected response from sync operation')
      }
    } catch (err) {
      console.error('Error syncing cases:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setSyncingCases(false)
    }
  }

  // Helper function to refetch case metrics (called after case write actions)
  const refetchCaseMetrics = async () => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) return

    try {
      const { data, error } = await supabase.rpc('get_collections_case_metrics', {
        p_as_of: new Date().toISOString()
      })
      if (error) {
        console.error('Error refetching case metrics:', error)
        return
      }
      if (data && data.length > 0) {
        setCaseMetrics(data[0])
      }
    } catch (err) {
      console.error('Error refetching case metrics:', err)
    }
  }

  const handleExportCollectionsQueueCsv = () => {
    if (!Array.isArray(collectionsQueue) || collectionsQueue.length === 0) return
    exportRowsAsCsv({
      filename: 'collections-queue.csv',
      rows: collectionsQueue,
      columns: [
        { key: 'customer_name', header: 'Customer' },
        { key: 'open_invoice_count', header: 'Open Invoices', format: (value) => Number(value || 0) },
        { key: 'total_balance_due', header: 'Total Due', format: (value) => Number(value || 0) },
        { key: 'overdue_balance', header: 'Overdue Due', format: (value) => Number(value || 0) },
        { key: 'oldest_due_date', header: 'Oldest Due', format: (value) => formatDate(value) },
        { key: 'days_past_due_max', header: 'Max Days Past Due', format: (value) => Number(value || 0) },
        { key: 'last_payment_at', header: 'Last Payment', format: (value) => formatDate(value) },
        { key: 'last_action_type', header: 'Last Action Type' },
        { key: 'last_action_at', header: 'Last Action At', format: (value) => formatDate(value) },
        { key: 'next_followup_at', header: 'Follow-up Date', format: (value) => formatDate(value) },
        { key: 'followup_due', header: 'Follow-up Due' },
        { key: 'priority_score', header: 'Priority', format: (value) => Number(value || 0) },
        { key: 'suggested_action', header: 'Recommended Action' }
      ]
    })
  }

  // Only render if user has appropriate role
  if (!userRole || !['admin', 'manager', 'dispatcher'].includes(userRole)) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Collections Queue */}
      {collectionsQueue.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Collections Queue</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCollectionsQueueCsv}
              disabled={collectionsQueueLoading || collectionsQueue.length === 0}
            >
              Export CSV
            </Button>
          </div>
          
          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setCollectionsFilter('all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                collectionsFilter === 'all'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setCollectionsFilter('broken_promises')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                collectionsFilter === 'broken_promises'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Broken Promises
            </button>
            <button
              onClick={() => setCollectionsFilter('stale')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                collectionsFilter === 'stale'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Stale (7+ days)
            </button>
            <button
              onClick={() => setCollectionsFilter('followup_due')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                collectionsFilter === 'followup_due'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Follow-up Due
            </button>
            <button
              onClick={() => setCollectionsFilter('high_balance')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                collectionsFilter === 'high_balance'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              High Balance
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Customer</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Open Invoices</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Total Due</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Overdue Due</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Oldest Due</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Max Days Past Due</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Last Payment</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Last Action</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Follow-up</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Last Contact</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Comms (30d)</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Priority</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Action</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {collectionsQueue
                  .filter((row) => {
                    if (collectionsFilter === 'all') return true
                    if (collectionsFilter === 'broken_promises') return row.promise_breached === true
                    if (collectionsFilter === 'stale') return row.days_since_last_action !== null && row.days_since_last_action >= 7
                    if (collectionsFilter === 'followup_due') return row.followup_due === true
                    if (collectionsFilter === 'high_balance') return (row.overdue_balance || 0) > 500
                    return true
                  })
                  .map((row) => (
                  <tr key={row.customer_id} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-900">{row.customer_name || 'Unknown'}</div>
                        {row.promise_breached && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title="Promise breached">
                            ⚠️
                          </span>
                        )}
                        {row.days_since_last_action !== null && row.days_since_last_action >= 7 && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" title={`${row.days_since_last_action} days since last action`}>
                            ⏱️
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-sm text-right text-slate-700">
                      {row.open_invoice_count || 0}
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-slate-900">
                      {formatCurrency(row.total_balance_due || 0)}
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-red-600">
                      {formatCurrency(row.overdue_balance || 0)}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.oldest_due_date ? formatDate(row.oldest_due_date) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-right text-slate-700">
                      {row.days_past_due_max || 0}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.last_payment_at ? formatDate(row.last_payment_at) : 'Never'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.last_action_at ? (
                        <div>
                          <div className="text-xs">{formatDate(row.last_action_at)}</div>
                          <div className="text-xs text-slate-500">
                            {row.last_action_type === 'contacted' ? 'Contacted' :
                             row.last_action_type === 'promise_to_pay' ? 'Promise' :
                             row.last_action_type === 'resolved' ? 'Resolved' :
                             row.last_action_type === 'note' ? 'Note' :
                             row.last_action_type || '—'}
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.next_followup_at ? (
                        <div>
                          <div className="text-xs">{formatDate(row.next_followup_at)}</div>
                          {row.followup_due && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                              Due
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.last_comm_at ? formatDate(row.last_comm_at) : 'Never'}
                    </td>
                    <td className="py-2 px-3 text-sm text-right text-slate-700">
                      {row.comm_count_30d || 0}
                    </td>
                    <td className="py-2 px-3 text-sm text-right">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {Math.round(row.priority_score || 0)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        row.suggested_action?.includes('Call') 
                          ? 'bg-red-100 text-red-700'
                          : row.suggested_action?.includes('reminder')
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {row.suggested_action || 'Monitor'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setActionModalType('contacted')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Contacted
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setActionModalType('promise_to_pay')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Promise
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setActionModalType('resolved')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Resolved
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setFollowupModalCustomerId(row.customer_id)
                            setFollowupModalCustomerName(row.customer_name || 'Unknown')
                            setFollowupModalExistingDate(row.next_followup_at || null)
                            setFollowupModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Set Follow-up
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            // Determine default template based on suggested_action
                            let defaultTemplate = 'friendly_reminder'
                            if (row.suggested_action?.includes('final')) {
                              defaultTemplate = 'final_notice'
                            } else if ((row.days_past_due_max || 0) >= 15) {
                              defaultTemplate = 'past_due_notice'
                            }
                            
                            setSendEmailCustomerId(row.customer_id)
                            setSendEmailDefaultTemplateKey(defaultTemplate)
                            setSendEmailModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Send Email
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Collections Activity Feed */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Collections Activity</h2>
        {collectionsActivityLoading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : collectionsActivity.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No collection actions logged yet</div>
        ) : (
          <div className="space-y-3">
            {collectionsActivity.map((activity, idx) => (
              <div key={idx} className="border-b pb-3 last:border-b-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        activity.action_type === 'contacted' ? 'bg-blue-100 text-blue-800' :
                        activity.action_type === 'promise_to_pay' ? 'bg-green-100 text-green-800' :
                        activity.action_type === 'resolved' ? 'bg-emerald-100 text-emerald-800' :
                        activity.action_type === 'note' ? 'bg-slate-100 text-slate-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {activity.action_type === 'contacted' ? 'Contacted' :
                         activity.action_type === 'promise_to_pay' ? 'Promise to Pay' :
                         activity.action_type === 'resolved' ? 'Resolved' :
                         activity.action_type === 'note' ? 'Note' :
                         activity.action_type}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{activity.customer_name || 'Unknown Customer'}</span>
                      {activity.promise_date && (
                        <span className="text-xs text-slate-600">
                          Promise: {formatDate(activity.promise_date)}
                        </span>
                      )}
                      {activity.promise_amount && (
                        <span className="text-xs text-slate-600">
                          ${parseFloat(activity.promise_amount).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {activity.action_note && (
                      <p className="text-sm text-slate-700 mt-1">{activity.action_note}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{formatDate(activity.created_at)}</div>
                    <div className="mt-1">{activity.created_by_name || 'Unknown'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Collections Escalations */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Escalations</h2>
        {collectionsEscalationsLoading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : collectionsEscalations.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No escalations at this time</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Customer</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Level</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Reason</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Recommended</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-slate-700">Overdue</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Next Follow-up</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Last Action</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {collectionsEscalations.map((row) => (
                  <tr key={row.customer_id} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm">
                      <div className="font-medium text-slate-900">{row.customer_name || 'Unknown'}</div>
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        row.escalation_level === 'critical' ? 'bg-red-100 text-red-800' :
                        row.escalation_level === 'high' ? 'bg-orange-100 text-orange-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {row.escalation_level?.toUpperCase() || 'MEDIUM'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.reason || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.recommended_action || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-medium text-red-600">
                      {formatCurrency(row.overdue_balance || 0)}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.next_followup_at ? (
                        <div>
                          <div className="text-xs">{formatDate(row.next_followup_at)}</div>
                          {row.followup_due && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                              Due
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {row.last_action_at ? (
                        <div>
                          <div className="text-xs">{formatDate(row.last_action_at)}</div>
                          <div className="text-xs text-slate-500">
                            {row.last_action_type === 'contacted' ? 'Contacted' :
                             row.last_action_type === 'promise_to_pay' ? 'Promise' :
                             row.last_action_type === 'resolved' ? 'Resolved' :
                             row.last_action_type === 'note' ? 'Note' :
                             row.last_action_type || '—'}
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setActionModalType('contacted')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Log Action
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setFollowupModalCustomerId(row.customer_id)
                            setFollowupModalCustomerName(row.customer_name || 'Unknown')
                            setFollowupModalExistingDate(row.next_followup_at || null)
                            setFollowupModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Set Follow-up
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            // Determine default template based on escalation level
                            let defaultTemplate = 'friendly_reminder'
                            if (row.escalation_level === 'critical') {
                              defaultTemplate = 'final_notice'
                            } else if (row.escalation_level === 'high') {
                              defaultTemplate = 'past_due_notice'
                            }
                            
                            setSendEmailCustomerId(row.customer_id)
                            setSendEmailDefaultTemplateKey(defaultTemplate)
                            setSendEmailModalOpen(true)
                          }}
                          className="text-xs"
                        >
                          Send Email
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Collections Cases */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Cases</h2>
        
        {/* Case Metrics KPI Cards */}
        {caseMetricsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Card key={i}>
                <div className="text-sm text-slate-600 mb-1">Loading...</div>
                <div className="text-2xl font-bold text-slate-900">—</div>
              </Card>
            ))}
          </div>
        ) : caseMetrics ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-4">
            <Card>
              <div className="text-sm text-slate-600 mb-1">Open Cases</div>
              <div className="text-2xl font-bold text-slate-900">
                {Math.round(caseMetrics.open_cases_count || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Overdue Cases</div>
              <div className="text-2xl font-bold text-red-600">
                {Math.round(caseMetrics.overdue_cases_count || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Closed (30d)</div>
              <div className="text-2xl font-bold text-green-600">
                {Math.round(caseMetrics.closed_last_30d_count || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Avg Days to Close</div>
              <div className="text-2xl font-bold text-blue-600">
                {caseMetrics.avg_days_to_close != null ? parseFloat(caseMetrics.avg_days_to_close).toFixed(1) : '—'}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Avg Days Open</div>
              <div className="text-2xl font-bold text-amber-600">
                {caseMetrics.avg_days_open_current != null ? parseFloat(caseMetrics.avg_days_open_current).toFixed(1) : '—'}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">SLA Breached</div>
              <div className="text-2xl font-bold text-red-600">
                {caseMetrics.sla_breached_count != null ? Math.round(caseMetrics.sla_breached_count) : '—'}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">SLA Breach %</div>
              <div className="text-2xl font-bold text-red-600">
                {caseMetrics.sla_breach_rate != null ? (parseFloat(caseMetrics.sla_breach_rate) * 100).toFixed(1) + '%' : '—'}
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Card key={i}>
                <div className="text-sm text-slate-600 mb-1">—</div>
                <div className="text-2xl font-bold text-slate-900">—</div>
              </Card>
            ))}
          </div>
        )}
        
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Status:</label>
            <select
              value={casesStatusFilter || 'all'}
              onChange={(e) => {
                const value = e.target.value === 'all' ? null : e.target.value
                setCasesStatusFilter(value)
              }}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Assigned:</label>
            <select
              value={casesAssignedFilter || 'all'}
              onChange={(e) => {
                const value = e.target.value === 'all' ? null : e.target.value
                setCasesAssignedFilter(value)
              }}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="unassigned">Unassigned</option>
              <option value="mine">Mine</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">SLA:</label>
            <select
              value={casesSlaFilter}
              onChange={(e) => {
                setCasesSlaFilter(e.target.value)
              }}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="breached">Breached Only</option>
            </select>
          </div>
        </div>

        {(() => {
          // Filter cases by SLA if needed
          const filteredCases = casesSlaFilter === 'breached'
            ? collectionsCases.filter(c => c.sla_breached === true)
            : collectionsCases

          return collectionsCasesLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No cases found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Customer</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Priority</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Status</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Owner</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Due</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Days Overdue</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">SLA</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Next Action</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Updated</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((caseItem) => (
                  <tr key={caseItem.id} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm font-medium text-slate-900">
                      {caseItem.customer_name || 'Unknown'}
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        caseItem.priority === 'critical' ? 'bg-red-100 text-red-800' :
                        caseItem.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                        caseItem.priority === 'normal' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {caseItem.priority || 'normal'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        caseItem.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                        caseItem.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {caseItem.status || 'open'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {caseItem.assigned_owner_name ? (
                        <span>{caseItem.assigned_owner_name}</span>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {caseItem.due_at ? formatDate(caseItem.due_at) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {caseItem.sla_breached ? (
                        <span className="font-bold text-red-600">
                          {caseItem.days_overdue || 0}d
                        </span>
                      ) : (
                        <span>{caseItem.due_at ? '0d' : '—'}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm">
                      {caseItem.sla_breached ? (
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                          BREACHED
                        </span>
                      ) : caseItem.is_due_soon ? (
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          DUE SOON
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {caseItem.next_action || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {caseItem.updated_at ? formatDate(caseItem.updated_at) : '—'}
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={async () => {
                          setCaseDetailLoading(true)
                          setCaseDetailModalOpen(true)
                          try {
                            const { data, error } = await supabase.rpc('get_collections_case_detail', {
                              p_case_id: caseItem.id
                            })
                            if (error) {
                              console.error('Error fetching case detail:', error)
                              toast.error(error.message || 'Failed to load case details')
                              setCaseDetail(null)
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              setCaseDetailAssignedTo(data[0].assigned_to || null)
                              setCaseDetailDueAt(data[0].due_at ? new Date(data[0].due_at).toISOString().slice(0, 16) : '')
                              setCaseDetailNextAction(data[0].next_action || '')
                              setCaseDetailNote('')
                            } else {
                              toast.error('Case not found')
                              setCaseDetail(null)
                            }
                          } catch (err) {
                            console.error('Error fetching case detail:', err)
                            toast.error('An unexpected error occurred')
                            setCaseDetail(null)
                          } finally {
                            setCaseDetailLoading(false)
                          }
                        }}
                        className="text-xs"
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </Card>

      {/* Communications Activity */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Comms Activity</h2>
        {commsActivityLoading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : commsActivity.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No communications logged yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">When</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Customer</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Channel</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Template</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">To</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">Subject</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-slate-700">By</th>
                </tr>
              </thead>
              <tbody>
                {commsActivity.map((activity, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {formatDate(activity.created_at)}
                    </td>
                    <td className="py-2 px-3 text-sm font-medium text-slate-900">
                      {activity.customer_name || 'Unknown'}
                    </td>
                    <td className="py-2 px-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        activity.channel === 'email' ? 'bg-blue-100 text-blue-800' :
                        activity.channel === 'sms' ? 'bg-green-100 text-green-800' :
                        activity.channel === 'call' ? 'bg-purple-100 text-purple-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {activity.channel || 'other'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {activity.template_key || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {activity.to_address || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {activity.subject || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {activity.created_by_name || 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Collections Action Modal */}
      <LogCollectionActionModal
        open={actionModalOpen}
        actionType={actionModalType}
        customerName={actionModalCustomerName}
        onConfirm={async (actionType, note, promiseDate, promiseAmount) => {
          setActionModalLoading(true)
          try {
            const { data, error } = await supabase.rpc('log_collection_action_for_customer', {
              p_customer_id: actionModalCustomerId,
              p_action_type: actionType,
              p_action_note: note,
              p_invoice_id: null, // Can be enhanced later to support invoice-specific actions
              p_promise_date: promiseDate,
              p_promise_amount: promiseAmount
            })

            if (error) {
              console.error('Error logging collection action:', error)
              toast.error(error.message || 'Failed to log action')
              return
            }

            toast.success('Action logged successfully')
            setActionModalOpen(false)
            
            // Refetch collections queue, activity, and escalations
            const { data: queueData } = await supabase.rpc('get_collections_queue_for_company', {
              p_limit: 25,
              p_as_of: new Date().toISOString()
            })
            if (queueData) {
              setCollectionsQueue(queueData || [])
            }

            const { data: activityData } = await supabase.rpc('get_collections_activity_for_company', {
              p_limit: 25
            })
            if (activityData) {
              setCollectionsActivity(activityData || [])
            }

            const { data: escalationsData } = await supabase.rpc('get_collections_escalations_for_company', {
              p_limit: 25,
              p_as_of: new Date().toISOString()
            })
            if (escalationsData) {
              setCollectionsEscalations(escalationsData || [])
            }
          } catch (err) {
            console.error('Error logging collection action:', err)
            toast.error('An unexpected error occurred')
          } finally {
            setActionModalLoading(false)
          }
        }}
        onCancel={() => {
          setActionModalOpen(false)
          setActionModalType(null)
          setActionModalCustomerId(null)
          setActionModalCustomerName('')
        }}
        loading={actionModalLoading}
      />

      {/* Set Follow-up Modal */}
      <SetFollowupModal
        open={followupModalOpen}
        customerName={followupModalCustomerName}
        existingFollowupAt={followupModalExistingDate}
        onConfirm={async (nextFollowupAt) => {
          setFollowupModalLoading(true)
          try {
            const { data, error } = await supabase.rpc('upsert_collection_followup', {
              p_customer_id: followupModalCustomerId,
              p_next_followup_at: nextFollowupAt
            })

            if (error) {
              console.error('Error setting follow-up:', error)
              toast.error(error.message || 'Failed to set follow-up')
              return
            }

            toast.success('Follow-up scheduled successfully')
            setFollowupModalOpen(false)
            
            // Refetch collections queue and follow-ups
            const { data: queueData } = await supabase.rpc('get_collections_queue_for_company', {
              p_limit: 25,
              p_as_of: new Date().toISOString()
            })
            if (queueData) {
              setCollectionsQueue(queueData || [])
            }

            const { data: followupsData } = await supabase.rpc('get_collections_followups_for_company', {
              p_as_of: new Date().toISOString(),
              p_days: 14
            })
            if (followupsData) {
              setCollectionsFollowups(followupsData || [])
            }

            // Refetch escalations after setting follow-up
            const { data: escalationsData } = await supabase.rpc('get_collections_escalations_for_company', {
              p_limit: 25,
              p_as_of: new Date().toISOString()
            })
            if (escalationsData) {
              setCollectionsEscalations(escalationsData || [])
            }

            // Refetch comms activity after setting follow-up
            const { data: commsActivityData } = await supabase.rpc('get_collections_comms_activity_for_company', {
              p_limit: 25
            })
            if (commsActivityData) {
              setCommsActivity(commsActivityData || [])
            }
          } catch (err) {
            console.error('Error setting follow-up:', err)
            toast.error('An unexpected error occurred')
          } finally {
            setFollowupModalLoading(false)
          }
        }}
        onCancel={() => {
          setFollowupModalOpen(false)
          setFollowupModalCustomerId(null)
          setFollowupModalCustomerName('')
          setFollowupModalExistingDate(null)
        }}
        loading={followupModalLoading}
      />

      {/* Send Email Modal */}
      <SendCollectionEmailModal
        open={sendEmailModalOpen}
        customerId={sendEmailCustomerId}
        defaultTemplateKey={sendEmailDefaultTemplateKey}
        onSent={async () => {
          // Refetch all collections data after logging communication
          const { data: queueData } = await supabase.rpc('get_collections_queue_for_company', {
            p_limit: 25,
            p_as_of: new Date().toISOString()
          })
          if (queueData) {
            setCollectionsQueue(queueData || [])
          }

          const { data: escalationsData } = await supabase.rpc('get_collections_escalations_for_company', {
            p_limit: 25,
            p_as_of: new Date().toISOString()
          })
          if (escalationsData) {
            setCollectionsEscalations(escalationsData || [])
          }

          const { data: commsActivityData } = await supabase.rpc('get_collections_comms_activity_for_company', {
            p_limit: 25
          })
          if (commsActivityData) {
            setCommsActivity(commsActivityData || [])
          }
        }}
        onClose={() => {
          setSendEmailModalOpen(false)
          setSendEmailCustomerId(null)
          setSendEmailDefaultTemplateKey(null)
        }}
      />

      {/* Case Detail Modal */}
      {caseDetailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget && !caseDetailLoading && !caseDetailSaving) {
              setCaseDetailModalOpen(false)
              setCaseDetail(null)
              setCaseDetailAssignedTo(null)
              setCaseDetailDueAt('')
              setCaseDetailNextAction('')
              setCaseDetailNote('')
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />

          {/* Modal Card */}
          <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 z-10 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Title */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Case Details
                </h3>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => {
                    setCaseDetailModalOpen(false)
                    setCaseDetail(null)
                  }}
                  disabled={caseDetailLoading || caseDetailSaving}
                >
                  Close
                </Button>
              </div>

              {caseDetailLoading ? (
                <div className="text-center py-8 text-slate-500">Loading case details...</div>
              ) : caseDetail ? (
                <div className="space-y-4">
                  {/* Customer Info */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Customer</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-600">Name:</span>
                        <span className="ml-2 font-medium text-slate-900">{caseDetail.customer_name || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Email:</span>
                        <span className="ml-2 text-slate-700">{caseDetail.customer_email || '—'}</span>
                      </div>
                      {caseDetail.customer_phone && (
                        <div>
                          <span className="text-slate-600">Phone:</span>
                          <span className="ml-2 text-slate-700">{caseDetail.customer_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Case Info */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Case Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-600">Status:</span>
                        <span className={`ml-2 inline-block px-2 py-1 rounded text-xs font-medium ${
                          caseDetail.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                          caseDetail.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {caseDetail.status || 'open'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600">Priority:</span>
                        <span className={`ml-2 inline-block px-2 py-1 rounded text-xs font-medium ${
                          caseDetail.priority === 'critical' ? 'bg-red-100 text-red-800' :
                          caseDetail.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                          caseDetail.priority === 'normal' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {caseDetail.priority || 'normal'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Owner Assignment */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Owner</h4>
                    <div className="flex items-center gap-2">
                      <select
                        value={caseDetailAssignedTo || ''}
                        onChange={async (e) => {
                          const selectedUserId = e.target.value === '' ? null : e.target.value
                          setCaseDetailSaving(true)
                          try {
                            const { data, error } = await supabase.rpc('assign_collections_case', {
                              p_case_id: caseDetail.id,
                              p_assigned_to: selectedUserId
                            })
                            if (error) {
                              console.error('Error assigning case:', error)
                              toast.error(error.message || 'Failed to assign case')
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              setCaseDetailAssignedTo(data[0].assigned_to || null)
                              toast.success('Case assigned successfully')
                              
                              // Refetch cases queue
                              const { data: queueData } = await supabase.rpc('get_collections_cases_for_company', {
                                p_status: casesStatusFilter || null,
                                p_assigned_to: casesAssignedFilter === 'mine' && currentUserId ? currentUserId : null,
                                p_limit: 100,
                                p_offset: 0
                              })
                              if (queueData) {
                                let filteredData = queueData
                                if (casesAssignedFilter === 'unassigned') {
                                  filteredData = queueData.filter(c => c.assigned_to === null)
                                }
                                setCollectionsCases(filteredData || [])
                              }

                              // Refetch case metrics
                              await refetchCaseMetrics()
                            }
                          } catch (err) {
                            console.error('Error assigning case:', err)
                            toast.error('An unexpected error occurred')
                          } finally {
                            setCaseDetailSaving(false)
                          }
                        }}
                        disabled={caseDetailSaving}
                        className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Unassigned</option>
                        {availableUsers.map(user => (
                          <option key={user.id} value={user.id}>
                            {user.full_name || user.email || user.id.substring(0, 8)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Due Date Editor */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Due Date</h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={caseDetailDueAt}
                        onChange={(e) => setCaseDetailDueAt(e.target.value)}
                        disabled={caseDetailSaving}
                        className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          if (!caseDetailDueAt) {
                            toast.error('Please select a due date')
                            return
                          }
                          setCaseDetailSaving(true)
                          try {
                            const { data, error } = await supabase.rpc('set_collections_case_due_at', {
                              p_case_id: caseDetail.id,
                              p_due_at: new Date(caseDetailDueAt).toISOString()
                            })
                            if (error) {
                              console.error('Error setting due date:', error)
                              toast.error(error.message || 'Failed to set due date')
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              toast.success('Due date updated successfully')
                              
                              // Refetch cases queue
                              const { data: queueData } = await supabase.rpc('get_collections_cases_for_company', {
                                p_status: casesStatusFilter || null,
                                p_assigned_to: casesAssignedFilter === 'mine' && currentUserId ? currentUserId : null,
                                p_limit: 100,
                                p_offset: 0
                              })
                              if (queueData) {
                                let filteredData = queueData
                                if (casesAssignedFilter === 'unassigned') {
                                  filteredData = queueData.filter(c => c.assigned_to === null)
                                }
                                setCollectionsCases(filteredData || [])
                              }

                              // Refetch case metrics
                              await refetchCaseMetrics()
                            }
                          } catch (err) {
                            console.error('Error setting due date:', err)
                            toast.error('An unexpected error occurred')
                          } finally {
                            setCaseDetailSaving(false)
                          }
                        }}
                        disabled={caseDetailSaving || !caseDetailDueAt}
                        className="text-xs"
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Next Action Editor */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Next Action</h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={caseDetailNextAction}
                        onChange={(e) => setCaseDetailNextAction(e.target.value)}
                        placeholder="e.g., Call customer, Send invoice..."
                        disabled={caseDetailSaving}
                        className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          setCaseDetailSaving(true)
                          try {
                            const { data, error } = await supabase.rpc('set_collections_case_next_action', {
                              p_case_id: caseDetail.id,
                              p_next_action: caseDetailNextAction.trim() || null
                            })
                            if (error) {
                              console.error('Error setting next action:', error)
                              toast.error(error.message || 'Failed to set next action')
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              setCaseDetailNextAction(data[0].next_action || '')
                              toast.success('Next action updated successfully')
                              
                              // Refetch cases queue
                              const { data: queueData } = await supabase.rpc('get_collections_cases_for_company', {
                                p_status: casesStatusFilter || null,
                                p_assigned_to: casesAssignedFilter === 'mine' && currentUserId ? currentUserId : null,
                                p_limit: 100,
                                p_offset: 0
                              })
                              if (queueData) {
                                let filteredData = queueData
                                if (casesAssignedFilter === 'unassigned') {
                                  filteredData = queueData.filter(c => c.assigned_to === null)
                                }
                                setCollectionsCases(filteredData || [])
                              }

                              // Refetch case metrics
                              await refetchCaseMetrics()
                            }
                          } catch (err) {
                            console.error('Error setting next action:', err)
                            toast.error('An unexpected error occurred')
                          } finally {
                            setCaseDetailSaving(false)
                          }
                        }}
                        disabled={caseDetailSaving}
                        className="text-xs"
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Append Note */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Add Note</h4>
                    <div className="space-y-2">
                      <textarea
                        value={caseDetailNote}
                        onChange={(e) => setCaseDetailNote(e.target.value)}
                        placeholder="Enter a note..."
                        disabled={caseDetailSaving}
                        rows={3}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          if (!caseDetailNote.trim()) {
                            toast.error('Please enter a note')
                            return
                          }
                          setCaseDetailSaving(true)
                          try {
                            const { data, error } = await supabase.rpc('append_collections_case_note', {
                              p_case_id: caseDetail.id,
                              p_note: caseDetailNote.trim()
                            })
                            if (error) {
                              console.error('Error appending note:', error)
                              toast.error(error.message || 'Failed to add note')
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              setCaseDetailNote('')
                              toast.success('Note added successfully')
                              
                              // Refetch case metrics
                              await refetchCaseMetrics()
                            }
                          } catch (err) {
                            console.error('Error appending note:', err)
                            toast.error('An unexpected error occurred')
                          } finally {
                            setCaseDetailSaving(false)
                          }
                        }}
                        disabled={caseDetailSaving || !caseDetailNote.trim()}
                        className="text-xs"
                      >
                        Add Note
                      </Button>
                    </div>
                  </div>

                  {/* Notes */}
                  {caseDetail.notes && (
                    <div className="border-b pb-4">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Notes</h4>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-md max-h-48 overflow-y-auto">
                        {caseDetail.notes}
                      </div>
                    </div>
                  )}

                  {/* Close/Reopen Action */}
                  <div className="border-b pb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Case Status</h4>
                    {caseDetail.status !== 'closed' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          setCaseDetailSaving(true)
                          try {
                            const { data, error } = await supabase.rpc('set_collections_case_status', {
                              p_case_id: caseDetail.id,
                              p_status: 'closed'
                            })
                            if (error) {
                              console.error('Error closing case:', error)
                              toast.error(error.message || 'Failed to close case')
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              toast.success('Case closed successfully')
                              
                              // Refetch cases queue
                              const { data: queueData } = await supabase.rpc('get_collections_cases_for_company', {
                                p_status: casesStatusFilter || null,
                                p_assigned_to: casesAssignedFilter === 'mine' && currentUserId ? currentUserId : null,
                                p_limit: 100,
                                p_offset: 0
                              })
                              if (queueData) {
                                let filteredData = queueData
                                if (casesAssignedFilter === 'unassigned') {
                                  filteredData = queueData.filter(c => c.assigned_to === null)
                                }
                                setCollectionsCases(filteredData || [])
                              }

                              // Refetch case metrics
                              await refetchCaseMetrics()
                            }
                          } catch (err) {
                            console.error('Error closing case:', err)
                            toast.error('An unexpected error occurred')
                          } finally {
                            setCaseDetailSaving(false)
                          }
                        }}
                        disabled={caseDetailSaving}
                        className="text-xs"
                      >
                        Close Case
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          setCaseDetailSaving(true)
                          try {
                            const { data, error } = await supabase.rpc('set_collections_case_status', {
                              p_case_id: caseDetail.id,
                              p_status: 'open'
                            })
                            if (error) {
                              console.error('Error reopening case:', error)
                              toast.error(error.message || 'Failed to reopen case')
                              return
                            }
                            if (data && data.length > 0) {
                              setCaseDetail(data[0])
                              toast.success('Case reopened successfully')
                              
                              // Refetch cases queue
                              const { data: queueData } = await supabase.rpc('get_collections_cases_for_company', {
                                p_status: casesStatusFilter || null,
                                p_assigned_to: casesAssignedFilter === 'mine' && currentUserId ? currentUserId : null,
                                p_limit: 100,
                                p_offset: 0
                              })
                              if (queueData) {
                                let filteredData = queueData
                                if (casesAssignedFilter === 'unassigned') {
                                  filteredData = queueData.filter(c => c.assigned_to === null)
                                }
                                setCollectionsCases(filteredData || [])
                              }

                              // Refetch case metrics
                              await refetchCaseMetrics()
                            }
                          } catch (err) {
                            console.error('Error reopening case:', err)
                            toast.error('An unexpected error occurred')
                          } finally {
                            setCaseDetailSaving(false)
                          }
                        }}
                        disabled={caseDetailSaving}
                        className="text-xs"
                      >
                        Reopen Case
                      </Button>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">Timestamps</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-600">Created:</span>
                        <span className="ml-2 text-slate-700">
                          {caseDetail.created_at ? formatDate(caseDetail.created_at) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600">Updated:</span>
                        <span className="ml-2 text-slate-700">
                          {caseDetail.updated_at ? formatDate(caseDetail.updated_at) : '—'}
                        </span>
                      </div>
                      {caseDetail.closed_at && (
                        <div>
                          <span className="text-slate-600">Closed:</span>
                          <span className="ml-2 text-slate-700">
                            {formatDate(caseDetail.closed_at)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">No case details available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
