import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { getUserTeamIds } from '../utils/teamAccess'
import { offlineStorage } from '../utils/offlineStorage'

/**
 * useCrewJobs - Shared hook for fetching crew jobs
 * 
 * @param {string|null} previewCrewMemberId - Optional crew member ID for admin preview mode
 * 
 * Returns: { jobs, jobPayments, loading, error, refetch }
 * 
 * Uses the same query logic as CrewPortalMobile to ensure consistency
 */
export function useCrewJobs(previewCrewMemberId = null) {
  const [jobs, setJobs] = useState([])
  const [jobPayments, setJobPayments] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [cacheScope, setCacheScope] = useState({ companyId: null, userId: null })

  const loadJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      const scope = { companyId: profile?.company_id || null, userId: user.id }
      setCacheScope((prev) => {
        if (prev.companyId === scope.companyId && prev.userId === scope.userId) {
          return prev
        }
        return scope
      })

      // Get all teams this worker belongs to (or preview crew member's teams)
      let teamIds
      if (previewCrewMemberId) {
        // Admin preview mode: get team IDs for selected crew member
        const { data, error } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('crew_member_id', previewCrewMemberId)
        
        if (error) {
          console.error('Error fetching preview crew member teams:', error)
          teamIds = []
        } else {
          teamIds = (data || []).map(tm => tm.team_id).filter(Boolean)
        }
      } else {
        // Normal mode: get team IDs for current user
        teamIds = await getUserTeamIds(supabase)
      }
      
      if (teamIds.length === 0) {
        setJobs([])
        setJobPayments({})
        setLoading(false)
        return
      }

      // Build jobs query: only team-based (assigned_team_id)
      const jobsQuery = supabase
        .from('jobs')
        .select(`
          id, service_date, scheduled_end_date, route_order, services_performed, status, job_cost, 
          before_image, after_image, assigned_team_id, notes, customer_id,
          started_at, completed_at, created_at,
          customer:customers(full_name, address)
        `)
        .in('assigned_team_id', teamIds)
        .order('service_date', { ascending: true })
        .order('route_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      const { data: jobsData, error: jobsErr } = await jobsQuery

      if (jobsErr) {
        console.error('Error loading jobs:', jobsErr)
        // Try to load from cache if offline
        if (!isOnline) {
          const cached = offlineStorage.getCachedJobs(scope)
          if (cached) {
            setJobs(cached)
            setLoading(false)
            return
          }
        }
        setError(jobsErr)
        setLoading(false)
        return
      }

      const jobsList = jobsData || []
      setJobs(jobsList)
      
      // Cache jobs for offline use
      offlineStorage.cacheJobs(jobsList, scope)

      // Load payments for those jobs
      const jobIds = jobsList.map(job => job.id)
      if (jobIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('job_id, amount')
          .eq('status', 'posted')
          .in('job_id', jobIds)

        const map = {}
        ;(paymentsData || []).forEach(pmt => {
          if (!map[pmt.job_id]) map[pmt.job_id] = { total: 0, records: [] }
          map[pmt.job_id].total += Number(pmt.amount || 0)
          map[pmt.job_id].records.push(pmt)
        })
        setJobPayments(map)
      } else {
        setJobPayments({})
      }
    } catch (err) {
      console.error('Error in loadJobs:', err)
      setError(err)
      if (!isOnline) {
        const cached = offlineStorage.getCachedJobs(cacheScope)
        if (cached) {
          setJobs(cached)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [isOnline, cacheScope, previewCrewMemberId])

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  return {
    jobs,
    jobPayments,
    loading,
    error,
    refetch: () => loadJobs(false),
  }
}
