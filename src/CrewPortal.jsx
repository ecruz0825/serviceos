import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useCompanySettings from "./hooks/useCompanySettings";
import { useUser } from './context/UserContext';
import Button from "./components/ui/Button";
import toast from 'react-hot-toast';
import { getUserTeamIds } from './utils/teamAccess';
import LoadingSpinner from './components/ui/LoadingSpinner';
import EmptyState from './components/ui/EmptyState';
import { Route, MapPin, Eye } from 'lucide-react';
import * as Sentry from "@sentry/react";

// Set Sentry role tag for crew portal
Sentry.setTag("role", "crew");

function CrewPortal() {
  const { settings } = useCompanySettings();
  const { role, effectiveCompanyId } = useUser();
  // Admin-level roles that should have access to preview mode
  const isAdmin = role && ['admin', 'manager', 'dispatcher'].includes(role);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const filter = searchParams.get('filter');
  const highlightId = searchParams.get('highlight');

  const crewLabel = settings?.crew_label || "Crew";
  const crewLabelPlural = crewLabel.endsWith("s") ? crewLabel : `${crewLabel}s`;
  const primaryColor = settings?.primary_color || "#2563eb";
  const [showCompleted, setShowCompleted] = useState(false)
  const [allJobs, setAllJobs] = useState([])
  const [jobs, setJobs] = useState([])
  const [jobPayments, setJobPayments] = useState({})
  const [crewStats, setCrewStats] = useState({ earnings: 0, completed: 0 })
  
  // Today's Route state
  const [routeData, setRouteData] = useState(null)
  const [loadingRoute, setLoadingRoute] = useState(true)
  const [userTeamId, setUserTeamId] = useState(null)
  const [routeError, setRouteError] = useState(null)
  
  // Admin preview mode state
  const [previewCrewMemberId, setPreviewCrewMemberId] = useState(null)
  const [crewMembers, setCrewMembers] = useState([])
  const [loadingCrewMembers, setLoadingCrewMembers] = useState(false)

  const formatMoney = (amount) => {
    const num = parseFloat(amount || 0);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  };

  // Get today's date in YYYY-MM-DD format (safe, no timezone shift)
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format YYYY-MM-DD date string as local date (no timezone shift)
  const formatDateOnly = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return 'N/A';
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  // Get team IDs for preview mode (admin) or normal mode (crew)
  const getTeamIdsForPreview = async () => {
    if (isAdmin && previewCrewMemberId) {
      // Admin preview mode: get team IDs for selected crew member
      const { data, error } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('crew_member_id', previewCrewMemberId);
      
      if (error) {
        console.error('Error fetching preview crew member teams:', error);
        return [];
      }
      
      return (data || []).map(tm => tm.team_id).filter(Boolean);
    } else {
      // Normal mode: get team IDs for current user
      return await getUserTeamIds(supabase);
    }
  };

  // Load today's route for the crew user's team
  const loadTodayRoute = async () => {
    setLoadingRoute(true);
    setRouteError(null);

    try {
      // Get team IDs (either for preview or current user)
      const teamIds = await getTeamIdsForPreview();
      
      if (teamIds.length === 0) {
        setUserTeamId(null);
        setRouteData(null);
        setLoadingRoute(false);
        return;
      }

      // Use first team for route (routes are per team)
      const primaryTeamId = teamIds[0];
      setUserTeamId(primaryTeamId);

      const todayDate = getTodayDate();

      // Load route using RPC
      const { data, error } = await supabase.rpc(
        'get_team_route_for_day',
        {
          p_service_date: todayDate,
          p_team_id: primaryTeamId
        }
      );

      if (error) {
        console.error('Error loading route:', error);
        const errorMessage = error.message || 'Failed to load route';
        // Don't show toast for "no route found" - that's expected
        if (!errorMessage.includes('not found')) {
          setRouteError(errorMessage);
        }
        setRouteData(null);
        return;
      }

      if (data && data.length > 0) {
        // Group route data - first row has route header, all rows have stops
        const firstRow = data[0];
        const stops = data.map(row => ({
          stop_order: row.stop_order,
          job_id: row.job_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude
        }));

        setRouteData({
          route_run_id: firstRow.route_run_id,
          service_date: firstRow.service_date,
          team_id: firstRow.team_id,
          status: firstRow.status,
          generation_method: firstRow.generation_method,
          total_stops: firstRow.total_stops,
          created_at: firstRow.created_at,
          stops: stops
        });
      } else {
        setRouteData(null);
      }
    } catch (err) {
      console.error('Unexpected error loading route:', err);
      setRouteError(err.message || 'Failed to load route');
      setRouteData(null);
    } finally {
      setLoadingRoute(false);
    }
  };

  const openGoogleMaps = (address) => {
    if (!address) return;
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const loadJobs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get all teams (either for preview or current user)
    const teamIds = await getTeamIdsForPreview()
    
    if (teamIds.length === 0) {
      setJobs([])
      setAllJobs([])
      setJobPayments({})
      setCrewStats({ completed: 0, earnings: 0 })
      return
    }

    // Build jobs query: only team-based (assigned_team_id)
    const jobsQuery = supabase
      .from('jobs')
      .select(`
        id, service_date, services_performed, status, job_cost, before_image, after_image, assigned_team_id,
        customer:customers(full_name)
      `)
      .in('assigned_team_id', teamIds)
      .order('service_date', { ascending: true })

    const { data: jobsData, error: jobsErr } = await jobsQuery

    if (jobsErr) {
      console.error('Error loading jobs:', jobsErr)
      toast.error('Could not load jobs.')
      return
    }

    const jobsList = jobsData || [];
    setAllJobs(jobsList)

    // payments for those jobs
    const jobIds = jobsList.map(job => job.id)
    if (jobIds.length === 0) {
      setJobPayments({})
      setCrewStats({ completed: 0, earnings: 0 })
      return
    }

    const { data: paymentsData, error: payErr } = await supabase
      .from('payments')
      .select('job_id, amount')
      .eq('status', 'posted')
      .in('job_id', jobIds)

    if (payErr) {
      console.error(payErr)
    }

    const map = {}
    ;(paymentsData || []).forEach(pmt => {
      if (!map[pmt.job_id]) map[pmt.job_id] = { total: 0, records: [] }
      map[pmt.job_id].total += Number(pmt.amount || 0)
      map[pmt.job_id].records.push(pmt)
    })
    setJobPayments(map)

    const completed = (jobsData || []).filter(j => j.status === 'Completed')
    setCrewStats({ completed: completed.length, earnings: 0 })
  }

  // Filter jobs based on filter param
  useEffect(() => {
    let filtered = [...allJobs];

    if (filter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      switch (filter) {
        case 'today':
          filtered = filtered.filter(job => {
            const jobDate = job.service_date ? new Date(job.service_date).toISOString().split('T')[0] : null;
            return jobDate === todayStr;
          });
          break;
        case 'needs_before_photos':
          filtered = filtered.filter(job => 
            job.status !== 'Completed' && !job.before_image
          );
          break;
        case 'needs_after_photos':
          filtered = filtered.filter(job => 
            job.status !== 'Completed' && job.before_image && !job.after_image
          );
          break;
        case 'ready_to_complete':
          filtered = filtered.filter(job => 
            job.status !== 'Completed' && job.before_image && job.after_image
          );
          break;
        case 'balance_due':
          filtered = filtered.filter(job => {
            const totalPaid = jobPayments[job.id]?.total || 0;
            const remaining = Math.max(0, Number(job.job_cost || 0) - totalPaid);
            return remaining > 0;
          });
          break;
        default:
          break;
      }
    }

    setJobs(filtered);
  }, [allJobs, filter, jobPayments])

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
    }
  }, [isAdmin, effectiveCompanyId]);

  // Load jobs: for crew users always, for admin users only when preview is selected
  useEffect(() => {
    // For admin users, only load if preview crew member is selected
    if (isAdmin && !previewCrewMemberId) {
      setJobs([]);
      setAllJobs([]);
      setJobPayments({});
      setCrewStats({ completed: 0, earnings: 0 });
      return;
    }

    // Load jobs for crew users or admin preview
    loadJobs();
    const channel = supabase
      .channel('crew-job-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadJobs)
      .subscribe()
    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, previewCrewMemberId]) // Reload when preview changes

  // Load today's route: for crew users always, for admin users only when preview is selected
  useEffect(() => {
    // For admin users, only load if preview crew member is selected
    if (isAdmin && !previewCrewMemberId) {
      setRouteData(null);
      setUserTeamId(null);
      setLoadingRoute(false);
      return;
    }

    // Load route for crew users or admin preview
    loadTodayRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, previewCrewMemberId]) // Reload when preview changes

  const fmtDate = (d) => {
    if (!d) return 'No date'
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return d
    }
  }

  // Scroll to highlighted job on mount
  useEffect(() => {
    if (highlightId) {
      setTimeout(() => {
        const element = document.getElementById(`job-${highlightId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightId, jobs]);

  const getFilterLabel = () => {
    switch (filter) {
      case 'today': return "Today's Jobs";
      case 'needs_before_photos': return 'Needs Before Photos';
      case 'needs_after_photos': return 'Needs After Photos';
      case 'ready_to_complete': return 'Ready to Complete';
      case 'balance_due': return 'Balance Due';
      default: return 'All Jobs';
    }
  };

  const displayedJobs = jobs.filter(job => showCompleted || job.status !== 'Completed');

  return (
    <div className="space-y-6">
      {/* Admin Preview Mode Banner */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
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
              Select a crew member above to preview their dashboard, jobs, and route.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Jobs</h1>
        {filter && (
          <div className="text-sm text-slate-600">
            Filter: <span className="font-semibold">{getFilterLabel()}</span>
          </div>
        )}
      </div>

      {/* Today's Route Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Today's Route</h2>
          <p className="text-sm text-slate-600 mt-1">Your assigned stops for today.</p>
        </div>

        {loadingRoute ? (
          <div className="py-8">
            <LoadingSpinner text="Loading route..." />
          </div>
        ) : !userTeamId ? (
          <EmptyState
            icon={Route}
            title="No team assigned"
            description="You are not assigned to a team yet."
          />
        ) : routeError && !routeData ? (
          <div className="py-8 text-center">
            <p className="text-red-600 font-medium">Error loading route</p>
            <p className="text-sm text-slate-600 mt-2">{routeError}</p>
          </div>
        ) : !routeData ? (
          <EmptyState
            icon={Route}
            title="No route found"
            description="No route has been generated for your team today."
          />
        ) : (
          <div className="space-y-4">
            {/* Route Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  routeData.status === 'published' ? 'bg-green-100 text-green-800' :
                  routeData.status === 'archived' ? 'bg-slate-100 text-slate-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {routeData.status}
                </span>
                <span className="text-sm text-slate-600">
                  {routeData.total_stops} {routeData.total_stops === 1 ? 'stop' : 'stops'}
                </span>
              </div>
            </div>

            {/* Stops List */}
            <div className="space-y-3">
              {routeData.stops.map((stop) => (
                <div
                  key={`${stop.job_id}-${stop.stop_order}`}
                  className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-slate-700">{stop.stop_order}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">
                          {stop.customer_name || '—'}
                        </h4>
                        <div className="mt-1 flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-600">
                              {stop.address || 'No address'}
                            </p>
                          </div>
                        </div>
                        {stop.job_id && (
                          <p className="text-xs text-slate-400 mt-1 font-mono">
                            Job: {stop.job_id.substring(0, 8)}...
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {stop.address && (
                          <Button
                            onClick={() => openGoogleMaps(stop.address)}
                            variant="tertiary"
                            className="text-xs"
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            Map
                          </Button>
                        )}
                        {stop.job_id && (
                          <Button
                            onClick={() => navigate(`/crew/job/${stop.job_id}`)}
                            variant="primary"
                            className="text-xs"
                          >
                            Open Job
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">{crewLabel} Completed: <span className="font-semibold">{crewStats.completed}</span></p>
          <Button
            onClick={() => setShowCompleted(prev => !prev)}
            variant="primary"
            className="text-sm px-3 py-1"
          >
            {showCompleted ? `Hide Completed` : `Show Completed`}
          </Button>
        </div>
      </div>

      {displayedJobs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-slate-600">No jobs found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {displayedJobs.map(job => {
            const totalPaid = jobPayments[job.id]?.total || 0;
            const remaining = Math.max(0, Number(job.job_cost || 0) - totalPaid);
            const hasBefore = !!job.before_image;
            const hasAfter = !!job.after_image;
            const isCompleted = job.status === 'Completed';
            const isPaid = isCompleted && remaining === 0;

            return (
              <div
                key={job.id}
                id={`job-${job.id}`}
                className={`bg-white rounded-lg shadow p-6 border-2 transition-all ${
                  highlightId === job.id 
                    ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' 
                    : 'border-transparent hover:border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">
                          {job.services_performed || 'Job'}
                        </h3>
                        <p className="text-sm text-slate-600">
                          {job.customer?.full_name || 'Customer'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900">{formatMoney(job.job_cost)}</p>
                        {remaining > 0 && (
                          <p className="text-xs text-red-600 mt-1">Balance: {formatMoney(remaining)}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                      <div>
                        <span className="text-slate-600">Date: </span>
                        <span className="font-medium">{fmtDate(job.service_date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Status: </span>
                        <span className={`font-medium ${
                          isPaid ? 'text-green-600' :
                          isCompleted ? 'text-yellow-600' :
                          'text-orange-600'
                        }`}>
                          {isPaid ? 'Paid' : isCompleted ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">Photos: </span>
                        <span className={hasBefore ? 'text-green-600' : 'text-red-600'}>
                          Before {hasBefore ? '✅' : '❌'}
                        </span>
                        <span className={hasAfter ? 'text-green-600' : 'text-red-600'}>
                          After {hasAfter ? '✅' : '❌'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <Button
                      onClick={() => navigate(`/crew/job/${job.id}`)}
                      variant="primary"
                      className="w-full md:w-auto min-w-[120px]"
                    >
                      Open Job
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  )
}

export default CrewPortal
