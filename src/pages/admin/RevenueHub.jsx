import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { useUser } from '../../context/UserContext'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import NextActionButton from '../../components/revenue/NextActionButton'
import { computePaidTotalForJob } from '../../utils/revenuePipeline'
import { getQuoteNextAction, getJobNextAction } from '../../lib/nextActionEngine'
import { getInvoiceNextStep } from '../../lib/nextStepHints'
import { hasAnyAssignment, isJobUnassigned } from '../../utils/jobAssignment'
import { JOB_SELECT_REVENUE_HUB, INVOICE_SELECT_REVENUE_HUB } from '../../lib/dbSelects'
import { warnIfMissingColumns, parseSelectString } from '../../utils/schemaGuards'
import { exportRowsAsCsv } from '../../utils/exportCsv'
import LogCollectionActionModal from '../../components/collections/LogCollectionActionModal'
import SetFollowupModal from '../../components/collections/SetFollowupModal'
import SendCollectionEmailModal from '../../components/collections/SendCollectionEmailModal'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts'

// Required columns for schema guardrails
const REQUIRED_JOB_COLUMNS = parseSelectString(JOB_SELECT_REVENUE_HUB)
const REQUIRED_INVOICE_COLUMNS = parseSelectString(INVOICE_SELECT_REVENUE_HUB)

export default function RevenueHub() {
  const { supportMode } = useUser()
  const [companyId, setCompanyId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Data state
  const [quotes, setQuotes] = useState([])
  const [jobs, setJobs] = useState([])
  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [scheduleRequests, setScheduleRequests] = useState([])
  const [invoices, setInvoices] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [jobFlags, setJobFlags] = useState([])
  const [financialSnapshot, setFinancialSnapshot] = useState(null)
  const [financialSnapshotLoading, setFinancialSnapshotLoading] = useState(false)
  const [profitSnapshot, setProfitSnapshot] = useState(null)
  const [profitSnapshotLoading, setProfitSnapshotLoading] = useState(false)
  const [arAging, setArAging] = useState(null)
  const [arAgingLoading, setArAgingLoading] = useState(false)
  const [collectionsQueue, setCollectionsQueue] = useState([])
  const [collectionsQueueLoading, setCollectionsQueueLoading] = useState(false)
  const [cashForecast, setCashForecast] = useState(null)
  const [cashForecastLoading, setCashForecastLoading] = useState(false)
  const [trends, setTrends] = useState([])
  const [trendsLoading, setTrendsLoading] = useState(false)
  const [profitTrends, setProfitTrends] = useState([])
  const [profitTrendsLoading, setProfitTrendsLoading] = useState(false)
  const [revenueByCustomer, setRevenueByCustomer] = useState([])
  const [revenueByCustomerLoading, setRevenueByCustomerLoading] = useState(false)
  const [revenueByMonth, setRevenueByMonth] = useState([])
  const [revenueByMonthLoading, setRevenueByMonthLoading] = useState(false)
  const [expensesByCategory, setExpensesByCategory] = useState([])
  const [expensesByCategoryLoading, setExpensesByCategoryLoading] = useState(false)
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
  const [casesStatusFilter, setCasesStatusFilter] = useState(null)
  const [casesAssignedFilter, setCasesAssignedFilter] = useState(null)
  const [casesSlaFilter, setCasesSlaFilter] = useState('all')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [caseMetrics, setCaseMetrics] = useState(null)
  const [caseMetricsLoading, setCaseMetricsLoading] = useState(false)
  
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
  
  // Collections Queue filter state
  const [collectionsFilter, setCollectionsFilter] = useState('all')
  
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
  
  // Loading states
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [jobsLoading, setJobsLoading] = useState(true)
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [financeRefreshToken, setFinanceRefreshToken] = useState(0)
  const [financeLoadErrors, setFinanceLoadErrors] = useState({})

  // Get company_id and user role
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_id, role')
          .eq('id', user.id)
          .single()
        
        if (profileError) {
          console.error('Error fetching profile:', profileError)
          return
        }
        
        setCompanyId(profile?.company_id || null)
        setUserRole(profile?.role || null)
        setCurrentUserId(user.id)
      } catch (err) {
        console.error('Error initializing RevenueHub:', err)
      }
    }
    init()
  }, [])

  // Current month date range helper (YYYY-MM-DD)
  const getCurrentMonthDateRange = () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const toDateOnly = (date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return {
      startDate: toDateOnly(monthStart),
      endDate: toDateOnly(now)
    }
  }

  // Fetch financial snapshot
  useEffect(() => {
    if (!companyId || !userRole) return
    
    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchFinancialSnapshot = async () => {
      setFinancialSnapshotLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_financial_snapshot_for_company', {
          p_window_days: 30,
          p_expected_days: 14
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            // Non-fatal: user doesn't have permission
            console.debug('Financial snapshot not available for this role')
            setFinancialSnapshot(null)
            clearFinanceError('financial_snapshot')
          } else {
            console.error('Error fetching financial snapshot:', error)
            setFinancialSnapshot(null)
            markFinanceError('financial_snapshot', 'Financial Snapshot failed to load.')
          }
          return
        }

        if (data && data.length > 0) {
          const snapshot = data[0]
          // Schema guardrail: warn if expected columns are missing
          warnIfMissingColumns('RevenueHub.financialSnapshot', [snapshot], [
            'outstanding_ar',
            'overdue_ar',
            'expected_next_days',
            'collected_window',
            'avg_days_to_pay',
            'sent_count',
            'overdue_count',
            'paid_count'
          ])
          setFinancialSnapshot(snapshot)
          clearFinanceError('financial_snapshot')
        } else {
          setFinancialSnapshot(null)
          markFinanceError('financial_snapshot', 'Financial Snapshot returned no data.')
        }
      } catch (err) {
        console.error('Error fetching financial snapshot:', err)
        setFinancialSnapshot(null)
        markFinanceError('financial_snapshot', 'Financial Snapshot failed to load.')
      } finally {
        setFinancialSnapshotLoading(false)
      }
    }

    fetchFinancialSnapshot()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch profit snapshot (cash basis)
  useEffect(() => {
    if (!companyId || !userRole) return

    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchProfitSnapshot = async () => {
      setProfitSnapshotLoading(true)
      try {
        const { startDate, endDate } = getCurrentMonthDateRange()
        const { data, error } = await supabase.rpc('get_profit_snapshot_for_company', {
          p_start_date: startDate,
          p_end_date: endDate
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Profit snapshot not available for this role')
            setProfitSnapshot(null)
            clearFinanceError('profit_snapshot')
          } else {
            console.error('Error fetching profit snapshot:', error)
            setProfitSnapshot(null)
            markFinanceError('profit_snapshot', 'Profit Snapshot failed to load.')
          }
          return
        }

        if (data && data.length > 0) {
          setProfitSnapshot(data[0])
          clearFinanceError('profit_snapshot')
        } else {
          setProfitSnapshot(null)
          markFinanceError('profit_snapshot', 'Profit Snapshot returned no data.')
        }
      } catch (err) {
        console.error('Error fetching profit snapshot:', err)
        setProfitSnapshot(null)
        markFinanceError('profit_snapshot', 'Profit Snapshot failed to load.')
      } finally {
        setProfitSnapshotLoading(false)
      }
    }

    fetchProfitSnapshot()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch AR aging
  useEffect(() => {
    if (!companyId || !userRole) return
    
    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchArAging = async () => {
      setArAgingLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_ar_aging_for_company', {
          p_as_of: new Date().toISOString()
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('AR aging not available for this role')
            setArAging(null)
            clearFinanceError('ar_aging')
          } else {
            console.error('Error fetching AR aging:', error)
            setArAging(null)
            markFinanceError('ar_aging', 'AR Aging failed to load.')
          }
          return
        }

        if (data && data.length > 0) {
          const aging = data[0]
          // Schema guardrail: warn if expected columns are missing
          warnIfMissingColumns('RevenueHub.arAging', [aging], [
            'as_of',
            'outstanding_ar',
            'overdue_ar',
            'bucket_0_7',
            'bucket_8_14',
            'bucket_15_30',
            'bucket_31_60',
            'bucket_61_90',
            'bucket_90_plus',
            'invoice_count_open',
            'invoice_count_overdue'
          ])
          setArAging(aging)
          clearFinanceError('ar_aging')
        } else {
          setArAging(null)
          markFinanceError('ar_aging', 'AR Aging returned no data.')
        }
      } catch (err) {
        console.error('Error fetching AR aging:', err)
        setArAging(null)
        markFinanceError('ar_aging', 'AR Aging failed to load.')
      } finally {
        setArAgingLoading(false)
      }
    }

    fetchArAging()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch cash forecast
  useEffect(() => {
    if (!companyId || !userRole) return
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) return

    const fetchCashForecast = async () => {
      setCashForecastLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_cash_forecast_for_company', {
          p_as_of: new Date().toISOString(),
          p_days: 30
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Cash forecast not available for this role')
            setCashForecast(null)
            clearFinanceError('cash_forecast')
          } else {
            console.error('Error fetching cash forecast:', error)
            setCashForecast(null)
            markFinanceError('cash_forecast', 'Cash Forecast failed to load.')
          }
          return
        }

        if (data && data.length > 0) {
          setCashForecast(data[0])
          clearFinanceError('cash_forecast')
        } else {
          setCashForecast(null)
          markFinanceError('cash_forecast', 'Cash Forecast returned no data.')
        }
      } catch (err) {
        console.error('Error fetching cash forecast:', err)
        setCashForecast(null)
        markFinanceError('cash_forecast', 'Cash Forecast failed to load.')
      } finally {
        setCashForecastLoading(false)
      }
    }

    fetchCashForecast()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch collections queue
  useEffect(() => {
    if (!companyId || !userRole) return
    
    // Only fetch for admin/manager/dispatcher
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
            warnIfMissingColumns('RevenueHub.collectionsQueue', data, [
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
              warnIfMissingColumns('RevenueHub.collectionsActivity', data, [
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
              warnIfMissingColumns('RevenueHub.collectionsFollowups', data, [
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
              warnIfMissingColumns('RevenueHub.collectionsEscalations', data, [
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
              warnIfMissingColumns('RevenueHub.commsActivity', data, [
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
              warnIfMissingColumns('RevenueHub.collectionsCases', filteredData, [
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

  // Fetch trends
  useEffect(() => {
    if (!companyId || !userRole) return
    
    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchTrends = async () => {
      setTrendsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_cfo_trends_for_company', {
          p_months: 6
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Trends not available for this role')
            setTrends([])
            clearFinanceError('trends')
          } else {
            console.error('Error fetching trends:', error)
            setTrends([])
            markFinanceError('trends', 'Trends failed to load.')
          }
          return
        }

        if (data && Array.isArray(data)) {
          // Schema guardrail: warn if expected columns are missing
          if (data.length > 0) {
            warnIfMissingColumns('RevenueHub.trends', data, [
              'period_start',
              'sent_invoices_count',
              'sent_invoices_total',
              'collected_total',
              'overdue_balance_end',
              'outstanding_balance_end',
              'dso_days'
            ])
          }
          setTrends(data || [])
          clearFinanceError('trends')
        }
      } catch (err) {
        console.error('Error fetching trends:', err)
        setTrends([])
        markFinanceError('trends', 'Trends failed to load.')
      } finally {
        setTrendsLoading(false)
      }
    }

    fetchTrends()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch profit trends
  useEffect(() => {
    if (!companyId || !userRole) return

    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchProfitTrends = async () => {
      setProfitTrendsLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_profit_trends_for_company', {
          p_months: 6
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Profit trends not available for this role')
            setProfitTrends([])
            clearFinanceError('profit_trends')
          } else {
            console.error('Error fetching profit trends:', error)
            setProfitTrends([])
            markFinanceError('profit_trends', 'Profit Trends failed to load.')
          }
          return
        }

        if (data && Array.isArray(data)) {
          setProfitTrends(data || [])
          clearFinanceError('profit_trends')
        } else {
          setProfitTrends([])
        }
      } catch (err) {
        console.error('Error fetching profit trends:', err)
        setProfitTrends([])
        markFinanceError('profit_trends', 'Profit Trends failed to load.')
      } finally {
        setProfitTrendsLoading(false)
      }
    }

    fetchProfitTrends()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch revenue by customer (current month)
  useEffect(() => {
    if (!companyId || !userRole) return

    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchRevenueByCustomer = async () => {
      setRevenueByCustomerLoading(true)
      try {
        const { startDate, endDate } = getCurrentMonthDateRange()
        const { data, error } = await supabase.rpc('get_revenue_by_customer_for_company', {
          p_start_date: startDate,
          p_end_date: endDate
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Revenue by customer not available for this role')
            setRevenueByCustomer([])
            clearFinanceError('revenue_by_customer')
          } else {
            console.error('Error fetching revenue by customer:', error)
            setRevenueByCustomer([])
            markFinanceError('revenue_by_customer', 'Revenue by Customer failed to load.')
          }
          return
        }

        if (data && Array.isArray(data)) {
          setRevenueByCustomer(data || [])
          clearFinanceError('revenue_by_customer')
        } else {
          setRevenueByCustomer([])
        }
      } catch (err) {
        console.error('Error fetching revenue by customer:', err)
        setRevenueByCustomer([])
        markFinanceError('revenue_by_customer', 'Revenue by Customer failed to load.')
      } finally {
        setRevenueByCustomerLoading(false)
      }
    }

    fetchRevenueByCustomer()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch revenue by month (last 12 months)
  useEffect(() => {
    if (!companyId || !userRole) return

    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchRevenueByMonth = async () => {
      setRevenueByMonthLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_revenue_by_month_for_company', {
          p_months: 12
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Revenue by month not available for this role')
            setRevenueByMonth([])
            clearFinanceError('revenue_by_month')
          } else {
            console.error('Error fetching revenue by month:', error)
            setRevenueByMonth([])
            markFinanceError('revenue_by_month', 'Revenue by Month failed to load.')
          }
          return
        }

        if (data && Array.isArray(data)) {
          setRevenueByMonth(data || [])
          clearFinanceError('revenue_by_month')
        } else {
          setRevenueByMonth([])
        }
      } catch (err) {
        console.error('Error fetching revenue by month:', err)
        setRevenueByMonth([])
        markFinanceError('revenue_by_month', 'Revenue by Month failed to load.')
      } finally {
        setRevenueByMonthLoading(false)
      }
    }

    fetchRevenueByMonth()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch expenses by category (current month)
  useEffect(() => {
    if (!companyId || !userRole) return

    // Only fetch for admin/manager/dispatcher
    if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
      return
    }

    const fetchExpensesByCategory = async () => {
      setExpensesByCategoryLoading(true)
      try {
        const { startDate, endDate } = getCurrentMonthDateRange()
        const { data, error } = await supabase.rpc('get_expenses_by_category_for_company', {
          p_start_date: startDate,
          p_end_date: endDate
        })

        if (error) {
          if (error.message?.includes('FORBIDDEN')) {
            console.debug('Expenses by category not available for this role')
            setExpensesByCategory([])
            clearFinanceError('expenses_by_category')
          } else {
            console.error('Error fetching expenses by category:', error)
            setExpensesByCategory([])
            markFinanceError('expenses_by_category', 'Expenses by Category failed to load.')
          }
          return
        }

        if (data && Array.isArray(data)) {
          setExpensesByCategory(data || [])
          clearFinanceError('expenses_by_category')
        } else {
          setExpensesByCategory([])
        }
      } catch (err) {
        console.error('Error fetching expenses by category:', err)
        setExpensesByCategory([])
        markFinanceError('expenses_by_category', 'Expenses by Category failed to load.')
      } finally {
        setExpensesByCategoryLoading(false)
      }
    }

    fetchExpensesByCategory()
  }, [companyId, userRole, financeRefreshToken])

  // Fetch quotes
  useEffect(() => {
    if (!companyId) return
    
    const fetchQuotes = async () => {
      setQuotesLoading(true)
      try {
        const { data, error } = await supabase
          .from('quotes')
          .select('id, quote_number, customer_id, total, status, sent_at, last_viewed_at, expires_at, valid_until, converted_job_id, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
        
        if (error) throw error
        setQuotes(data || [])
      } catch (err) {
        console.error('Error fetching quotes:', err)
        setQuotes([])
      } finally {
        setQuotesLoading(false)
      }
    }
    
    fetchQuotes()
  }, [companyId])

  // Fetch jobs
  useEffect(() => {
    if (!companyId) return
    
    const fetchJobs = async () => {
      setJobsLoading(true)
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select(JOB_SELECT_REVENUE_HUB)
          .eq('company_id', companyId)
          // Note: invoice_path kept for temporary fallback only; prefer invoices.pdf_path
        
        if (error) throw error
        const jobsData = data || []
        setJobs(jobsData)
        // Schema guardrail: warn if expected columns are missing
        warnIfMissingColumns('RevenueHub.jobs', jobsData, REQUIRED_JOB_COLUMNS)
      } catch (err) {
        console.error('Error fetching jobs:', err)
        setJobs([])
      } finally {
        setJobsLoading(false)
      }
    }
    
    fetchJobs()
  }, [companyId])

  // Fetch payments (include invoice_id for invoice balance calculations)
  useEffect(() => {
    if (!companyId) return
    
    const fetchPayments = async () => {
      setPaymentsLoading(true)
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('id, job_id, invoice_id, amount, status, voided_at')
          .eq('company_id', companyId)
        
        if (error) throw error
        setPayments(data || [])
      } catch (err) {
        console.error('Error fetching payments:', err)
        setPayments([])
      } finally {
        setPaymentsLoading(false)
      }
    }
    
    fetchPayments()
  }, [companyId])

  // Fetch invoices
  useEffect(() => {
    if (!companyId) return
    
    const fetchInvoices = async () => {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select(INVOICE_SELECT_REVENUE_HUB)
          .eq('company_id', companyId)
        
        if (error) {
          // If invoices table doesn't exist yet, that's ok (backwards-compatible)
          if (error.code === '42P01' || error.message.includes('does not exist')) {
            console.log('Invoices table not yet available (backwards-compatible)')
            setInvoices([])
            return
          }
          throw error
        }
        const invoicesData = data || []
        setInvoices(invoicesData)
        // Schema guardrail: warn if expected columns are missing
        warnIfMissingColumns('RevenueHub.invoices', invoicesData, REQUIRED_INVOICE_COLUMNS)
      } catch (err) {
        console.error('Error fetching invoices:', err)
        setInvoices([])
      }
    }
    
    fetchInvoices()
  }, [companyId])

  // Fetch audit logs (recent activity)
  useEffect(() => {
    if (!companyId) return
    
    const fetchAuditLogs = async () => {
      setAuditLogsLoading(true)
      try {
        const { data, error } = await supabase
          .from('audit_log')
          .select('id, entity_type, entity_id, action, metadata, created_at, actor_user_id, actor_role')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(15)
        
        if (error) {
          // If audit_log table doesn't exist yet, that's ok (backwards-compatible)
          if (error.code === '42P01' || error.message.includes('does not exist')) {
            console.log('Audit log table not yet available (backwards-compatible)')
            setAuditLogs([])
            return
          }
          throw error
        }
        setAuditLogs(data || [])
      } catch (err) {
        console.error('Error fetching audit logs:', err)
        setAuditLogs([])
      } finally {
        setAuditLogsLoading(false)
      }
    }
    
    fetchAuditLogs()
  }, [companyId])

  // Fetch customers
  useEffect(() => {
    if (!companyId) return
    
    const fetchCustomers = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name')
          .eq('company_id', companyId)
        
        if (error) throw error
        setCustomers(data || [])
      } catch (err) {
        console.error('Error fetching customers:', err)
        setCustomers([])
      }
    }
    
    fetchCustomers()
  }, [companyId])

  // Fetch schedule requests (optional - may not exist)
  useEffect(() => {
    if (!companyId) return
    
    const fetchScheduleRequests = async () => {
      try {
        const { data, error } = await supabase
          .from('job_schedule_requests')
          .select('id, job_id, quote_id, status, requested_date')
          .eq('company_id', companyId)
          .eq('status', 'requested')
        
        // Ignore error if table doesn't exist
        if (error && error.code !== '42P01') {
          console.warn('Error fetching schedule requests:', error)
        }
        setScheduleRequests(data || [])
      } catch (err) {
        // Table may not exist - that's ok
        setScheduleRequests([])
      }
    }
    
    fetchScheduleRequests()
  }, [companyId])

  // Fetch job flags (open only)
  useEffect(() => {
    if (!companyId) return
    
    const fetchJobFlags = async () => {
      try {
        const { data, error } = await supabase
          .from('job_flags')
          .select('id, job_id, status, severity, category, message, created_at')
          .eq('company_id', companyId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
        
        if (error) throw error
        setJobFlags(data || [])
      } catch (err) {
        console.error('Error fetching job flags:', err)
        setJobFlags([])
      }
    }
    
    fetchJobFlags()
  }, [companyId])

  // Build in-memory maps
  const paymentsByJobId = useMemo(() => {
    const map = {}
    payments.forEach(p => {
      if (p.job_id && p.status === 'posted' && !p.voided_at) {
        if (!map[p.job_id]) {
          map[p.job_id] = []
        }
        map[p.job_id].push(p)
      }
    })
    return map
  }, [payments])

  const paidTotalsByJobId = useMemo(() => {
    const map = {}
    Object.keys(paymentsByJobId).forEach(jobId => {
      map[jobId] = computePaidTotalForJob(paymentsByJobId[jobId], jobId)
    })
    return map
  }, [paymentsByJobId])

  const scheduleRequestByJobId = useMemo(() => {
    const map = {}
    scheduleRequests.forEach(sr => {
      if (sr.job_id) {
        map[sr.job_id] = sr
      }
    })
    return map
  }, [scheduleRequests])

  const customersById = useMemo(() => {
    const map = {}
    customers.forEach(c => {
      map[c.id] = c
    })
    return map
  }, [customers])

  // Map invoices by job_id for quick lookup
  const invoicesByJobId = useMemo(() => {
    const map = {}
    invoices.forEach(inv => {
      if (inv.job_id) {
        map[inv.job_id] = inv
      }
    })
    return map
  }, [invoices])

  // Calculate loading state
  useEffect(() => {
    if (companyId && !quotesLoading && !jobsLoading && !paymentsLoading) {
      setLoading(false)
    }
  }, [companyId, quotesLoading, jobsLoading, paymentsLoading])

  // Queue 1: Quotes Needing Follow-up
  // Include quotes where status in ('draft','sent') OR (converted_job_id is null and status not in ('rejected','expired'))
  const quotesNeedingFollowUp = useMemo(() => {
    return quotes.filter(q => {
      const status = (q.status || '').toLowerCase()
      const isTerminal = status === 'rejected' || status === 'expired'
      const hasJob = !!q.converted_job_id
      
      // Include: draft or sent quotes
      if (status === 'draft' || status === 'sent') {
        return true
      }
      
      // Include: non-terminal states without job
      if (!hasJob && !isTerminal) {
        return true
      }
      
      return false
    })
    .map(q => {
      const nextAction = getQuoteNextAction(q)
      return { ...q, nextAction }
    })
    .sort((a, b) => {
      // Sort by nextAction.priority (lower = more urgent)
      const priorityA = a.nextAction?.priority || 999
      const priorityB = b.nextAction?.priority || 999
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      
      // Then by age (oldest first)
      const dateA = new Date(a.created_at || a.sent_at || 0)
      const dateB = new Date(b.created_at || b.sent_at || 0)
      return dateA - dateB
    })
  }, [quotes])

  // Queue 2: Jobs Needing Scheduling/Assignment
  // Jobs where scheduled date is null OR (no team and no crew assignment)
  const jobsNeedingScheduling = useMemo(() => {
    return jobs
      .map(j => {
        const paid = paidTotalsByJobId[j.id] || 0
        const jobCost = Number(j.job_cost || 0)
        const balanceDue = Math.max(0, jobCost - paid)
        const nextAction = getJobNextAction(j, { balanceDue })
        return { ...j, nextAction, balanceDue }
      })
      .filter(j => {
        // Check if needs scheduling: no service_date only (assignment is separate concern)
        const hasServiceDate = !!j.service_date
        const isUnscheduled = !hasServiceDate
        
        if (isUnscheduled) {
          // Exclude completed/cancelled jobs using defensive completed detection
          const isCompleted = !!j.completed_at || (j.status && (j.status === 'completed' || j.status.toLowerCase() === 'completed'))
          const status = (j.status || '').toLowerCase()
          const isCancelled = status === 'canceled' || status === 'cancelled'
          return !isCompleted && !isCancelled
        }
        
        return false
      })
      .sort((a, b) => {
        // Sort by nextAction.priority (lower = more urgent)
        const priorityA = a.nextAction?.priority || 999
        const priorityB = b.nextAction?.priority || 999
        if (priorityA !== priorityB) {
          return priorityA - priorityB
        }
        
        // Then by scheduled date null first, then created_at oldest
        const hasDateA = !!a.service_date
        const hasDateB = !!b.service_date
        if (hasDateA !== hasDateB) {
          return hasDateA ? 1 : -1 // null dates first
        }
        
        const dateA = new Date(a.created_at || 0)
        const dateB = new Date(b.created_at || 0)
        return dateA - dateB
      })
  }, [jobs, paidTotalsByJobId])

  // Queue 3: Jobs Completed but Not Invoiced
  // Jobs where completed AND no invoice record exists
  const jobsNeedingInvoicing = useMemo(() => {
    return jobs
      .map(j => {
        const paid = paidTotalsByJobId[j.id] || 0
        const jobCost = Number(j.job_cost || 0)
        const balanceDue = Math.max(0, jobCost - paid)
        const nextAction = getJobNextAction(j, { balanceDue })
        return { ...j, nextAction, balanceDue }
      })
      .filter(j => {
        // Defensive completed detection: check multiple fields
        const isCompleted = !!j.completed_at || (j.status && j.status === 'completed')
        // Check for missing invoice record (prefer invoices table, fallback to invoice_path for backward compatibility)
        const invoice = invoicesByJobId[j.id]
        const hasInvoiceRecord = !!invoice
        // Canonical path resolution: prefer invoices.pdf_path (trigger keeps invoice_pdf_path in sync)
        const hasInvoicePath = !!(invoice?.pdf_path || j.invoice_path)
        return isCompleted && !hasInvoicePath
      })
      .sort((a, b) => {
        // Sort by completed_at (most recently completed first)
        const dateA = new Date(a.completed_at || a.updated_at || 0)
        const dateB = new Date(b.completed_at || b.updated_at || 0)
        return dateB - dateA
      })
  }, [jobs, paidTotalsByJobId])

  // Queue 4: Invoices With Balance Due
  // Compute balance from payments table (via invoice_id) instead of invoice.balance_due
  const jobsWithBalanceDue = useMemo(() => {
    // Build map of payments by invoice_id
    const paymentsByInvoiceId = {}
    payments.forEach(p => {
      if (p.invoice_id && p.status === 'posted' && !p.voided_at) {
        if (!paymentsByInvoiceId[p.invoice_id]) {
          paymentsByInvoiceId[p.invoice_id] = []
        }
        paymentsByInvoiceId[p.invoice_id].push(p)
      }
    })
    
    // Calculate total paid per invoice
    const totalPaidByInvoiceId = {}
    Object.keys(paymentsByInvoiceId).forEach(invoiceId => {
      totalPaidByInvoiceId[invoiceId] = paymentsByInvoiceId[invoiceId]
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    })
    
    return jobs
      .map(j => {
        const invoice = invoicesByJobId[j.id]
        
        // If invoice exists in invoices table, compute balance from payments
        if (invoice) {
          const invoiceTotal = Number(invoice.total || 0)
          const totalPaid = totalPaidByInvoiceId[invoice.id] || 0
          const balanceDue = Math.max(0, invoiceTotal - totalPaid)
          const nextAction = getJobNextAction(j, { balanceDue })
          // Canonical path resolution: prefer invoices.pdf_path (trigger keeps invoice_pdf_path in sync)
          const invoicePath = invoice.pdf_path || null
          return {
            ...j,
            outstanding: balanceDue,
            balanceDue,
            nextAction,
            invoice_id: invoice.id,
            invoice_status: invoice.status,
            invoice_pdf_path: invoicePath,
            invoice_uploaded_at: invoice.sent_at || invoice.created_at,
            invoice_due_date: invoice.due_date,
            invoice_total: invoiceTotal,
            invoice_total_paid: totalPaid
          }
        }
        
        // Fallback: use jobs.invoice_path + computed balanceDue (temporary legacy support)
        const paid = paidTotalsByJobId[j.id] || 0
        const jobCost = Number(j.job_cost || 0)
        const balanceDue = Math.max(0, jobCost - paid)
        const nextAction = getJobNextAction(j, { balanceDue })
        return { ...j, outstanding: balanceDue, balanceDue, nextAction }
      })
      .filter(j => {
        // Must have invoice (prefer invoices table, fallback to jobs.invoice_path)
        const invoice = invoicesByJobId[j.id]
        // Canonical path resolution: prefer invoices.pdf_path (trigger keeps invoice_pdf_path in sync)
        const hasInvoicePath = !!(invoice?.pdf_path || j.invoice_path)
        
        if (!hasInvoicePath) return false
        
        // Only include if there's an actual balance due
        return j.balanceDue > 0
      })
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 50) // Limit to top 50
  }, [jobs, paidTotalsByJobId, invoicesByJobId, payments])
  
  // Queue 3.5: Jobs Needing Attention (with open flags)
  const jobsNeedingAttention = useMemo(() => {
    // Group flags by job_id
    const flagsByJobId = {}
    jobFlags.forEach(flag => {
      if (!flagsByJobId[flag.job_id]) {
        flagsByJobId[flag.job_id] = []
      }
      flagsByJobId[flag.job_id].push(flag)
    })
    
    // Map jobs that have flags, attach flags array
    return Object.keys(flagsByJobId)
      .map(jobId => {
        const job = jobs.find(j => j.id === jobId)
        if (!job) return null
        
        const flags = flagsByJobId[jobId]
        return {
          ...job,
          flags
        }
      })
      .filter(job => job !== null)
      .sort((a, b) => {
        // Sort by highest severity first (high > medium > low)
        const severityOrder = { high: 3, medium: 2, low: 1 }
        const maxSeverityA = Math.max(...a.flags.map(f => severityOrder[f.severity] || 1))
        const maxSeverityB = Math.max(...b.flags.map(f => severityOrder[f.severity] || 1))
        
        if (maxSeverityA !== maxSeverityB) {
          return maxSeverityB - maxSeverityA // Higher severity first
        }
        
        // Then by oldest flag first
        const oldestFlagA = a.flags[0]?.created_at || ''
        const oldestFlagB = b.flags[0]?.created_at || ''
        return new Date(oldestFlagA) - new Date(oldestFlagB)
      })
  }, [jobFlags, jobs])
  
  // Calculate KPIs
  const kpis = useMemo(() => {
    // Quotes open count (non-terminal quotes)
    const quotesOpen = quotes.filter(q => {
      const status = (q.status || '').toLowerCase()
      return status !== 'rejected' && status !== 'expired'
    }).length
    
    // Jobs needing scheduling count
    const jobsNeedingSchedulingCount = jobsNeedingScheduling.length
    
    // Uninvoiced completed jobs count
    const uninvoicedCompletedCount = jobsNeedingInvoicing.length
    
    // Total AR balance due (sum of balanceDue from invoices table if available, else computed)
    const totalARBalance = jobsWithBalanceDue.reduce((sum, j) => sum + (j.balanceDue || 0), 0)
    
    return {
      quotesOpen,
      jobsNeedingScheduling: jobsNeedingSchedulingCount,
      uninvoicedCompleted: uninvoicedCompletedCount,
      totalARBalance
    }
  }, [quotes, jobsNeedingScheduling, jobsNeedingInvoicing, jobsWithBalanceDue])

  const markFinanceError = (key, message) => {
    setFinanceLoadErrors((prev) => ({ ...prev, [key]: message }))
  }

  const clearFinanceError = (key) => {
    setFinanceLoadErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const retryFinanceLoads = () => {
    setFinanceLoadErrors({})
    setFinanceRefreshToken((prev) => prev + 1)
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
  }

  const formatPercent = (value) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return '0.0%'
    return `${(num * 100).toFixed(1)}%`
  }

  const formatMonthLabel = (dateValue) => {
    if (!dateValue) return '—'
    try {
      const date = new Date(dateValue)
      if (Number.isNaN(date.getTime())) return '—'
      return date.toLocaleDateString('en-US', { month: 'short' })
    } catch {
      return '—'
    }
  }

  const formatCompactMonth = (dateValue) => {
    if (!dateValue) return '—'
    try {
      const date = new Date(dateValue)
      if (Number.isNaN(date.getTime())) return '—'
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    } catch {
      return '—'
    }
  }

  const financialChartData = useMemo(() => {
    const normalizeMonthKey = (value) => {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      return `${year}-${month}-01`
    }

    const byMonth = {}

    ;(trends || []).forEach((row) => {
      const key = normalizeMonthKey(row.period_start)
      if (!key) return
      if (!byMonth[key]) {
        byMonth[key] = {
          period_start: key,
          monthLabel: formatMonthLabel(key),
          revenue: 0,
          expenses: 0,
          netProfit: 0
        }
      }
      byMonth[key].revenue = Number(row.collected_total || 0)
    })

    ;(profitTrends || []).forEach((row) => {
      const key = normalizeMonthKey(row.period_start)
      if (!key) return
      if (!byMonth[key]) {
        byMonth[key] = {
          period_start: key,
          monthLabel: formatMonthLabel(key),
          revenue: 0,
          expenses: 0,
          netProfit: 0
        }
      }
      byMonth[key].expenses = Number(row.expense_total || 0)
      byMonth[key].netProfit = Number(row.net_profit || 0)
    })

    return Object.values(byMonth)
      .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
      .map((row) => ({
        ...row,
        monthLabel: formatMonthLabel(row.period_start),
        revenue: Number(row.revenue || 0),
        expenses: Number(row.expenses || 0),
        netProfit: Number(row.netProfit || 0)
      }))
  }, [trends, profitTrends])

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '—'
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return '—'
    }
  }

  // Format relative time helper
  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '—'
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)
      
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      return formatDate(dateStr)
    } catch {
      return '—'
    }
  }

  // Format action label helper
  const formatActionLabel = (action, metadata) => {
    switch (action) {
      case 'quote_converted':
        return `Quote converted to job`
      case 'quote_accepted':
        return `Quote accepted`
      case 'quote_rejected':
        return `Quote rejected`
      case 'invoice_upserted':
        return `Invoice created`
      case 'invoice_status_changed':
        return `Invoice status: ${metadata?.new_status || 'updated'}`
      case 'invoice_voided':
        return `Invoice voided`
      case 'payment_recorded':
        return `Payment: ${formatCurrency(metadata?.amount || 0)}`
      case 'payment_voided':
        return `Payment voided`
      default:
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  // Format entity detail helper
  const formatEntityDetail = (entityType, action, metadata) => {
    switch (entityType) {
      case 'quote':
        if (metadata?.quote_number) return `#${metadata.quote_number}`
        break
      case 'invoice':
        if (metadata?.invoice_id) return `Invoice ${metadata.invoice_id.substring(0, 8)}`
        if (metadata?.total) return formatCurrency(metadata.total)
        break
      case 'payment':
        if (metadata?.amount) return formatCurrency(metadata.amount)
        break
    }
    return null
  }

  // Render quote row
  const renderQuoteRow = (quote) => {
    const customer = customersById[quote.customer_id]
    const status = (quote.status || '').toLowerCase()
    const lastActivity = quote.last_viewed_at || quote.sent_at || quote.created_at
    
    return (
      <div
        key={quote.id}
        className="flex items-center justify-between p-4 border-b hover:bg-slate-50"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900">
            Quote #{quote.quote_number} • {customer?.full_name || '—'}
          </div>
          <div className="text-sm text-slate-600 mt-1 flex items-center gap-3 flex-wrap">
            <span>{formatCurrency(quote.total)}</span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            {lastActivity && (
              <span className="text-slate-500">
                Last: {formatDate(lastActivity)}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 ml-4">
          <NextActionButton nextAction={quote.nextAction} size="sm" />
        </div>
      </div>
    )
  }

  // Handle mark invoice as sent
  const handleMarkInvoiceSent = async (invoiceId) => {
    if (supportMode) {
      toast.error("Invoice actions are disabled in support mode.")
      return
    }

    try {
      // Get invoice to check if it has pdf_path
      const { data: invoiceData, error: fetchError } = await supabase
        .from('invoices')
        .select('pdf_path, due_date')
        .eq('id', invoiceId)
        .single()

      if (fetchError) {
        console.error('Error fetching invoice:', fetchError)
        toast.error('Failed to fetch invoice details')
        return
      }

      // Use send_invoice lifecycle RPC
      const { data, error } = await supabase.rpc('send_invoice', {
        p_invoice_id: invoiceId,
        p_pdf_path: invoiceData.pdf_path || null,
        p_due_date: invoiceData.due_date || null
      })

      if (error) {
        console.error('Error sending invoice:', error)
        if (error.message?.includes('PDF_REQUIRED')) {
          toast.error('Invoice PDF is required before sending')
        } else if (error.message?.includes('INVOICE_VOID')) {
          toast.error('Cannot send a voided invoice')
        } else {
          toast.error(error.message || 'Failed to send invoice')
        }
        return
      }

      if (data && data.length > 0) {
        toast.success('Invoice sent successfully')
        // Refetch invoices
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select(INVOICE_SELECT_REVENUE_HUB)
          .eq('company_id', companyId)
        if (invoiceData) {
          setInvoices(invoiceData)
          warnIfMissingColumns('RevenueHub.invoices', invoiceData, REQUIRED_INVOICE_COLUMNS)
        }
      } else {
        toast.error('Failed to send invoice')
      }
    } catch (err) {
      console.error('Error sending invoice:', err)
      toast.error('An unexpected error occurred')
    }
  }

  // Handle void invoice
  const handleVoidInvoice = async (invoiceId) => {
    if (supportMode) {
      toast.error("Invoice actions are disabled in support mode.")
      return
    }

    if (!confirm('Are you sure you want to void this invoice? This action cannot be undone.')) {
      return
    }

    try {
      const { data, error } = await supabase.rpc('void_invoice', {
        p_invoice_id: invoiceId,
        p_reason: 'Voided by admin'
      })

      if (error) {
        console.error('Error voiding invoice:', error)
        toast.error(error.message || 'Failed to void invoice')
        return
      }

      if (data && data.length > 0) {
        toast.success('Invoice voided')
        // Refetch invoices
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select(INVOICE_SELECT_REVENUE_HUB)
          .eq('company_id', companyId)
        if (invoiceData) {
          setInvoices(invoiceData)
          warnIfMissingColumns('RevenueHub.invoices', invoiceData, REQUIRED_INVOICE_COLUMNS)
        }
      } else {
        toast.error('Failed to void invoice')
      }
    } catch (err) {
      console.error('Error voiding invoice:', err)
      toast.error('An unexpected error occurred')
    }
  }

  // Render job row
  const renderJobRow = (job, showOutstanding = false, showCompletedDate = false, showInvoiceActions = false) => {
    const customer = customersById[job.customer_id]
    const isInvoiceFromTable = !!job.invoice_id
    // Canonical path resolution: prefer invoices.pdf_path (trigger keeps invoice_pdf_path in sync)
    const invoicePath = job.invoice_pdf_path || job.invoice_path || null
    const canMarkSent = isInvoiceFromTable && job.invoice_status === 'draft' && invoicePath
    const canVoid = isInvoiceFromTable && job.invoice_status !== 'void'
    
    return (
      <div
        key={job.id}
        className="flex items-center justify-between p-4 border-b hover:bg-slate-50"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900">
            {customer?.full_name || '—'} • {job.services_performed || 'Job'}
          </div>
          <div className="text-sm text-slate-600 mt-1 flex items-center gap-3 flex-wrap">
            <span>{formatCurrency(job.job_cost)}</span>
            {showCompletedDate && job.completed_at && (
              <span className="text-slate-500">
                Completed: {formatDate(job.completed_at)}
              </span>
            )}
            {showOutstanding && job.outstanding !== undefined && job.outstanding > 0 && (
              <span className="text-red-600 font-medium">
                {formatCurrency(job.outstanding)} due
              </span>
            )}
            {(job.invoice_uploaded_at || job.invoice_status) && (
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-500">
                  Invoiced: {formatDate(job.invoice_uploaded_at || job.created_at)}
                  {job.invoice_status && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                      job.invoice_status === 'paid' ? 'bg-green-100 text-green-700' :
                      job.invoice_status === 'overdue' ? 'bg-red-100 text-red-700' :
                      job.invoice_status === 'void' ? 'bg-gray-100 text-gray-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {job.invoice_status}
                    </span>
                  )}
                </span>
                {job.invoice_status && (() => {
                  // Get invoice data for next step hint
                  const invoice = invoicesByJobId?.[job.id] || {};
                  const invoicePayments = (paymentsByJobId?.[job.id] || []).filter(p => p.invoice_id === invoice.id);
                  const totalPaid = invoicePayments
                    .filter(p => p.status === 'posted' && !p.voided_at)
                    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  const invoiceData = {
                    status: job.invoice_status,
                    total: invoice.total || job.job_cost,
                    due_date: job.invoice_due_date || invoice.due_date
                  };
                  const nextStep = getInvoiceNextStep(invoiceData, { totalPaid });
                  return (
                    <span className="text-xs text-slate-500">
                      {nextStep}
                    </span>
                  );
                })()}
              </div>
            )}
            {job.invoice_due_date && (
              <span className={`text-xs ${
                new Date(job.invoice_due_date) < new Date() && job.invoice_status !== 'paid' && job.invoice_status !== 'void'
                  ? 'text-red-600 font-medium'
                  : 'text-slate-500'
              }`}>
                Due: {formatDate(job.invoice_due_date)}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 ml-4 flex items-center gap-2">
          {showInvoiceActions && (
            <>
              {canMarkSent && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleMarkInvoiceSent(job.invoice_id)}
                  disabled={supportMode}
                  title={supportMode ? "Invoice actions are disabled in support mode" : undefined}
                >
                  Mark Sent
                </Button>
              )}
              {canVoid && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleVoidInvoice(job.invoice_id)}
                  disabled={supportMode}
                  title={supportMode ? "Invoice actions are disabled in support mode" : undefined}
                >
                  Void
                </Button>
              )}
            </>
          )}
          <NextActionButton nextAction={job.nextAction} size="sm" />
        </div>
      </div>
    )
  }

  // Handle sync cases from escalations
  const handleSyncCases = async () => {
    if (supportMode) {
      toast.error("Case sync is disabled in support mode.")
      return
    }

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

  const handleExportProfitSnapshotCsv = () => {
    if (!profitSnapshot) return
    const { startDate, endDate } = getCurrentMonthDateRange()
    exportRowsAsCsv({
      filename: 'profit-snapshot-current-month.csv',
      rows: [{
        period_start: startDate,
        period_end: endDate,
        cash_revenue: profitSnapshot.revenue || 0,
        cash_expenses: profitSnapshot.expenses || 0,
        net_profit: profitSnapshot.net_profit || 0,
        profit_margin: formatPercent(profitSnapshot.profit_margin || 0)
      }],
      columns: [
        { key: 'period_start', header: 'Period Start' },
        { key: 'period_end', header: 'Period End' },
        { key: 'cash_revenue', header: 'Cash Revenue' },
        { key: 'cash_expenses', header: 'Cash Expenses' },
        { key: 'net_profit', header: 'Net Profit' },
        { key: 'profit_margin', header: 'Profit Margin' }
      ]
    })
  }

  const handleExportRevenueByCustomerCsv = () => {
    if (!Array.isArray(revenueByCustomer) || revenueByCustomer.length === 0) return
    exportRowsAsCsv({
      filename: 'revenue-by-customer-current-month.csv',
      rows: revenueByCustomer,
      columns: [
        { key: 'customer_name', header: 'Customer' },
        { key: 'collected_total', header: 'Collected', format: (value) => Number(value || 0) },
        { key: 'payment_count', header: 'Payments', format: (value) => Number(value || 0) }
      ]
    })
  }

  const handleExportRevenueByMonthCsv = () => {
    if (!Array.isArray(revenueByMonth) || revenueByMonth.length === 0) return
    exportRowsAsCsv({
      filename: 'revenue-by-month.csv',
      rows: revenueByMonth,
      columns: [
        { key: 'period_start', header: 'Month', format: (value) => formatCompactMonth(value) },
        { key: 'collected_total', header: 'Collected', format: (value) => Number(value || 0) },
        { key: 'payment_count', header: 'Payments', format: (value) => Number(value || 0) }
      ]
    })
  }

  const handleExportExpensesByCategoryCsv = () => {
    if (!Array.isArray(expensesByCategory) || expensesByCategory.length === 0) return
    exportRowsAsCsv({
      filename: 'expenses-by-category-current-month.csv',
      rows: expensesByCategory,
      columns: [
        { key: 'category', header: 'Category' },
        { key: 'expense_total', header: 'Amount', format: (value) => Number(value || 0) },
        { key: 'expense_count', header: 'Count', format: (value) => Number(value || 0) }
      ]
    })
  }

  const handleExportArAgingCsv = () => {
    if (!arAging) return
    exportRowsAsCsv({
      filename: 'ar-aging.csv',
      rows: [arAging],
      columns: [
        { key: 'as_of', header: 'As Of', format: (value) => formatDate(value) },
        { key: 'outstanding_ar', header: 'Outstanding AR', format: (value) => Number(value || 0) },
        { key: 'overdue_ar', header: 'Overdue AR', format: (value) => Number(value || 0) },
        { key: 'bucket_0_7', header: '0-7 Days', format: (value) => Number(value || 0) },
        { key: 'bucket_8_14', header: '8-14 Days', format: (value) => Number(value || 0) },
        { key: 'bucket_15_30', header: '15-30 Days', format: (value) => Number(value || 0) },
        { key: 'bucket_31_60', header: '31-60 Days', format: (value) => Number(value || 0) },
        { key: 'bucket_61_90', header: '61-90 Days', format: (value) => Number(value || 0) },
        { key: 'bucket_90_plus', header: '90+ Days', format: (value) => Number(value || 0) },
        { key: 'invoice_count_open', header: 'Open Invoices', format: (value) => Number(value || 0) },
        { key: 'invoice_count_overdue', header: 'Overdue Invoices', format: (value) => Number(value || 0) }
      ]
    })
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

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/60 p-5 md:p-6">
        <PageHeader
          title="Revenue Hub"
          subtitle="Financial reporting, analytics, and collections visibility. Use Payments to record payments, Financial Control Center for operational follow-up."
          actions={
            userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <span className="hidden text-xs font-medium text-slate-500 sm:inline">Operations</span>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={handleSyncCases}
                  disabled={syncingCases || supportMode}
                  title={supportMode ? "Case sync is disabled in support mode" : undefined}
                >
                  {syncingCases ? 'Syncing...' : 'Sync Cases'}
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {Object.keys(financeLoadErrors).length > 0 && (
        <Card className="border border-amber-300 bg-amber-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-amber-900 mb-1">Some finance data could not be loaded</h3>
              <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                {Object.entries(financeLoadErrors).map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            </div>
            <Button variant="secondary" size="sm" onClick={retryFinanceLoads}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Executive Summary */}
      {(financialSnapshot || profitSnapshot || profitSnapshotLoading) && (
        <Card className="border border-slate-200 shadow-sm bg-gradient-to-b from-white to-slate-50/40">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Executive Summary</h2>
            <p className="mt-1 text-xs text-slate-500">
              Top-line financial health and cash performance.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding AR</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-slate-900">
                {formatCurrency(financialSnapshot?.outstanding_ar || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Open receivables</div>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Overdue AR</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-red-600">
                {formatCurrency(financialSnapshot?.overdue_ar || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Past due amount</div>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Cash Revenue</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-green-600">
                {profitSnapshotLoading ? 'Loading...' : formatCurrency(profitSnapshot?.revenue || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Current month</div>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Net Profit</div>
              <div className={`mt-2 text-3xl font-semibold leading-tight ${(profitSnapshot?.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitSnapshotLoading ? 'Loading...' : formatCurrency(profitSnapshot?.net_profit || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Revenue minus expenses</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Profit Margin</div>
              <div className={`mt-2 text-3xl font-semibold leading-tight ${(profitSnapshot?.profit_margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitSnapshotLoading ? 'Loading...' : formatPercent(profitSnapshot?.profit_margin)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Margin efficiency</div>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Collected Last 30 Days</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-green-600">
                {formatCurrency(financialSnapshot?.collected_window || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Recent collections</div>
            </div>
          </div>
        </Card>
      )}

      {/* Financial Snapshot */}
      {financialSnapshot && (
        <Card className="border border-slate-200/70 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">Financial Snapshot</h2>
            <p className="mt-1 text-xs text-slate-500">
              Core receivables and collection efficiency metrics.
            </p>
          </div>
          <p className="text-sm text-slate-600 mb-5">
            AR metrics are invoice-based; collected metric is cash received from posted payments.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding AR</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-slate-900">
                {formatCurrency(financialSnapshot.outstanding_ar || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Open receivables balance</div>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Overdue AR</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-red-600">
                {formatCurrency(financialSnapshot.overdue_ar || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Past due invoices</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Expected Next 14 Days</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-amber-600">
                {formatCurrency(financialSnapshot.expected_next_days || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Near-term expected cash-in</div>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Collected Last 30 Days</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-green-600">
                {formatCurrency(financialSnapshot.collected_window || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Recent cash collections</div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Avg Days To Pay</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-blue-600">
                {Math.round(financialSnapshot.avg_days_to_pay || 0)} days
              </div>
              <div className="mt-1 text-xs text-slate-400">Collection velocity</div>
            </div>
          </div>
        </Card>
      )}

      {/* Profit Snapshot (Cash Basis) */}
      {(profitSnapshot || profitSnapshotLoading) && (
        <Card className="border border-slate-200/70 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Profit Snapshot (Cash Basis)</h2>
              <p className="mt-1 text-xs text-slate-500">Current month performance at a glance.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportProfitSnapshotCsv}
              disabled={!profitSnapshot}
            >
              Export CSV
            </Button>
          </div>
          <p className="text-sm text-slate-600 mb-5">
            Collected payments minus recorded expenses for the current month.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-green-100 bg-green-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Cash Revenue</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-green-600">
                {profitSnapshotLoading ? 'Loading...' : formatCurrency(profitSnapshot?.revenue || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Posted inflows this month</div>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Cash Expenses</div>
              <div className="mt-2 text-3xl font-semibold leading-tight text-red-600">
                {profitSnapshotLoading ? 'Loading...' : formatCurrency(profitSnapshot?.expenses || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Recorded spend this month</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Net Profit</div>
              <div className={`mt-2 text-3xl font-semibold leading-tight ${(profitSnapshot?.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitSnapshotLoading ? 'Loading...' : formatCurrency(profitSnapshot?.net_profit || 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Revenue minus expenses</div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Profit Margin</div>
              <div className={`mt-2 text-3xl font-semibold leading-tight ${(profitSnapshot?.profit_margin || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {profitSnapshotLoading ? 'Loading...' : formatPercent(profitSnapshot?.profit_margin)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Net profit as percent of revenue</div>
            </div>
          </div>
        </Card>
      )}

      {/* Cash Forecast */}
      {(cashForecast || cashForecastLoading) && (
        <Card className="border border-slate-200/70 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">Cash Forecast</h2>
            <p className="mt-1 text-xs text-slate-500">Near-term collection outlook and aging exposure.</p>
          </div>
          {cashForecastLoading ? (
            <div className="text-center py-8 text-slate-500">Loading cash forecast...</div>
          ) : !cashForecast ? (
            <div className="text-center py-8 text-slate-500">Cash forecast is currently unavailable.</div>
          ) : (
            <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Expected Collections</div>
                <div className="mt-2 text-3xl font-semibold leading-tight text-slate-900">
                {formatCurrency(cashForecast.expected_collections || 0)}
                </div>
                <div className="mt-1 text-xs text-slate-400">Most likely scenario</div>
              </div>
              <div className="rounded-lg border border-green-100 bg-green-50/50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Optimistic</div>
                <div className="mt-2 text-3xl font-semibold leading-tight text-green-600">
                {formatCurrency(cashForecast.optimistic_collections || 0)}
                </div>
                <div className="mt-1 text-xs text-slate-400">Upper bound estimate</div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Pessimistic</div>
                <div className="mt-2 text-3xl font-semibold leading-tight text-amber-600">
                {formatCurrency(cashForecast.pessimistic_collections || 0)}
                </div>
                <div className="mt-1 text-xs text-slate-400">Conservative scenario</div>
              </div>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 md:p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Aging Buckets</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-[11px] text-slate-500 mb-1">0-7 Days</div>
              <div className="text-lg font-semibold leading-tight text-slate-900">
                {formatCurrency(cashForecast.bucket_0_7 || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <div className="text-[11px] text-slate-500 mb-1">8-14 Days</div>
              <div className="text-lg font-semibold leading-tight text-amber-600">
                {formatCurrency(cashForecast.bucket_8_14 || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3">
              <div className="text-[11px] text-slate-500 mb-1">15-30 Days</div>
              <div className="text-lg font-semibold leading-tight text-orange-600">
                {formatCurrency(cashForecast.bucket_15_30 || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
              <div className="text-[11px] text-slate-500 mb-1">31-60 Days</div>
              <div className="text-lg font-semibold leading-tight text-red-600">
                {formatCurrency(cashForecast.bucket_31_60 || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <div className="text-[11px] text-slate-500 mb-1">61-90 Days</div>
              <div className="text-lg font-semibold leading-tight text-red-700">
                {formatCurrency(cashForecast.bucket_61_90 || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-red-300 bg-red-50/60 p-3">
              <div className="text-[11px] text-slate-500 mb-1">90+ Days</div>
              <div className="text-lg font-semibold leading-tight text-red-900">
                {formatCurrency(cashForecast.bucket_90_plus || 0)}
              </div>
            </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span>
              {cashForecast.open_invoice_count || 0} open invoice{cashForecast.open_invoice_count !== 1 ? 's' : ''}
            </span>
            <span>
              {cashForecast.overdue_invoice_count || 0} overdue invoice{cashForecast.overdue_invoice_count !== 1 ? 's' : ''}
            </span>
          </div>
            </>
          )}
        </Card>
      )}

      <section className="space-y-5 pt-2">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">Reporting &amp; Trends</h2>
          <p className="text-sm text-slate-500">
            Performance reporting across charts, trend tables, and revenue breakdowns.
          </p>
        </div>

      {/* Financial Charts */}
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
        <Card className="border border-slate-200/80 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Financial Charts</h2>
            <p className="mt-1 text-xs text-slate-500">Trend view for revenue, expenses, and profitability.</p>
          </div>
          <p className="text-sm text-slate-600 mb-5">
            Monthly cash collected, recorded expenses, and net profit.
          </p>

          {(trendsLoading || profitTrendsLoading) ? (
            <div className="h-[340px] rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-center text-slate-500">
              Loading financial charts...
            </div>
          ) : financialChartData.length === 0 ? (
            <div className="h-[340px] rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-slate-500">
              <p className="text-sm font-medium mb-1">No financial trend data yet</p>
              <p className="text-xs text-slate-400">Financial charts will appear once you have payment and expense history.</p>
            </div>
          ) : (
            <div className="h-[340px] rounded-xl border border-slate-200 bg-white p-2 md:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={financialChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="monthLabel" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Cash Collected" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}

      {/* Revenue Reports */}
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
        <Card>
          <h2 className="text-lg font-semibold">Cash Revenue Reports</h2>
          <p className="text-sm text-slate-600 mb-4">
            Cash-basis revenue and expense breakdowns for quick reporting.
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Cash Collected by Customer</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportRevenueByCustomerCsv}
                  disabled={revenueByCustomerLoading || revenueByCustomer.length === 0}
                >
                  Export CSV
                </Button>
              </div>
              {revenueByCustomerLoading ? (
                <div className="h-[260px] flex items-center justify-center text-slate-500">Loading...</div>
              ) : revenueByCustomer.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-slate-500">No customer revenue data yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-xs font-semibold text-slate-700">Customer</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-slate-700">Collected</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-slate-700">Payments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueByCustomer.slice(0, 8).map((row) => (
                        <tr key={row.customer_id} className="border-b last:border-b-0">
                          <td className="py-2 px-2 text-slate-700 max-w-[180px] truncate" title={row.customer_name || '—'}>
                            {row.customer_name || '—'}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-slate-900">
                            {formatCurrency(row.collected_total || 0)}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {row.payment_count || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Cash Collected by Month</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportRevenueByMonthCsv}
                  disabled={revenueByMonthLoading || revenueByMonth.length === 0}
                >
                  Export CSV
                </Button>
              </div>
              {revenueByMonthLoading ? (
                <div className="h-[260px] flex items-center justify-center text-slate-500">Loading...</div>
              ) : revenueByMonth.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-slate-500">No monthly revenue data yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-xs font-semibold text-slate-700">Month</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-slate-700">Collected</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-slate-700">Payments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueByMonth.map((row) => (
                        <tr key={row.period_start} className="border-b last:border-b-0">
                          <td className="py-2 px-2 text-slate-700">
                            {formatCompactMonth(row.period_start)}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-slate-900">
                            {formatCurrency(row.collected_total || 0)}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {row.payment_count || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Expenses by Category</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportExpensesByCategoryCsv}
                  disabled={expensesByCategoryLoading || expensesByCategory.length === 0}
                >
                  Export CSV
                </Button>
              </div>
              {expensesByCategoryLoading ? (
                <div className="h-[260px] flex items-center justify-center text-slate-500">Loading...</div>
              ) : expensesByCategory.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-slate-500">No expense category data yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-xs font-semibold text-slate-700">Category</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-slate-700">Amount</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-slate-700">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expensesByCategory.slice(0, 8).map((row, idx) => (
                        <tr key={`${row.category || 'uncategorized'}-${idx}`} className="border-b last:border-b-0">
                          <td className="py-2 px-2 text-slate-700 max-w-[180px] truncate" title={row.category || 'Uncategorized'}>
                            {row.category || 'Uncategorized'}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-slate-900">
                            {formatCurrency(row.expense_total || 0)}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {row.expense_count || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Current month customer/category reports • 12-month monthly revenue view
          </p>
        </Card>
      )}

      {/* Trends */}
      {trends.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Trends</h2>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-sm text-slate-600 mb-1">Current DSO</div>
              <div className="text-2xl font-bold text-slate-900">
                {Math.round(trends[trends.length - 1]?.dso_days || 0)} days
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Latest Cash Collected</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(trends[trends.length - 1]?.collected_total || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Latest Outstanding AR</div>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(trends[trends.length - 1]?.outstanding_balance_end || 0)}
              </div>
            </Card>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">Period</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Invoices Sent</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Invoiced (Sent)</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Cash Collected</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Outstanding AR</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">Overdue AR</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">DSO (days)</th>
                </tr>
              </thead>
              <tbody>
                {trends.slice().reverse().map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-700">
                      {new Date(row.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700">
                      {row.sent_invoices_count || 0}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">
                      {formatCurrency(row.sent_invoices_total || 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-green-600">
                      {formatCurrency(row.collected_total || 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-900">
                      {formatCurrency(row.outstanding_balance_end || 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-red-600">
                      {formatCurrency(row.overdue_balance_end || 0)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700">
                      {Math.round(row.dso_days || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      </section>

      <section className="space-y-5 pt-2">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">Receivables &amp; Collections</h2>
          <p className="text-sm text-slate-500">
            Manage aging balances, collection workflows, and communication activity.
          </p>
        </div>

      {/* AR Aging */}
      {arAging && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">AR Aging</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportArAgingCsv}
              disabled={arAgingLoading || !arAging}
            >
              Export CSV
            </Button>
          </div>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <div className="text-sm text-slate-600 mb-1">Outstanding AR</div>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(arAging.outstanding_ar || 0)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {arAging.invoice_count_open || 0} open invoice{arAging.invoice_count_open !== 1 ? 's' : ''}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-600 mb-1">Overdue AR</div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(arAging.overdue_ar || 0)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {arAging.invoice_count_overdue || 0} overdue invoice{arAging.invoice_count_overdue !== 1 ? 's' : ''}
              </div>
            </Card>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card>
              <div className="text-xs text-slate-600 mb-1">0-7 Days</div>
              <div className="text-lg font-semibold text-slate-900">
                {formatCurrency(arAging.bucket_0_7 || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-slate-600 mb-1">8-14 Days</div>
              <div className="text-lg font-semibold text-amber-600">
                {formatCurrency(arAging.bucket_8_14 || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-slate-600 mb-1">15-30 Days</div>
              <div className="text-lg font-semibold text-orange-600">
                {formatCurrency(arAging.bucket_15_30 || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-slate-600 mb-1">31-60 Days</div>
              <div className="text-lg font-semibold text-red-600">
                {formatCurrency(arAging.bucket_31_60 || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-slate-600 mb-1">61-90 Days</div>
              <div className="text-lg font-semibold text-red-700">
                {formatCurrency(arAging.bucket_61_90 || 0)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-slate-600 mb-1">90+ Days</div>
              <div className="text-lg font-semibold text-red-900">
                {formatCurrency(arAging.bucket_90_plus || 0)}
              </div>
            </Card>
          </div>
        </Card>
      )}

      {/* Collections Queue */}
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && collectionsQueue.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Collections Queue</h2>
              <p className="text-xs text-slate-500 mt-1">
                Track collections activity and follow-ups. To record payments, use Payments.
              </p>
            </div>
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
                            if (supportMode) {
                              toast.error("Collection actions are disabled in support mode.")
                              return
                            }
                            setActionModalType('contacted')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          disabled={supportMode}
                          className="text-xs"
                          title={supportMode ? "Collection actions are disabled in support mode" : undefined}
                        >
                          Contacted
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            if (supportMode) {
                              toast.error("Collection actions are disabled in support mode.")
                              return
                            }
                            setActionModalType('promise_to_pay')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          disabled={supportMode}
                          className="text-xs"
                          title={supportMode ? "Collection actions are disabled in support mode" : undefined}
                        >
                          Promise
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            if (supportMode) {
                              toast.error("Collection actions are disabled in support mode.")
                              return
                            }
                            setActionModalType('resolved')
                            setActionModalCustomerId(row.customer_id)
                            setActionModalCustomerName(row.customer_name || 'Unknown')
                            setActionModalOpen(true)
                          }}
                          disabled={supportMode}
                          className="text-xs"
                          title={supportMode ? "Collection actions are disabled in support mode" : undefined}
                        >
                          Resolved
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (supportMode) {
                              toast.error("Collection actions are disabled in support mode.")
                              return
                            }
                            setFollowupModalCustomerId(row.customer_id)
                            setFollowupModalCustomerName(row.customer_name || 'Unknown')
                            setFollowupModalExistingDate(row.next_followup_at || null)
                            setFollowupModalOpen(true)
                          }}
                          disabled={supportMode}
                          className="text-xs"
                          title={supportMode ? "Collection actions are disabled in support mode" : undefined}
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
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
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
      )}

      {/* Collections Escalations */}
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
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
                              if (supportMode) {
                                toast.error("Collection actions are disabled in support mode.")
                                return
                              }
                              setActionModalType('contacted')
                              setActionModalCustomerId(row.customer_id)
                              setActionModalCustomerName(row.customer_name || 'Unknown')
                              setActionModalOpen(true)
                            }}
                            disabled={supportMode}
                            className="text-xs"
                            title={supportMode ? "Collection actions are disabled in support mode" : undefined}
                          >
                            Log Action
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (supportMode) {
                                toast.error("Collection actions are disabled in support mode.")
                                return
                              }
                              setFollowupModalCustomerId(row.customer_id)
                              setFollowupModalCustomerName(row.customer_name || 'Unknown')
                              setFollowupModalExistingDate(row.next_followup_at || null)
                              setFollowupModalOpen(true)
                            }}
                            disabled={supportMode}
                            className="text-xs"
                            title={supportMode ? "Collection actions are disabled in support mode" : undefined}
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
      )}

      {/* Collections Cases */}
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
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
      )}

      {/* Communications Activity */}
      {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
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
      )}

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
          if (supportMode) {
            toast.error("Collection actions are disabled in support mode.")
            return
          }

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

      </section>

      <section className="space-y-5 pt-2">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">Operational Follow-up</h2>
          <p className="text-sm text-slate-500">
            Keep pipeline tasks moving with queue-driven follow-up and remediation.
          </p>
        </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-slate-600 mb-1">Quotes Open</div>
          <div className="text-2xl font-bold text-slate-900">{kpis.quotesOpen}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">Needs Scheduling</div>
          <div className="text-2xl font-bold text-amber-600">{kpis.jobsNeedingScheduling}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">Needs Invoicing</div>
          <div className="text-2xl font-bold text-purple-600">{kpis.uninvoicedCompleted}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">AR Balance Due</div>
          <div className="text-2xl font-bold text-red-600">{formatCurrency(kpis.totalARBalance)}</div>
        </Card>
      </div>

      {/* Recent Activity Panel */}
      {auditLogs.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium">
              {auditLogs.length}
            </span>
          </div>
          
          {auditLogsLoading ? (
            <div className="text-center py-4 text-slate-500">Loading...</div>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => {
                const actionLabel = formatActionLabel(log.action, log.metadata)
                const entityDetail = formatEntityDetail(log.entity_type, log.action, log.metadata)
                
                return (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-3 border-b hover:bg-slate-50 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900">
                        {actionLabel}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {log.entity_type}
                        </span>
                        {entityDetail && (
                          <span className="text-slate-600">{entityDetail}</span>
                        )}
                        {log.actor_role && (
                          <span className="text-slate-400">by {log.actor_role}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4 text-xs text-slate-500">
                      {formatRelativeTime(log.created_at)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Queue 1: Quotes Needing Follow-up */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Quotes Needing Follow-up</h2>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {quotesNeedingFollowUp.length}
          </span>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : quotesNeedingFollowUp.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No quotes need follow-up</div>
        ) : (
          <div>
            {quotesNeedingFollowUp.slice(0, 20).map(renderQuoteRow)}
          </div>
        )}
      </Card>
      </section>

      {/* Queue 2: Needs Scheduling */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Needs Scheduling</h2>
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            {jobsNeedingScheduling.length}
          </span>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : jobsNeedingScheduling.length === 0 ? (
          <div className="text-center py-8 text-slate-500">All jobs are scheduled</div>
        ) : (
          <div>
            {jobsNeedingScheduling.slice(0, 20).map(job => renderJobRow(job, false))}
          </div>
        )}
      </Card>

      {/* Queue 3: Jobs Completed but Not Invoiced */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Jobs Completed but Not Invoiced</h2>
          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            {jobsNeedingInvoicing.length}
          </span>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : jobsNeedingInvoicing.length === 0 ? (
          <div className="text-center py-8 text-slate-500">All completed jobs have invoices</div>
        ) : (
          <div>
            {jobsNeedingInvoicing.slice(0, 20).map(job => renderJobRow(job, false, true))}
          </div>
        )}
      </Card>

      {/* Queue 3.5: Needs Attention (Jobs with open flags) */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Needs Attention</h2>
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
            {jobsNeedingAttention.length}
          </span>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : jobsNeedingAttention.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No jobs need attention</div>
        ) : (
          <div>
            {jobsNeedingAttention.slice(0, 20).map(job => {
              const customer = customersById[job.customer_id]
              const severityColors = {
                low: 'bg-yellow-100 text-yellow-800',
                medium: 'bg-orange-100 text-orange-800',
                high: 'bg-red-100 text-red-800'
              }
              
              return (
                <div
                  key={job.id}
                  className="flex items-start justify-between p-4 border-b hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 mb-1">
                      {customer?.full_name || '—'} • {job.services_performed || 'Job'}
                    </div>
                    <div className="space-y-1">
                      {job.flags.map(flag => (
                        <div key={flag.id} className="flex items-center gap-2 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors[flag.severity] || severityColors.medium}`}>
                            {flag.severity.toUpperCase()}
                          </span>
                          <span className="text-slate-600">{flag.category}:</span>
                          <span className="text-slate-900">{flag.message}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      {formatDate(job.flags[0]?.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => {
                        // Open job drawer (if exists) or navigate to job detail
                        window.open(`/admin/jobs/${job.id}`, '_blank')
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      View Job
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const { error } = await supabase.rpc('admin_resolve_job_flag', {
                            p_flag_id: job.flags[0].id,
                            p_resolution_note: null
                          })
                          
                          if (error) {
                            console.error('Error resolving flag:', error)
                            toast.error('Could not resolve flag')
                            return
                          }
                          
                          toast.success('Flag resolved')
                          // Refresh flags
                          const { data, error: fetchError } = await supabase
                            .from('job_flags')
                            .select('id, job_id, status, severity, category, message, created_at')
                            .eq('company_id', companyId)
                            .eq('status', 'open')
                            .order('created_at', { ascending: false })
                          
                          if (!fetchError) {
                            setJobFlags(data || [])
                          }
                        } catch (err) {
                          console.error('Unexpected error resolving flag:', err)
                          toast.error('An unexpected error occurred')
                        }
                      }}
                      variant="primary"
                      size="sm"
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Queue 4: Invoices With Balance Due */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Invoices With Balance Due</h2>
            {userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (
              <Button
                onClick={async () => {
                try {
                  const { data, error } = await supabase.rpc('eval_invoices_overdue_for_company', {
                    p_limit: 500
                  });

                  if (error) {
                    console.error('Error running overdue evaluation:', error);
                    toast.error(error.message || 'Failed to run overdue evaluation');
                    return;
                  }

                  const updatedCount = data?.[0]?.updated_count || 0;
                  if (updatedCount > 0) {
                    toast.success(`Overdue evaluation updated ${updatedCount} invoice(s).`);
                    // Refetch invoices to show updated statuses
                    const { data: invoiceData } = await supabase
                      .from('invoices')
                      .select(INVOICE_SELECT_REVENUE_HUB)
                      .eq('company_id', companyId);
                    if (invoiceData) {
                      setInvoices(invoiceData);
                      warnIfMissingColumns('RevenueHub.invoices', invoiceData, REQUIRED_INVOICE_COLUMNS);
                    }
                  } else {
                    toast.success('Overdue evaluation completed. No invoices needed updating.');
                  }
                } catch (err) {
                  console.error('Error running overdue evaluation:', err);
                  toast.error('An unexpected error occurred');
                }
              }}
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                Run Overdue Eval Now
              </Button>
            )}
          </div>
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
            {jobsWithBalanceDue.length}
          </span>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">Loading...</div>
        ) : jobsWithBalanceDue.length === 0 ? (
          <div className="text-center py-8 text-slate-500">All jobs are paid in full</div>
        ) : (
          <div>
            {jobsWithBalanceDue.slice(0, 20).map(job => renderJobRow(job, true, false, true))}
          </div>
        )}
      </Card>
    </div>
  )
}
