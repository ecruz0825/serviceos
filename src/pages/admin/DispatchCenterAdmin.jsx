import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import Button from "../../components/ui/Button";
import { Briefcase, Users, MapPin, Route, CheckCircle, Clock, AlertCircle, AlertTriangle, RefreshCw, Info, Calendar } from "lucide-react";
import { useBillingGuard } from "../../components/ui/BillingGuard";
import BillingGuard from "../../components/ui/BillingGuard";

// Date helper: Get today's date in YYYY-MM-DD format (timezone-safe using local date components)
const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DispatchCenterAdmin() {
  const { effectiveCompanyId, supportMode } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Data state
  const [todaysJobs, setTodaysJobs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [routeRuns, setRouteRuns] = useState([]);
  const [routeStops, setRouteStops] = useState([]);
  
  // Initialize company ID from UserContext (supports support mode)
  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId);
    }
  }, [effectiveCompanyId]);

  // Fetch all data for today
  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      setLoading(true);
      const today = getTodayDate();

      try {
        // 1. Fetch today's jobs with customer, assigned_team_id, status
        const { data: jobsData, error: jobsError } = await supabase
          .from("jobs")
          .select("id, service_date, assigned_team_id, status, customer:customers(id, full_name, address)")
          .eq("company_id", companyId)
          .eq("service_date", today);

        if (jobsError) {
          console.error("Error fetching jobs:", jobsError);
        }

        // 2. Fetch teams
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name");

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
        }

        // 3. Fetch route_runs for today
        const { data: routeRunsData, error: routeRunsError } = await supabase
          .from("route_runs")
          .select("id, service_date, team_id, status")
          .eq("company_id", companyId)
          .eq("service_date", today);

        if (routeRunsError) {
          console.error("Error fetching route_runs:", routeRunsError);
        }

        // 4. Fetch route_stops for today's route_runs
        let routeStopsData = [];
        if (routeRunsData && routeRunsData.length > 0) {
          const routeRunIds = routeRunsData.map(rr => rr.id);
          const { data: stopsData, error: stopsError } = await supabase
            .from("route_stops")
            .select("id, route_run_id, stop_order, job_id")
            .in("route_run_id", routeRunIds);

          if (stopsError) {
            console.error("Error fetching route_stops:", stopsError);
          } else {
            routeStopsData = stopsData || [];
          }
        }

        // Set state
        setTodaysJobs(jobsData || []);
        setTeams(teamsData || []);
        setRouteRuns(routeRunsData || []);
        setRouteStops(routeStopsData || []);
      } catch (err) {
        console.error("Unexpected error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  // Calculate today's job counts
  const jobCounts = {
    total: todaysJobs.length,
    completed: todaysJobs.filter(j => (j.status || '').toLowerCase() === 'completed').length,
    pending: todaysJobs.filter(j => (j.status || '').toLowerCase() === 'pending').length,
  };

  // Calculate crew load (number of assigned jobs today per team)
  const crewLoad = teams.map(team => {
    const assignedJobsCount = todaysJobs.filter(job => job.assigned_team_id === team.id).length;
    return {
      teamId: team.id,
      teamName: team.name,
      jobsCount: assignedJobsCount
    };
  });

  // Get unassigned jobs (assigned_team_id IS NULL AND service_date = today)
  const unassignedJobs = todaysJobs.filter(job => !job.assigned_team_id);

  // Group today's jobs for clear scan flow (exclude Canceled)
  const needsAttentionJobs = todaysJobs.filter(job => !job.assigned_team_id && job.status !== 'Canceled');
  const inProgressJobs = todaysJobs.filter(
    job => job.assigned_team_id && (job.status === 'Pending' || job.status === 'In Progress')
  );
  const completedJobs = todaysJobs.filter(job => (job.status || '').toLowerCase() === 'completed');

  const getTeamName = (teamId) => teams.find(t => t.id === teamId)?.name || '—';

  // Handle route regeneration for today's operational fixes
  const [regeneratingRoutes, setRegeneratingRoutes] = useState({});

  const handleRegenerateRoute = async (teamId, teamName) => {
    if (supportMode) {
      toast.error("Route regeneration is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Route regeneration is disabled due to billing status.");
      return;
    }

    if (!companyId || !teamId) return;

    setRegeneratingRoutes(prev => ({ ...prev, [teamId]: true }));
    const today = getTodayDate();

    try {
      const { data, error } = await supabase.rpc(
        'generate_team_route_for_day',
        {
          p_service_date: today,
          p_team_id: teamId
        }
      );

      if (error) {
        console.error('Error regenerating route:', error);
        // Map error to user-friendly message
        let userMessage = 'Failed to regenerate route';
        const errorMsg = (error.message || '').toLowerCase();
        if (errorMsg.includes('no jobs') || errorMsg.includes('not found') || errorMsg.includes('no routable')) {
          userMessage = 'No routable jobs found for this team. Ensure jobs are assigned and have valid addresses.';
        } else {
          userMessage = error.message || 'Failed to regenerate route. Please try again.';
        }
        toast.error(userMessage);
        setRegeneratingRoutes(prev => ({ ...prev, [teamId]: false }));
        return;
      }

      // Check if route was actually generated
      if (!data || data.length === 0 || !data[0]?.route_run_id) {
        toast.error('No routable jobs found for this team. Ensure jobs are assigned and have valid addresses.');
        setRegeneratingRoutes(prev => ({ ...prev, [teamId]: false }));
        return;
      }

      // Refresh route data
      const { data: routeRunsData } = await supabase
        .from("route_runs")
        .select("id, service_date, team_id, status")
        .eq("company_id", companyId)
        .eq("service_date", today);

      if (routeRunsData) {
        setRouteRuns(routeRunsData);
      }

      // Refresh route stops
      if (routeRunsData && routeRunsData.length > 0) {
        const routeRunIds = routeRunsData.map(rr => rr.id);
        const { data: stopsData } = await supabase
          .from("route_stops")
          .select("id, route_run_id, stop_order, job_id")
          .in("route_run_id", routeRunIds);

        if (stopsData) {
          setRouteStops(stopsData);
        }
      }

      toast.success(`Today's route regenerated for ${teamName}`);
      setRegeneratingRoutes(prev => ({ ...prev, [teamId]: false }));
    } catch (err) {
      console.error('Unexpected error regenerating route:', err);
      toast.error('Failed to regenerate today\'s route. Please try again.');
      setRegeneratingRoutes(prev => ({ ...prev, [teamId]: false }));
    }
  };


  // Calculate route status for each team
  const routeStatus = teams.map(team => {
    const teamRouteRun = routeRuns.find(rr => rr.team_id === team.id);
    const stopsCount = teamRouteRun 
      ? routeStops.filter(rs => rs.route_run_id === teamRouteRun.id).length
      : 0;
    return {
      teamId: team.id,
      teamName: team.name,
      routeExists: !!teamRouteRun,
      routeStatus: teamRouteRun?.status || null,
      routeRunId: teamRouteRun?.id || null,
      stopsCount
    };
  });

  // Calculate dispatch warnings
  const dispatchWarnings = [];
  
  // Warning 1: Unassigned jobs exist
  if (unassignedJobs.length > 0) {
    dispatchWarnings.push({
      type: 'unassigned',
      message: `${unassignedJobs.length} ${unassignedJobs.length === 1 ? 'job is' : 'jobs are'} still unassigned today.`
    });
  }

  // Warning 2-5: Check each team
  teams.forEach(team => {
    const assignedJobsCount = todaysJobs.filter(job => job.assigned_team_id === team.id).length;
    const teamRouteRun = routeRuns.find(rr => rr.team_id === team.id);
    const routeStopsCount = teamRouteRun 
      ? routeStops.filter(rs => rs.route_run_id === teamRouteRun.id).length
      : 0;

    // Warning 2: Team has assigned jobs but no route
    if (assignedJobsCount > 0 && !teamRouteRun) {
      dispatchWarnings.push({
        type: 'no_route',
        teamId: team.id,
        teamName: team.name,
        message: `${team.name} has ${assignedJobsCount} ${assignedJobsCount === 1 ? 'assigned job' : 'assigned jobs'} but no route generated.`
      });
    }

    // Warning 3: Route stop mismatch
    if (teamRouteRun && assignedJobsCount !== routeStopsCount) {
      dispatchWarnings.push({
        type: 'route_mismatch',
        teamId: team.id,
        teamName: team.name,
        assignedJobsCount,
        routeStopsCount,
        routeRunId: teamRouteRun.id,
        message: `${team.name} has ${assignedJobsCount} ${assignedJobsCount === 1 ? 'assigned job' : 'assigned jobs'} but only ${routeStopsCount} ${routeStopsCount === 1 ? 'route stop' : 'route stops'}.`
      });
    }

    // Warning 4: Idle team
    if (assignedJobsCount === 0) {
      dispatchWarnings.push({
        type: 'idle',
        message: `${team.name} has no jobs assigned today.`
      });
    }

    // Warning 5: Overloaded team
    if (assignedJobsCount >= 8) {
      dispatchWarnings.push({
        type: 'overloaded',
        message: `${team.name} has a heavy load with ${assignedJobsCount} assigned jobs today.`
      });
    }
  });

  // Status badge styling (clean, minimal)
  const getStatusBadge = (job) => {
    if (!job.assigned_team_id) {
      return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">Unassigned</span>;
    }
    const status = (job.status || 'Pending').toLowerCase();
    if (status === 'completed') {
      return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">Completed</span>;
    }
    if (status === 'in progress') {
      return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">In Progress</span>;
    }
    return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">Pending</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dispatch Center"
        subtitle="Today's services at a glance. Fix issues first, then run the board."
      />

      {/* Focal: Needs Attention — stronger emphasis */}
      <div className="rounded-2xl border-2 border-amber-200/90 bg-gradient-to-b from-amber-50/80 to-white p-1 shadow-sm">
        <Card>
        <div className="p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Needs Attention
          </h2>
          {dispatchWarnings.length === 0 ? (
            <p className="text-sm text-slate-600">No dispatch warnings for today.</p>
          ) : (
            <div className="space-y-3">
              {dispatchWarnings.map((warning, index) => (
                <div key={index} className="flex items-start justify-between gap-3 py-3 px-4 bg-amber-50/80 rounded-lg border border-amber-200/80">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-900">{warning.message}</span>
                  </div>
                  {warning.type === 'route_mismatch' && warning.teamId && (
                    <BillingGuard>
                      <Button
                        onClick={() => handleRegenerateRoute(warning.teamId, warning.teamName)}
                        disabled={regeneratingRoutes[warning.teamId] || supportMode || billingDisabled}
                        variant="secondary"
                        className="flex items-center gap-1 text-xs px-2 py-1.5 flex-shrink-0"
                        title={supportMode ? "Route regeneration is disabled in support mode" : billingDisabled ? billingReason : "Fix today's route order for this team"}
                      >
                        <RefreshCw className={`h-3 w-3 ${regeneratingRoutes[warning.teamId] ? 'animate-spin' : ''}`} />
                        Fix Route
                      </Button>
                    </BillingGuard>
                  )}
                  {warning.type === 'no_route' && warning.teamId && (
                    <BillingGuard>
                      <Button
                        onClick={() => handleRegenerateRoute(warning.teamId, warning.teamName)}
                        disabled={regeneratingRoutes[warning.teamId] || supportMode || billingDisabled}
                        variant="secondary"
                        className="flex items-center gap-1 text-xs px-2 py-1.5 flex-shrink-0"
                        title={supportMode ? "Route generation is disabled in support mode" : billingDisabled ? billingReason : "Generate today's route for this team"}
                      >
                        <Route className={`h-3 w-3 ${regeneratingRoutes[warning.teamId] ? 'animate-spin' : ''}`} />
                        Generate Route
                      </Button>
                    </BillingGuard>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </Card>
      </div>

      {/* Today's Jobs — grouped */}
      <Card>
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-600" />
              Today's Jobs
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              {jobCounts.total} total · {needsAttentionJobs.length} need attention · {inProgressJobs.length} in progress · {completedJobs.length} completed
            </p>
          </div>

          {todaysJobs.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No jobs scheduled today.</p>
          ) : (
            <div className="space-y-6">
              {/* Needs Attention */}
              {needsAttentionJobs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Needs Attention</h3>
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 overflow-hidden">
                    <div className="divide-y divide-amber-200/60">
                      {needsAttentionJobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 px-4 sm:px-5"
                        >
                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:gap-4 sm:items-center">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{job.customer?.full_name || 'Unknown Customer'}</p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{job.customer?.address || 'No address'}</p>
                            </div>
                            <span className="text-xs text-slate-500 sm:text-right">Today</span>
                            {getStatusBadge(job)}
                          </div>
                          <div className="flex-shrink-0">
                            <Link to={`/admin/operations?tab=schedule&focusDate=${job.service_date}&jobId=${job.id}`}>
                              <Button variant="tertiary" className="flex items-center gap-1.5 text-sm">
                                <Calendar className="h-3.5 w-3.5" />
                                Assign in Schedule
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* In Progress */}
              {inProgressJobs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">In Progress</h3>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {inProgressJobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 px-4 sm:px-5 hover:bg-slate-50/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:gap-4 sm:items-center">
                            <p className="font-medium text-slate-900 truncate">{job.customer?.full_name || 'Unknown Customer'}</p>
                            <span className="text-xs text-slate-500 sm:text-right">Today · {getTeamName(job.assigned_team_id)}</span>
                            {getStatusBadge(job)}
                          </div>
                          <div className="flex-shrink-0">
                            <Link to={`/admin/jobs?openJobId=${job.id}`}>
                              <Button variant="tertiary" className="text-sm">View</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Completed */}
              {completedJobs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Completed</h3>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {completedJobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 px-4 sm:px-5 hover:bg-slate-50/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:gap-4 sm:items-center">
                            <p className="font-medium text-slate-900 truncate">{job.customer?.full_name || 'Unknown Customer'}</p>
                            <span className="text-xs text-slate-500 sm:text-right">Today · {getTeamName(job.assigned_team_id)}</span>
                            {getStatusBadge(job)}
                          </div>
                          <div className="flex-shrink-0">
                            <Link to={`/admin/jobs?openJobId=${job.id}`}>
                              <Button variant="tertiary" className="text-sm">View</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Crew Load — secondary */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          Crew Load
        </h2>
        {crewLoad.length === 0 ? (
          <p className="text-sm text-slate-500">No teams found</p>
        ) : (
          <div className="space-y-2">
            {crewLoad.map((crew) => (
              <div key={crew.teamId} className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/80 border border-slate-100">
                <span className="font-medium text-slate-900">{crew.teamName}</span>
                <span className="text-sm text-slate-600 tabular-nums">
                  {crew.jobsCount} {crew.jobsCount === 1 ? 'job' : 'jobs'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Route Status — secondary */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Route className="h-4 w-4 text-slate-500" />
            Route Status
          </h2>
          {routeStatus.length === 0 ? (
            <p className="text-sm text-slate-500">No teams found</p>
          ) : (
            <div className="space-y-2">
              {routeStatus.map((route) => (
                <div key={route.teamId} className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/80 border border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-slate-900">{route.teamName}</span>
                    {route.routeExists ? (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          route.routeStatus === 'published'
                            ? 'bg-green-100 text-green-800'
                            : route.routeStatus === 'archived'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                        title={
                          route.routeStatus === 'published'
                            ? 'Published'
                            : route.routeStatus === 'archived'
                              ? 'Archived'
                              : 'Draft'
                        }
                      >
                        {route.routeStatus || 'Draft'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">No route</span>
                    )}
                  </div>
                  <span className="text-sm text-slate-600 tabular-nums flex-shrink-0 ml-2">
                    {route.stopsCount} {route.stopsCount === 1 ? 'stop' : 'stops'}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
