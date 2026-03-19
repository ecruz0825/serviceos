import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Button from "../../components/ui/Button";
import toast from "react-hot-toast";
import { AlertCircle, Users, Route, MapPin, Calendar, TrendingUp, AlertTriangle, ExternalLink } from "lucide-react";

// Date helper: Get today's date in YYYY-MM-DD format (timezone-safe using local date components)
const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Date helper: Get date N days from today (timezone-safe)
const getDateNDaysFromToday = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Calculate next scheduled date for a recurring job
const getNextScheduledDate = (startDateStr, recurrenceType, lastGeneratedDate) => {
  if (!startDateStr || !recurrenceType) return null;
  
  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let next = lastGeneratedDate ? new Date(lastGeneratedDate) : new Date(startDate);
  next.setHours(0, 0, 0, 0);

  // Calculate next occurrence
  while (next <= today) {
    if (recurrenceType === "weekly") {
      next.setDate(next.getDate() + 7);
    } else if (recurrenceType === "biweekly") {
      next.setDate(next.getDate() + 14);
    } else if (recurrenceType === "monthly") {
      next.setMonth(next.getMonth() + 1);
    } else {
      return null;
    }
  }

  // Format as YYYY-MM-DD (timezone-safe)
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function JobIntelligenceAdmin() {
  const { effectiveCompanyId, supportMode } = useUser();
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Data state
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [routeRuns, setRouteRuns] = useState([]);
  const [routeStops, setRouteStops] = useState([]);
  const [recurringJobs, setRecurringJobs] = useState([]);
  
  // Derive today's jobs from jobs array (single source of truth)
  const todaysJobs = useMemo(() => {
    const today = getTodayDate();
    return jobs.filter(job => job.service_date === today);
  }, [jobs]);
  
  // Initialize company ID from UserContext (supports support mode)
  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId);
    }
  }, [effectiveCompanyId]);

  // Fetch all data
  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      setLoading(true);
      const today = getTodayDate();
      const next7DaysEnd = getDateNDaysFromToday(7);

      try {
        // 1. Fetch jobs for today through next 7 days
        const { data: jobsData, error: jobsError } = await supabase
          .from("jobs")
          .select("id, service_date, assigned_team_id, status, recurring_job_id, customer_id, customer:customers(id, full_name, address)")
          .eq("company_id", companyId)
          .gte("service_date", today)
          .lte("service_date", next7DaysEnd)
          .order("service_date", { ascending: true });

        if (jobsError) {
          console.error("Error fetching jobs:", jobsError);
        }

        // 2. Fetch customers (for address checks)
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name, address")
          .eq("company_id", companyId);

        if (customersError) {
          console.error("Error fetching customers:", customersError);
        }

        // 4. Fetch teams
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name");

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
        }

        // 5. Fetch route_runs for today through next 7 days
        const { data: routeRunsData, error: routeRunsError } = await supabase
          .from("route_runs")
          .select("id, service_date, team_id, status")
          .eq("company_id", companyId)
          .gte("service_date", today)
          .lte("service_date", next7DaysEnd);

        if (routeRunsError) {
          console.error("Error fetching route_runs:", routeRunsError);
        }

        // 6. Fetch route_stops for loaded route_runs
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

        // 7. Fetch recurring jobs for schedule intelligence
        const { data: recurringData, error: recurringError } = await supabase
          .from("recurring_jobs")
          .select("id, customer_id, start_date, recurrence_type, is_paused, last_generated_date, customer:customers(id, full_name)")
          .eq("company_id", companyId)
          .eq("is_paused", false);

        if (recurringError) {
          console.error("Error fetching recurring jobs:", recurringError);
        }

        // Set state
        setJobs(jobsData || []);
        setCustomers(customersData || []);
        setTeams(teamsData || []);
        setRouteRuns(routeRunsData || []);
        setRouteStops(routeStopsData || []);
        setRecurringJobs(recurringData || []);
      } catch (err) {
        console.error("Unexpected error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  // Insight 1: Unassigned Upcoming Jobs
  const unassignedUpcomingJobs = useMemo(() => {
    return jobs.filter(job => !job.assigned_team_id);
  }, [jobs]);

  // Insight 2: Jobs Assigned But Not Routed Today
  const assignedButNotRoutedToday = useMemo(() => {
    const today = getTodayDate();
    const todaysRouteRuns = routeRuns.filter(rr => rr.service_date === today);
    
    return teams
      .map(team => {
        const assignedJobsCount = todaysJobs.filter(job => job.assigned_team_id === team.id).length;
        const routeExists = todaysRouteRuns.some(rr => rr.team_id === team.id);
        
        if (assignedJobsCount > 0 && !routeExists) {
          return {
            teamId: team.id,
            teamName: team.name,
            assignedJobsCount
          };
        }
        return null;
      })
      .filter(item => item !== null);
  }, [teams, todaysJobs, routeRuns]);

  // Insight 3: Route Mismatch (for today)
  const routeMismatches = useMemo(() => {
    const today = getTodayDate();
    const todaysRouteRuns = routeRuns.filter(rr => rr.service_date === today);
    
    return teams
      .map(team => {
        const assignedJobsCount = todaysJobs.filter(job => job.assigned_team_id === team.id).length;
        const teamRouteRun = todaysRouteRuns.find(rr => rr.team_id === team.id);
        
        if (teamRouteRun) {
          const routeStopsCount = routeStops.filter(rs => rs.route_run_id === teamRouteRun.id).length;
          
          if (assignedJobsCount !== routeStopsCount) {
            return {
              teamId: team.id,
              teamName: team.name,
              assignedJobsCount,
              routeStopsCount
            };
          }
        }
        return null;
      })
      .filter(item => item !== null);
  }, [teams, todaysJobs, routeRuns, routeStops]);

  // Insight 4: Missing Customer Address
  const missingAddressJobs = useMemo(() => {
    return jobs.filter(job => {
      const customer = job.customer;
      return customer && (!customer.address || customer.address.trim() === '');
    });
  }, [jobs]);

  // Insight 5: Recurring Schedule Attention
  const recurringScheduleAttention = useMemo(() => {
    const today = getTodayDate();
    const next7DaysEnd = getDateNDaysFromToday(7);
    
    return recurringJobs
      .map(job => {
        const nextDate = getNextScheduledDate(
          job.start_date,
          job.recurrence_type,
          job.last_generated_date
        );
        
        if (nextDate && nextDate >= today && nextDate <= next7DaysEnd) {
          // Check if job exists for this recurring schedule on next date
          const jobExists = jobs.some(
            j => j.recurring_job_id === job.id && j.service_date === nextDate
          );
          
          if (!jobExists) {
            return {
              recurringJobId: job.id,
              customerName: job.customer?.full_name || 'Unknown Customer',
              recurrenceType: job.recurrence_type,
              nextExpectedDate: nextDate
            };
          }
        }
        return null;
      })
      .filter(item => item !== null);
  }, [recurringJobs, jobs]);

  // Insight 6: Incomplete Operational Data
  const incompleteDataJobs = useMemo(() => {
    return jobs.filter(job => {
      return !job.customer_id || !job.service_date;
    });
  }, [jobs]);

  // Calculate KPI summary
  const kpiSummary = useMemo(() => {
    const totalInsights = 
      unassignedUpcomingJobs.length +
      assignedButNotRoutedToday.length +
      routeMismatches.length +
      missingAddressJobs.length +
      recurringScheduleAttention.length +
      incompleteDataJobs.length;

    return {
      totalInsights,
      unassignedUpcoming: unassignedUpcomingJobs.length,
      addressIssues: missingAddressJobs.length,
      routeMismatches: routeMismatches.length
    };
  }, [unassignedUpcomingJobs, assignedButNotRoutedToday, routeMismatches, missingAddressJobs, recurringScheduleAttention, incompleteDataJobs]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  const hasAnyInsights = kpiSummary.totalInsights > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Intelligence"
        subtitle="Operational insights and risk signals for jobs and schedules."
      />

      {/* KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-slate-600" />
              <div className="text-sm text-slate-600">Total Insights</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{kpiSummary.totalInsights}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-amber-600" />
              <div className="text-sm text-slate-600">Unassigned Upcoming</div>
            </div>
            <div className="text-2xl font-bold text-amber-900">{kpiSummary.unassignedUpcoming}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-amber-600" />
              <div className="text-sm text-slate-600">Address Issues</div>
            </div>
            <div className="text-2xl font-bold text-amber-900">{kpiSummary.addressIssues}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Route className="h-5 w-5 text-amber-600" />
              <div className="text-sm text-slate-600">Route Mismatches</div>
            </div>
            <div className="text-2xl font-bold text-amber-900">{kpiSummary.routeMismatches}</div>
          </div>
        </Card>
      </div>

      {!hasAnyInsights ? (
        <Card>
          <div className="p-6">
            <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3 text-center">
              <p className="font-medium mb-1">No operational issues detected</p>
              <p className="text-xs text-green-600">All jobs are properly assigned, routed, and have complete data. Great work!</p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Insight 1: Unassigned Upcoming Jobs */}
          {unassignedUpcomingJobs.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-600" />
                  Unassigned Upcoming Jobs
                </h2>
                <div className="mb-2 text-sm text-slate-600">
                  {unassignedUpcomingJobs.length} {unassignedUpcomingJobs.length === 1 ? 'job' : 'jobs'} in the next 7 days have no team assigned.
                </div>
                <div className="space-y-2">
                  {unassignedUpcomingJobs.map(job => (
                    <div key={job.id} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="font-medium text-slate-900 mb-1">
                        {job.customer?.full_name || 'Unknown Customer'}
                      </div>
                      <div className="text-sm text-slate-600 mb-2">
                        {job.service_date}
                      </div>
                      <Link to={`/admin/operations?tab=schedule&focusDate=${job.service_date}&jobId=${job.id}`}>
                        <Button className="text-sm">
                          <Calendar className="h-4 w-4 mr-1" />
                          Assign in Schedule
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 2: Jobs Assigned But Not Routed Today */}
          {assignedButNotRoutedToday.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Route className="h-5 w-5 text-amber-600" />
                  Jobs Assigned But Not Routed Today
                </h2>
                <div className="space-y-2">
                  {assignedButNotRoutedToday.map(team => (
                    <div key={team.teamId} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="font-medium text-slate-900 mb-1">{team.teamName}</div>
                      <div className="text-sm text-slate-600 mb-2">
                        {team.assignedJobsCount} {team.assignedJobsCount === 1 ? 'job' : 'jobs'} assigned but no route generated
                      </div>
                      <Link to="/admin/operations?tab=today">
                        <Button className="text-sm">
                          <Route className="h-4 w-4 mr-1" />
                          Generate Today's Route
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 3: Route Mismatch */}
          {routeMismatches.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Route Mismatch
                </h2>
                <div className="space-y-2">
                  {routeMismatches.map(mismatch => (
                    <div key={mismatch.teamId} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{mismatch.teamName}</div>
                          <div className="text-sm text-slate-600">
                            {mismatch.assignedJobsCount} assigned jobs but {mismatch.routeStopsCount} route stops
                          </div>
                        </div>
                        <Link to="/admin/operations?tab=today">
                          <Button className="text-sm">
                            <Route className="h-4 w-4 mr-1" />
                            Fix Today's Route
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 4: Missing Customer Address */}
          {missingAddressJobs.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-amber-600" />
                  Missing Customer Address
                </h2>
                <div className="space-y-2">
                  {missingAddressJobs.map(job => {
                    const team = teams.find(t => t.id === job.assigned_team_id);
                    return (
                      <div key={job.id} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="font-medium text-slate-900 mb-1">
                          {job.customer?.full_name || 'Unknown Customer'}
                        </div>
                        <div className="text-sm text-slate-600 mb-2">
                          {job.service_date} {team ? `• ${team.name}` : ''}
                        </div>
                        {job.customer_id && (
                          <Link to={`/admin/customers?customer_id=${job.customer_id}`}>
                            <Button className="text-sm">
                              <MapPin className="h-4 w-4 mr-1" />
                              Update Address
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 5: Recurring Schedule Attention */}
          {recurringScheduleAttention.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-amber-600" />
                  Recurring Schedule Attention
                </h2>
                <div className="space-y-2">
                  {recurringScheduleAttention.map(item => (
                    <div key={item.recurringJobId} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="font-medium text-slate-900 mb-1">{item.customerName}</div>
                      <div className="text-sm text-slate-600 mb-2">
                        {item.recurrenceType} schedule • Expected: {item.nextExpectedDate} • No generated job
                      </div>
                      <Link to="/admin/operations?tab=automation">
                        <Button className="text-sm">
                          <Calendar className="h-4 w-4 mr-1" />
                          View Scheduling Center
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 6: Incomplete Operational Data */}
          {incompleteDataJobs.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Incomplete Operational Data
                </h2>
                <div className="space-y-2">
                  {incompleteDataJobs.map(job => (
                    <div key={job.id} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="font-medium text-slate-900 mb-1">Job ID: {job.id.slice(0, 8)}...</div>
                      <div className="text-sm text-slate-600 mb-2">
                        Missing: {!job.customer_id ? 'customer' : ''} {!job.customer_id && !job.service_date ? ', ' : ''} {!job.service_date ? 'service_date' : ''}
                      </div>
                      <Link to={`/admin/jobs?openJobId=${job.id}`}>
                        <Button className="text-sm">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Job
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
