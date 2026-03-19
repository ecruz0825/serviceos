import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import useCompanySettings from "../../hooks/useCompanySettings";
import { useBrand } from '../../context/BrandContext';
import { useUser } from '../../context/UserContext';
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import EmptyState from "../../components/ui/EmptyState";
import toast from 'react-hot-toast';
import { getUserTeamIds } from '../../utils/teamAccess';
import { offlineStorage } from '../../utils/offlineStorage';
import { getNextAction } from '../../utils/crewNextAction';
import { MapPin, Clock, Camera, CheckCircle, Calendar, Navigation, Bell, Search, RefreshCw, Eye } from 'lucide-react';
import * as Sentry from "@sentry/react";

// Set Sentry role tag for crew portal
Sentry.setTag("role", "crew");

function CrewPortalMobile() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const highlightId = searchParams.get('highlight');
  const { brand } = useBrand();
  const { settings } = useCompanySettings();
  const { role, effectiveCompanyId } = useUser();
  const isAdmin = role && ['admin', 'manager', 'dispatcher'].includes(role);
  
  // Admin preview mode state
  const [previewCrewMemberId, setPreviewCrewMemberId] = useState(null);
  const [crewMembers, setCrewMembers] = useState([]);
  const [loadingCrewMembers, setLoadingCrewMembers] = useState(false);
  
  // Tab state - default to 'today'
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return tab && ['today', 'week', 'all', 'needs_attention'].includes(tab) ? tab : 'today';
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const [allJobs, setAllJobs] = useState([])
  const [jobs, setJobs] = useState([])
  const [jobPayments, setJobPayments] = useState({})
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [updatesCount, setUpdatesCount] = useState(0)
  const [userTeamIds, setUserTeamIds] = useState([])
  const [cacheScope, setCacheScope] = useState({ companyId: null, userId: null })
  
  // Refs for debouncing and tracking
  const refetchTimeoutRef = useRef(null)
  const lastEventTimeRef = useRef(0)
  const subscriptionRef = useRef(null)
  const previousJobsMapRef = useRef(new Map()) // Track previous jobs for change detection

  // Update tab in URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (activeTab !== 'today') {
      params.set('tab', activeTab);
    } else {
      params.delete('tab');
    }
    setSearchParams(params, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  // Monitor online status
  useEffect(() => {
    const cleanup = offlineStorage.onOnlineStatusChange(() => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        toast.success('Back online! Syncing...');
        loadJobs();
      } else {
        toast('You\'re offline. Showing cached jobs.', { icon: '📱' });
      }
    });
    return cleanup;
  }, []);

  const formatMoney = (amount) => {
    const num = parseFloat(amount || 0);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDate = (d) => {
    if (!d) return 'No date';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return 'No date';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const jobDate = new Date(date);
      jobDate.setHours(0, 0, 0, 0);
      
      if (jobDate.getTime() === today.getTime()) {
        return 'Today';
      }
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (jobDate.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return d;
    }
  };

  const loadJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();

      const scope = { companyId: profile?.company_id || null, userId: user.id };
      setCacheScope((prev) => {
        if (prev.companyId === scope.companyId && prev.userId === scope.userId) {
          return prev;
        }
        return scope;
      });

      // Get all teams this worker belongs to (or preview crew member's teams)
      let teamIds;
      if (previewCrewMemberId) {
        // Admin preview mode: get team IDs for selected crew member
        const { data, error } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('crew_member_id', previewCrewMemberId);
        
        if (error) {
          console.error('Error fetching preview crew member teams:', error);
          teamIds = [];
        } else {
          teamIds = (data || []).map(tm => tm.team_id).filter(Boolean);
        }
      } else {
        // Normal mode: get team IDs for current user
        teamIds = await getUserTeamIds(supabase);
      }
      setUserTeamIds(teamIds);
      
      if (teamIds.length === 0) {
        setJobs([]);
        setJobPayments({});
        setLoading(false);
        return;
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
        .order('created_at', { ascending: true });

      const { data: jobsData, error: jobsErr } = await jobsQuery;

      if (jobsErr) {
        console.error('Error loading jobs:', jobsErr);
        // Try to load from cache if offline
        if (!isOnline) {
          const cached = offlineStorage.getCachedJobs(scope);
          if (cached) {
            setAllJobs(cached);
            if (!silent) toast('Showing cached jobs (offline)', { icon: '📱' });
            setLoading(false);
            return;
          }
        }
        if (!silent) toast.error('Could not load jobs.');
        setLoading(false);
        return;
      }

      const jobsList = jobsData || [];
      
      // Detect changes for toast notifications (only if not silent)
      if (!silent && previousJobsMapRef.current.size > 0) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        detectAndNotifyChanges(previousJobsMapRef.current, jobsList, teamIds);
      }
      
      // Update previous jobs map
      const newJobsMap = new Map();
      jobsList.forEach(job => {
        newJobsMap.set(job.id, job);
      });
      previousJobsMapRef.current = newJobsMap;
      
      setAllJobs(jobsList);
      
      // Cache jobs for offline use
      offlineStorage.cacheJobs(jobsList, scope);

      // Load payments for those jobs
      const jobIds = jobsList.map(job => job.id);
      if (jobIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('job_id, amount')
          .eq('status', 'posted')
          .in('job_id', jobIds);

        const map = {};
        (paymentsData || []).forEach(pmt => {
          if (!map[pmt.job_id]) map[pmt.job_id] = { total: 0, records: [] };
          map[pmt.job_id].total += Number(pmt.amount || 0);
          map[pmt.job_id].records.push(pmt);
        });
        setJobPayments(map);
      }
    } catch (err) {
      console.error('Error in loadJobs:', err);
      if (!isOnline) {
        const cached = offlineStorage.getCachedJobs(cacheScope);
        if (cached) {
          setAllJobs(cached);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, cacheScope, previewCrewMemberId]);

  // Detect changes and show appropriate toasts
  const detectAndNotifyChanges = useCallback((previousJobs, currentJobs, teamIds) => {
    const prevMap = previousJobs;
    const currentMap = new Map(currentJobs.map(j => [j.id, j]));
    
    // Check for new assignments (INSERT)
    currentJobs.forEach(job => {
      if (!prevMap.has(job.id) && teamIds.includes(job.assigned_team_id)) {
        toast.success(`New job assigned: ${job.services_performed || 'Job'}`, { icon: '📋' });
      }
    });
    
    // Check for removed/unassigned jobs (DELETE or assignment change)
    prevMap.forEach((prevJob, jobId) => {
      const currentJob = currentMap.get(jobId);
      if (!currentJob) {
        // Job was deleted or unassigned
        toast('Job removed or unassigned', { icon: '🗑️' });
      } else if (prevJob.assigned_team_id !== currentJob.assigned_team_id) {
        // Assignment changed
        if (teamIds.includes(currentJob.assigned_team_id)) {
          toast.success(`Job assigned to your team: ${currentJob.services_performed || 'Job'}`, { icon: '👥' });
        } else {
          toast('Job unassigned from your team', { icon: '👋' });
        }
      } else if (
        prevJob.service_date !== currentJob.service_date ||
        prevJob.scheduled_end_date !== currentJob.scheduled_end_date
      ) {
        // Schedule changed
        toast('Job schedule updated', { icon: '📅' });
      }
    });
  }, []);

  // Update elapsed time for in-progress jobs every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render to update elapsed time
      setJobs(prev => [...prev]);
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Filter and search jobs
  const filteredJobs = useMemo(() => {
    let filtered = [...allJobs];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekFromNowStr = weekFromNow.toISOString().split('T')[0];

    // Apply tab filter
    switch (activeTab) {
      case 'today':
        filtered = filtered.filter(job => {
          const jobDate = job.service_date ? new Date(job.service_date).toISOString().split('T')[0] : null;
          return jobDate === todayStr && job.status !== 'Completed';
        });
        // Sort by service_date, then route_order, then existing fallback
        filtered.sort((a, b) => {
          const dateA = a.service_date ? new Date(a.service_date).getTime() : Number.MAX_SAFE_INTEGER;
          const dateB = b.service_date ? new Date(b.service_date).getTime() : Number.MAX_SAFE_INTEGER;
          if (dateA !== dateB) return dateA - dateB;

          const routeA = Number.isFinite(Number(a.route_order)) ? Number(a.route_order) : Number.MAX_SAFE_INTEGER;
          const routeB = Number.isFinite(Number(b.route_order)) ? Number(b.route_order) : Number.MAX_SAFE_INTEGER;
          if (routeA !== routeB) return routeA - routeB;

          if (a.scheduled_end_date && b.scheduled_end_date) {
            return new Date(a.scheduled_end_date).getTime() - new Date(b.scheduled_end_date).getTime();
          }

          const createdA = new Date(a.created_at || 0).getTime();
          const createdB = new Date(b.created_at || 0).getTime();
          return createdA - createdB;
        });
        break;
      case 'week':
        filtered = filtered.filter(job => {
          const jobDate = job.service_date ? new Date(job.service_date).toISOString().split('T')[0] : null;
          return jobDate && jobDate >= todayStr && jobDate < weekFromNowStr && job.status !== 'Completed';
        });
        break;
      case 'all':
        filtered = filtered.filter(job => job.status !== 'Completed');
        break;
      case 'needs_attention':
        filtered = filtered.filter(job => {
          const hasBefore = !!job.before_image;
          const hasAfter = !!job.after_image;
          const isCompleted = job.status === 'Completed';
          return !isCompleted && (!hasBefore || (hasBefore && !hasAfter));
        });
        break;
      default:
        break;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(job => {
        const customerName = job.customer?.full_name?.toLowerCase() || '';
        const address = job.customer?.address?.toLowerCase() || '';
        const services = job.services_performed?.toLowerCase() || '';
        return customerName.includes(query) || address.includes(query) || services.includes(query);
      });
    }

    return filtered;
  }, [allJobs, activeTab, searchQuery]);

  // Update jobs state when filtered changes
  useEffect(() => {
    setJobs(filteredJobs);
  }, [filteredJobs]);

  // Debounced refetch function
  const debouncedRefetch = useCallback(() => {
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }
    
    // If offline, just increment badge
    if (!isOnline) {
      setUpdatesCount(prev => prev + 1);
      return;
    }
    
    // Debounce refetch by 500ms
    refetchTimeoutRef.current = setTimeout(() => {
      setUpdatesCount(prev => prev + 1);
      loadJobs(true); // Silent refetch
    }, 500);
  }, [isOnline, loadJobs]);

  // Handle updates badge click
  const handleUpdatesClick = useCallback(() => {
    setUpdatesCount(0);
    loadJobs(false); // Full refetch with loading indicator
  }, [loadJobs]);

  // Set up realtime subscription
  // Load crew members for admin preview mode
  useEffect(() => {
    if (isAdmin && effectiveCompanyId) {
      setLoadingCrewMembers(true);
      const fetchCrewMembers = async () => {
        try {
          const { data, error } = await supabase
            .from('crew_members')
            .select('id, full_name')
            .eq('company_id', effectiveCompanyId)
            .order('full_name');
          
          if (error) {
            console.error('Error fetching crew members:', error);
            setCrewMembers([]);
          } else {
            setCrewMembers(data || []);
          }
        } catch (err) {
          console.error('Unexpected error fetching crew members:', err);
          setCrewMembers([]);
        } finally {
          setLoadingCrewMembers(false);
        }
      };
      fetchCrewMembers();
    } else {
      setCrewMembers([]);
      setPreviewCrewMemberId(null);
    }
  }, [isAdmin, effectiveCompanyId]);

  useEffect(() => {
    let mounted = true;
    
    const setupSubscription = async () => {
      // For admin users, only load if preview crew member is selected
      if (isAdmin && !previewCrewMemberId) {
        setAllJobs([]);
        setJobs([]);
        setJobPayments({});
        return;
      }
      
      // Load initial jobs
      await loadJobs();
      
      // Get user's team IDs for filtering (or preview crew member's teams)
      let teamIds;
      if (previewCrewMemberId) {
        const { data, error } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('crew_member_id', previewCrewMemberId);
        
        if (error) {
          console.error('Error fetching preview crew member teams:', error);
          teamIds = [];
        } else {
          teamIds = (data || []).map(tm => tm.team_id).filter(Boolean);
        }
      } else {
        teamIds = await getUserTeamIds(supabase);
      }
      setUserTeamIds(teamIds);
      
      if (teamIds.length === 0 || !mounted) return;
      
      // Create subscription - filter client-side since Supabase Realtime
      // doesn't support complex filters like 'in' for arbitrary columns
      const channel = supabase
        .channel('crew-job-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'jobs'
          },
          (payload) => {
            if (!mounted) return;
            
            const now = Date.now();
            lastEventTimeRef.current = now;
            
            // Check if this change affects the user's teams (client-side filter)
            const newRecord = payload.new;
            const oldRecord = payload.old;
            
            // For INSERT: check if assigned to user's team
            if (payload.eventType === 'INSERT' && newRecord?.assigned_team_id) {
              if (teamIds.includes(newRecord.assigned_team_id)) {
                debouncedRefetch();
              }
            }
            // For UPDATE: check if assignment changed, schedule changed, or session state changed
            else if (payload.eventType === 'UPDATE' && newRecord) {
              const assignmentChanged = oldRecord?.assigned_team_id !== newRecord.assigned_team_id;
              const scheduleChanged = 
                oldRecord?.service_date !== newRecord.service_date ||
                oldRecord?.scheduled_end_date !== newRecord.scheduled_end_date;
              const sessionChanged = 
                oldRecord?.started_at !== newRecord.started_at ||
                oldRecord?.completed_at !== newRecord.completed_at;
              
              // If assigned to user's team (new or old), or schedule/session changed for assigned job
              if (
                teamIds.includes(newRecord.assigned_team_id) ||
                (oldRecord && teamIds.includes(oldRecord.assigned_team_id) && assignmentChanged) ||
                (teamIds.includes(newRecord.assigned_team_id) && (scheduleChanged || sessionChanged))
              ) {
                debouncedRefetch();
              }
            }
            // For DELETE: check if was assigned to user's team
            else if (payload.eventType === 'DELETE' && oldRecord?.assigned_team_id) {
              if (teamIds.includes(oldRecord.assigned_team_id)) {
                debouncedRefetch();
              }
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Realtime subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Realtime subscription error');
          }
        });
      
      subscriptionRef.current = channel;
    };
    
    setupSubscription();
    
    return () => {
      mounted = false;
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [loadJobs, debouncedRefetch, isAdmin, previewCrewMemberId]);
  
  // Auto-refetch on reconnect
  useEffect(() => {
    if (isOnline && updatesCount > 0) {
      // Auto-refetch once when back online
      loadJobs(false);
      setUpdatesCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]); // Note: updatesCount and loadJobs intentionally excluded to avoid loops

  // Scroll to highlighted job
  useEffect(() => {
    if (highlightId && jobs.length > 0) {
      setTimeout(() => {
        const element = document.getElementById(`job-${highlightId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightId, jobs]);

  const handleStartSession = async (job) => {
    try {
      const { data, error } = await supabase.rpc('start_job_session', {
        p_job_id: job.id
      });

      if (error) {
        if (error.message?.includes('JOB_ALREADY_COMPLETED')) {
          toast.error('Cannot start a completed job');
        } else {
          toast.error('Could not start job session');
          console.error('Error starting session:', error);
        }
        return;
      }

      toast.success('Job session started');
      loadJobs(true); // Silent refetch
    } catch (err) {
      toast.error('Failed to start job session');
      console.error('Error starting session:', err);
    }
  };

  const handleStopSession = async (job) => {
    try {
      const { data, error } = await supabase.rpc('stop_job_session', {
        p_job_id: job.id
      });

      if (error) {
        if (error.message?.includes('PHOTOS_REQUIRED')) {
          toast.error('Before and after photos are required to complete the job');
        } else if (error.message?.includes('JOB_NOT_ASSIGNED_TO_TEAM')) {
          toast.error('You do not have permission to complete this job');
        } else {
          toast.error('Could not complete job session');
          console.error('Error stopping session:', error);
        }
        return;
      }

      toast.success('Job session completed');
      loadJobs(true); // Silent refetch
    } catch (err) {
      toast.error('Failed to complete job session');
      console.error('Error stopping session:', err);
    }
  };

  const handleQuickAction = (action, job) => {
    switch (action) {
      case 'navigate':
        if (job.customer?.address) {
          const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(job.customer.address)}`;
          window.open(mapsUrl, '_blank');
        } else {
          toast.error('No address available');
        }
        break;
      case 'start':
        handleStartSession(job);
        break;
      case 'stop':
        handleStopSession(job);
        break;
      case 'upload_before':
      case 'upload_after':
      case 'complete':
        navigate(`/crew/job/${job.id}`);
        break;
      default:
        break;
    }
  };

  // Calculate elapsed time for in-progress jobs
  const getElapsedTime = (startedAt) => {
    if (!startedAt) return null;
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now - start;
    const diffSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  // Get session state
  const getSessionState = (job) => {
    if (job.completed_at) return 'completed';
    if (job.started_at) return 'in_progress';
    return 'not_started';
  };

  const getJobStatus = (job) => {
    const hasBefore = !!job.before_image;
    const hasAfter = !!job.after_image;
    const isCompleted = job.status === 'Completed';
    
    if (isCompleted) return { label: 'Completed', color: 'text-green-600', bg: 'bg-green-50' };
    if (hasBefore && hasAfter) return { label: 'Ready to Complete', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (hasBefore) return { label: 'Needs After Photo', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { label: 'Needs Before Photo', color: 'text-red-600', bg: 'bg-red-50' };
  };

  const tabs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekFromNowStr = weekFromNow.toISOString().split('T')[0];

    return [
      { 
        id: 'today', 
        label: 'Today', 
        count: allJobs.filter(j => {
          const jobDate = j.service_date ? new Date(j.service_date).toISOString().split('T')[0] : null;
          return jobDate === todayStr && j.status !== 'Completed';
        }).length 
      },
      { 
        id: 'week', 
        label: 'Week', 
        count: allJobs.filter(j => {
          const jobDate = j.service_date ? new Date(j.service_date).toISOString().split('T')[0] : null;
          return jobDate && jobDate >= todayStr && jobDate < weekFromNowStr && j.status !== 'Completed';
        }).length 
      },
      { 
        id: 'all', 
        label: 'All', 
        count: allJobs.filter(j => j.status !== 'Completed').length 
      },
      { 
        id: 'needs_attention', 
        label: 'Needs Attention', 
        count: allJobs.filter(j => {
          const hasBefore = !!j.before_image;
          const hasAfter = !!j.after_image;
          const isCompleted = j.status === 'Completed';
          return !isCompleted && (!hasBefore || (hasBefore && !hasAfter));
        }).length 
      }
    ];
  }, [allJobs]);

  const secondaryColor = brand?.secondaryColor || brand?.primaryColor || '#2563eb';
  const todaysRouteStops = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    return allJobs
      .filter((job) => {
        const jobDate = job.service_date ? new Date(job.service_date).toISOString().split('T')[0] : null;
        return jobDate === todayStr && job.status !== 'Completed';
      })
      .sort((a, b) => {
        const routeA = Number.isFinite(Number(a.route_order)) ? Number(a.route_order) : Number.MAX_SAFE_INTEGER;
        const routeB = Number.isFinite(Number(b.route_order)) ? Number(b.route_order) : Number.MAX_SAFE_INTEGER;
        if (routeA !== routeB) return routeA - routeB;

        const dateA = a.service_date ? new Date(a.service_date).getTime() : Number.MAX_SAFE_INTEGER;
        const dateB = b.service_date ? new Date(b.service_date).getTime() : Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      });
  }, [allJobs]);

  // Get selected crew member name for display
  const selectedCrewMemberName = useMemo(() => {
    if (!previewCrewMemberId) return null;
    const member = crewMembers.find(m => m.id === previewCrewMemberId);
    return member?.full_name || null;
  }, [previewCrewMemberId, crewMembers]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Admin Preview Mode Banner */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Admin Preview Mode</p>
                <p className="text-sm text-blue-700">Preview the Crew Portal as a selected crew member.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={previewCrewMemberId || ''}
                onChange={(e) => setPreviewCrewMemberId(e.target.value || null)}
                disabled={loadingCrewMembers}
                className="px-3 py-2 border border-blue-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
              >
                <option value="">Select a crew member...</option>
                {crewMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || `Crew Member ${member.id.substring(0, 8)}`}
                  </option>
                ))}
              </select>
              {loadingCrewMembers && <LoadingSpinner size="sm" />}
            </div>
          </div>
          {!previewCrewMemberId && (
            <p className="text-xs text-blue-600 mt-2">
              Select a crew member above to preview their jobs and route.
            </p>
          )}
        </div>
      )}

      {/* Empty state for admin without preview selection */}
      {isAdmin && !previewCrewMemberId && (
        <div className="px-4 mt-4">
          <EmptyState
            icon={Eye}
            title="Admin Preview Mode"
            description="Select a crew member from the dropdown above to preview their jobs and route."
          />
        </div>
      )}

      {/* Normal jobs content (only show if not admin or if preview is selected) */}
      {(!isAdmin || previewCrewMemberId) && (
        <>
      {/* Sticky Header with Search and Tabs */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-slate-900">Jobs</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadJobs(false)}
                disabled={loading}
                className="inline-flex items-center gap-1 px-2 py-1.5 btn-secondary text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh jobs"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {updatesCount > 0 && (
                <button
                  onClick={handleUpdatesClick}
                  className="relative inline-flex items-center gap-1 px-3 py-1.5 btn-accent text-white text-sm font-medium rounded-lg transition-colors"
                  title="Tap to refresh"
                  style={{ backgroundColor: secondaryColor }}
                >
                  <Bell className="w-4 h-4" />
                  <span>Updates</span>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {updatesCount > 9 ? '9+' : updatesCount}
                  </span>
                </button>
              )}
              {!isOnline && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Offline</span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by customer, address, or service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                style={activeTab === tab.id ? { backgroundColor: secondaryColor } : {}}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`ml-1 ${activeTab === tab.id ? 'text-white opacity-90' : 'text-slate-500'}`}>
                    ({tab.count})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Jobs List */}
      <div className="px-4 pt-4">
        <Card>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Route</h2>
            <p className="text-sm text-slate-600">Your stops in planned order for today.</p>
          </div>
          {todaysRouteStops.length === 0 ? (
            <div className="text-sm text-slate-500">No route stops scheduled for today.</div>
          ) : (
            <div className="space-y-2">
              {todaysRouteStops.map((job, idx) => {
                const stopNumber = Number.isFinite(Number(job.route_order)) ? Number(job.route_order) : idx + 1;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => navigate(`/crew/job/${job.id}`)}
                    className="w-full text-left flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-800 font-semibold text-sm flex items-center justify-center">
                        {stopNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{job.customer?.full_name || 'Customer'}</div>
                        <div className="text-xs text-slate-600 truncate">{job.services_performed || 'Job'}</div>
                        {job.customer?.address && (
                          <div className="text-xs text-slate-500 truncate">{job.customer.address}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-slate-500">{job.status || '—'}</span>
                      {Number.isFinite(Number(job.route_order)) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
                          Stop {stopNumber}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            <div className="text-slate-600">Loading jobs...</div>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="px-4 py-12">
          <Card>
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">
                {searchQuery 
                  ? "No jobs match your search"
                  : activeTab === 'today' && "No jobs scheduled for today"
                  || activeTab === 'week' && "No jobs scheduled this week"
                  || activeTab === 'all' && "No active jobs"
                  || activeTab === 'needs_attention' && "No jobs need attention"
                  || "No jobs found"
                }
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {searchQuery && (
                  <Button
                    variant="secondary"
                    onClick={() => setSearchQuery('')}
                    className="btn-secondary"
                  >
                    Clear Search
                  </Button>
                )}
                {!searchQuery && activeTab === 'today' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setActiveTab('week')}
                      className="btn-secondary"
                    >
                      Switch to Week
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setActiveTab('all')}
                      className="btn-secondary"
                    >
                      Switch to All
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-4">
          {jobs.map(job => {
            const totalPaid = jobPayments[job.id]?.total || 0;
            const remaining = Math.max(0, Number(job.job_cost || 0) - totalPaid);
            const hasBefore = !!job.before_image;
            const hasAfter = !!job.after_image;
            const status = getJobStatus(job);
            const nextAction = getNextAction(job, jobPayments[job.id]);
            const isToday = activeTab === 'today';
            
            const actionColor = nextAction.type === 'attention' 
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : nextAction.type === 'done'
              ? 'text-slate-600 bg-slate-50 border-slate-200'
              : 'text-blue-700 bg-blue-50 border-blue-200';

            return (
              <div
                key={job.id}
                id={`job-${job.id}`}
                className={`transition-all ${
                  highlightId === job.id
                    ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300'
                    : ''
                }`}
              >
                <Card
                  clickable
                  onClick={() => navigate(`/crew/job/${job.id}`)}
                >
                {/* Job Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 mb-1 truncate">
                      {job.services_performed || 'Job'}
                    </h3>
                    <p className="text-sm text-slate-600 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      <span className="truncate">{job.customer?.full_name || 'Customer'}</span>
                    </p>
                  </div>
                  <div className="ml-2 text-right">
                    <p className="text-base font-semibold text-slate-900">{formatMoney(job.job_cost)}</p>
                    {remaining > 0 && (
                      <p className="text-xs text-red-600">Due: {formatMoney(remaining)}</p>
                    )}
                  </div>
                </div>

                {/* Job Details */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(job.service_date)}</span>
                    {job.scheduled_end_date && (
                      <>
                        <span>•</span>
                        <Clock className="w-4 h-4" />
                        <span>{formatTime(job.scheduled_end_date)}</span>
                      </>
                    )}
                  </div>
                  
                  {job.customer?.address && (
                    <p className="text-sm text-slate-600 truncate">{job.customer.address}</p>
                  )}

                  {/* Status and Next Action */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${status.bg} ${status.color}`}>
                      {status.label}
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${actionColor}`}>
                      {nextAction.label}
                    </div>
                  </div>

                  {/* Session State */}
                  {(() => {
                    const sessionState = getSessionState(job);
                    const elapsed = sessionState === 'in_progress' ? getElapsedTime(job.started_at) : null;
                    return (
                      <div className="flex items-center gap-2 text-xs">
                        {sessionState === 'not_started' && (
                          <span className="text-slate-500">Not started</span>
                        )}
                        {sessionState === 'in_progress' && (
                          <span className="text-blue-600 font-medium">
                            Running: {elapsed}
                          </span>
                        )}
                        {sessionState === 'completed' && (
                          <span className="text-green-600">Completed</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Photo Status with Thumbnails */}
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      <span className={hasBefore ? 'text-green-600' : 'text-red-600'}>
                        Before {hasBefore ? '✓' : '✗'}
                      </span>
                      {hasBefore && job.before_image && (
                        <img 
                          src={job.before_image} 
                          alt="Before thumbnail" 
                          className="w-8 h-8 rounded object-cover ml-1 border border-slate-200"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      <span className={hasAfter ? 'text-green-600' : 'text-red-600'}>
                        After {hasAfter ? '✓' : '✗'}
                      </span>
                      {hasAfter && job.after_image && (
                        <img 
                          src={job.after_image} 
                          alt="After thumbnail" 
                          className="w-8 h-8 rounded object-cover ml-1 border border-slate-200"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions (Today tab only) */}
                {isToday && job.status !== 'Completed' && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200">
                    {(() => {
                      const sessionState = getSessionState(job);
                      return (
                        <>
                          {sessionState === 'not_started' && (
                            <Button
                              onClick={() => handleQuickAction('start', job)}
                              variant="primary"
                              className="text-xs py-1.5 col-span-2"
                              size="sm"
                            >
                              <Clock className="w-4 h-4 inline mr-1" />
                              Start Job
                            </Button>
                          )}
                          {sessionState === 'in_progress' && (
                            <>
                              {job.customer?.address && (
                                <Button
                                  onClick={() => handleQuickAction('navigate', job)}
                                  variant="secondary"
                                  className="text-xs py-1.5"
                                  size="sm"
                                >
                                  <Navigation className="w-4 h-4 inline mr-1" />
                                  Navigate
                                </Button>
                              )}
                              {!hasBefore && (
                                <Button
                                  onClick={() => handleQuickAction('upload_before', job)}
                                  variant="primary"
                                  className="text-xs py-1.5"
                                  size="sm"
                                >
                                  <Camera className="w-4 h-4 inline mr-1" />
                                  Before Photo
                                </Button>
                              )}
                              {hasBefore && !hasAfter && (
                                <Button
                                  onClick={() => handleQuickAction('upload_after', job)}
                                  variant="primary"
                                  className="text-xs py-1.5"
                                  size="sm"
                                >
                                  <Camera className="w-4 h-4 inline mr-1" />
                                  After Photo
                                </Button>
                              )}
                              {hasBefore && hasAfter && (
                                <Button
                                  onClick={() => handleQuickAction('stop', job)}
                                  variant="primary"
                                  className="text-xs py-1.5 col-span-2"
                                  size="sm"
                                >
                                  <CheckCircle className="w-4 h-4 inline mr-1" />
                                  Complete Job
                                </Button>
                              )}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* View Details Button */}
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/crew/job/${job.id}`);
                  }}
                  variant="secondary"
                  className="w-full mt-3 text-sm btn-secondary"
                  size="sm"
                >
                  View Details
                </Button>
                </Card>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default CrewPortalMobile;
