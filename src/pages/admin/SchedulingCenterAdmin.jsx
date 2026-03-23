import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { Calendar, AlertCircle, Clock, TrendingUp, Users, CheckCircle, Play, Route, Info } from "lucide-react";
import Button from "../../components/ui/Button";
import toast from "react-hot-toast";
import { logProductEvent } from "../../lib/productEvents";
import { useBillingGuard } from "../../components/ui/BillingGuard";
import BillingGuard from "../../components/ui/BillingGuard";
import usePlanLimits from "../../hooks/usePlanLimits";
import UpgradeLimitModal from "../../components/ui/UpgradeLimitModal";
import handlePlanLimitError from "../../utils/handlePlanLimitError";
import LimitCard from "../../components/ui/LimitCard";
import LimitWarningBanner from "../../components/ui/LimitWarningBanner";

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

export default function SchedulingCenterAdmin() {
  const { effectiveCompanyId, supportMode } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const navigate = useNavigate();
  const { plan, limits, usage, isLoading: limitsLoading, canCreateJob } = usePlanLimits();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingRoutes, setGeneratingRoutes] = useState(false);
  
  // Data state
  const [recurringJobs, setRecurringJobs] = useState([]);
  const [next7DaysJobs, setNext7DaysJobs] = useState([]);
  const [todaysJobs, setTodaysJobs] = useState([]);
  const [routeRuns, setRouteRuns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [teams, setTeams] = useState([]);
  
  // Pre-generation validation state (must be declared before any early returns)
  const [validationSummary, setValidationSummary] = useState(null);
  const [showValidation, setShowValidation] = useState(false);
  
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
        // 1. Fetch recurring jobs with customer info
        const { data: recurringData, error: recurringError } = await supabase
          .from("recurring_jobs")
          .select("id, customer_id, start_date, recurrence_type, is_paused, last_generated_date, default_team_id, services_performed, customer:customers(id, full_name)")
          .eq("company_id", companyId)
          .order("start_date", { ascending: true });

        if (recurringError) {
          console.error("Error fetching recurring jobs:", recurringError);
        }

        // 2. Fetch jobs for next 7 days
        const { data: jobsData, error: jobsError } = await supabase
          .from("jobs")
          .select("id, service_date, assigned_team_id, status, recurring_job_id, customer:customers(id, full_name)")
          .eq("company_id", companyId)
          .gte("service_date", today)
          .lte("service_date", next7DaysEnd)
          .order("service_date", { ascending: true });

        if (jobsError) {
          console.error("Error fetching jobs:", jobsError);
        }

        // 2a. Fetch today's jobs separately for route generation
        const { data: todaysJobsData, error: todaysJobsError } = await supabase
          .from("jobs")
          .select("id, service_date, assigned_team_id, status")
          .eq("company_id", companyId)
          .eq("service_date", today);

        if (todaysJobsError) {
          console.error("Error fetching today's jobs:", todaysJobsError);
        }

        // 2b. Fetch route_runs for today
        const { data: routeRunsData, error: routeRunsError } = await supabase
          .from("route_runs")
          .select("id, service_date, team_id, status")
          .eq("company_id", companyId)
          .eq("service_date", today);

        if (routeRunsError) {
          console.error("Error fetching route_runs:", routeRunsError);
        }

        // 3. Fetch customers (for display)
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name")
          .eq("company_id", companyId);

        if (customersError) {
          console.error("Error fetching customers:", customersError);
        }

        // 4. Fetch teams (for assignment visibility)
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name");

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
        }

        // Set state
        setRecurringJobs(recurringData || []);
        setNext7DaysJobs(jobsData || []);
        setTodaysJobs(todaysJobsData || []);
        setRouteRuns(routeRunsData || []);
        setCustomers(customersData || []);
        setTeams(teamsData || []);
      } catch (err) {
        console.error("Unexpected error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  // Calculate upcoming recurring work (next scheduled date within next 7 days)
  const upcomingRecurringWork = useMemo(() => {
    const today = getTodayDate();
    const next7DaysEnd = getDateNDaysFromToday(7);
    
    return recurringJobs
      .filter(job => !job.is_paused)
      .map(job => {
        const nextDate = getNextScheduledDate(
          job.start_date,
          job.recurrence_type,
          job.last_generated_date
        );
        return {
          ...job,
          nextScheduledDate: nextDate,
          isDueSoon: nextDate && nextDate >= today && nextDate <= next7DaysEnd
        };
      })
      .filter(job => job.isDueSoon)
      .sort((a, b) => {
        if (!a.nextScheduledDate || !b.nextScheduledDate) return 0;
        return a.nextScheduledDate.localeCompare(b.nextScheduledDate);
      });
  }, [recurringJobs]);

  // Calculate jobs by date for next 7 days
  const jobsByDate = useMemo(() => {
    const today = getTodayDate();
    const dates = [];
    for (let i = 0; i <= 7; i++) {
      dates.push(getDateNDaysFromToday(i));
    }

    return dates.map(date => ({
      date,
      jobs: next7DaysJobs.filter(job => job.service_date === date),
      unassignedCount: next7DaysJobs.filter(job => job.service_date === date && !job.assigned_team_id).length
    }));
  }, [next7DaysJobs]);

  // Calculate scheduling gaps
  const schedulingGaps = useMemo(() => {
    const gaps = [];
    const today = getTodayDate();
    const next7DaysEnd = getDateNDaysFromToday(7);

    // Gap 1: Jobs in next 7 days with no assigned_team_id
    const unassignedNext7Days = next7DaysJobs.filter(job => !job.assigned_team_id);
    if (unassignedNext7Days.length > 0) {
      gaps.push({
        type: 'unassigned',
        message: `${unassignedNext7Days.length} ${unassignedNext7Days.length === 1 ? 'job' : 'jobs'} in the next 7 days ${unassignedNext7Days.length === 1 ? 'has' : 'have'} no team assigned.`
      });
    }

    // Gap 2: Active recurring schedules with no upcoming generated job
    recurringJobs
      .filter(job => !job.is_paused)
      .forEach(job => {
        const nextDate = getNextScheduledDate(
          job.start_date,
          job.recurrence_type,
          job.last_generated_date
        );
        
        if (nextDate && nextDate >= today && nextDate <= next7DaysEnd) {
          // Check if job exists for this recurring schedule on next date
          const jobExists = next7DaysJobs.some(
            j => j.recurring_job_id === job.id && j.service_date === nextDate
          );
          
          if (!jobExists) {
            const customerName = job.customer?.full_name || 'Unknown Customer';
            gaps.push({
              type: 'missing_job',
              message: `Recurring schedule for ${customerName} (${job.recurrence_type}) has no generated job for ${nextDate}.`
            });
          }
        }
      });

    return gaps;
  }, [recurringJobs, next7DaysJobs]);

  // Calculate schedule health summary
  const scheduleHealth = useMemo(() => {
    const activeRecurring = recurringJobs.filter(job => !job.is_paused).length;
    const scheduledNext7Days = next7DaysJobs.length;
    const unassignedNext7Days = next7DaysJobs.filter(job => !job.assigned_team_id).length;

    return {
      activeRecurring,
      scheduledNext7Days,
      unassignedNext7Days
    };
  }, [recurringJobs, next7DaysJobs]);

  // Calculate today's teams requiring routes
  const todaysTeamsRequiringRoutes = useMemo(() => {
    const today = getTodayDate();
    
    // Get teams with assigned jobs today
    const teamsWithJobs = teams.map(team => {
      const assignedJobsCount = todaysJobs.filter(job => job.assigned_team_id === team.id).length;
      const routeExists = routeRuns.some(rr => rr.team_id === team.id);
      
      return {
        teamId: team.id,
        teamName: team.name,
        assignedJobsCount,
        routeExists
      };
    }).filter(team => team.assignedJobsCount > 0); // Only teams with assigned jobs
    
    return teamsWithJobs;
  }, [teams, todaysJobs, routeRuns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  // Handle job generation
  const handleGenerateJobs = async () => {
    if (supportMode) {
      toast.error("Job generation is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Job generation is disabled due to billing status.");
      return;
    }

    if (!companyId) return;

    // Proactive limit check for monthly job limit
    if (!limitsLoading && !canCreateJob) {
      setShowUpgradeModal(true);
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_jobs_from_recurring');

      if (error) {
        console.error("Error generating jobs:", error);
        // Check for plan limit errors first
        if (!handlePlanLimitError(error, navigate)) {
          // Fallback to existing error handling for non-limit errors
          let userMessage = 'Could not generate jobs from recurring schedules.';
          const errorMsg = (error.message || '').toLowerCase();
          
          if (errorMsg.includes('no recurring') || errorMsg.includes('not found')) {
            userMessage = 'No active recurring schedules found. Create recurring schedules first.';
          } else if (errorMsg.includes('permission') || errorMsg.includes('unauthorized')) {
            userMessage = 'You do not have permission to generate jobs.';
          } else {
            userMessage = error.message || 'Could not generate jobs from recurring schedules. Please try again.';
          }
          
          toast.error(userMessage);
        }
        setGenerating(false);
        return;
      }

      const createdCount = data?.filter(r => r.created).length || 0;
      if (createdCount > 0) {
        toast.success(`Generated ${createdCount} ${createdCount === 1 ? 'job' : 'jobs'} from recurring schedules.`);
      } else {
        toast.success("No new jobs to generate. All recurring schedules are up to date.");
      }

      // Refresh data
      const today = getTodayDate();
      const next7DaysEnd = getDateNDaysFromToday(7);

      // Refresh recurring jobs
      const { data: recurringData } = await supabase
        .from("recurring_jobs")
        .select("id, customer_id, start_date, recurrence_type, is_paused, last_generated_date, default_team_id, services_performed, customer:customers(id, full_name)")
        .eq("company_id", companyId)
        .order("start_date", { ascending: true });

      // Refresh jobs for next 7 days
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, service_date, assigned_team_id, status, recurring_job_id, customer:customers(id, full_name)")
        .eq("company_id", companyId)
        .gte("service_date", today)
        .lte("service_date", next7DaysEnd)
        .order("service_date", { ascending: true });

      if (recurringData) setRecurringJobs(recurringData);
      if (jobsData) setNext7DaysJobs(jobsData);
      
      // Refresh today's jobs and route_runs
      const { data: todaysJobsData } = await supabase
        .from("jobs")
        .select("id, service_date, assigned_team_id, status")
        .eq("company_id", companyId)
        .eq("service_date", today);

      const { data: routeRunsData } = await supabase
        .from("route_runs")
        .select("id, service_date, team_id, status")
        .eq("company_id", companyId)
        .eq("service_date", today);

      if (todaysJobsData) setTodaysJobs(todaysJobsData);
      if (routeRunsData) setRouteRuns(routeRunsData);
    } catch (err) {
      console.error("Unexpected error generating jobs:", err);
      toast.error("Could not generate jobs from recurring schedules.");
    } finally {
      setGenerating(false);
    }
  };

  // Validate before bulk route generation
  const validateBulkRoutes = async () => {
    const today = getTodayDate();
    
    try {
      // Get teams with assigned jobs today
      const teamsWithJobs = todaysTeamsRequiringRoutes.filter(team => !team.routeExists && team.assignedJobsCount > 0);
      
      if (teamsWithJobs.length === 0) {
        return { valid: false, message: 'All teams with assigned jobs today already have routes.' };
      }

      // For each team, check job validation
      let totalJobs = 0;
      let jobsWithAddress = 0;
      let jobsWithCoords = 0;
      let teamsNeedingRoutes = 0;

      for (const team of teamsWithJobs) {
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id, customer:customers(address, latitude, longitude)')
          .eq('company_id', companyId)
          .eq('service_date', today)
          .eq('assigned_team_id', team.teamId);

        if (jobsData && jobsData.length > 0) {
          totalJobs += jobsData.length;
          jobsWithAddress += jobsData.filter(j => j.customer?.address && j.customer.address.trim() !== '').length;
          jobsWithCoords += jobsData.filter(j => j.customer?.latitude && j.customer?.longitude).length;
          teamsNeedingRoutes++;
        }
      }

      const summary = {
        teamsNeedingRoutes,
        totalJobs,
        jobsWithAddress,
        jobsWithCoords,
        missingAddress: totalJobs - jobsWithAddress,
        missingCoords: totalJobs - jobsWithCoords,
        willUseFallback: (totalJobs - jobsWithCoords) > 0
      };

      setValidationSummary(summary);
      return { valid: true, summary };
    } catch (err) {
      console.error('Error during validation:', err);
      return { valid: true, summary: null }; // Continue anyway
    }
  };

  // Handle route generation for today's teams
  const handleGenerateTodaysRoutes = async () => {
    if (supportMode) {
      toast.error("Route generation is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Route generation is disabled due to billing status.");
      return;
    }

    if (!companyId) return;

    // Run validation first
    const validation = await validateBulkRoutes();
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    // Show validation summary if available
    if (validation.summary) {
      setShowValidation(true);
    }

    setGeneratingRoutes(true);
    const today = getTodayDate();
    
    let routesCreated = 0;
    let routesSkipped = 0;
    let teamsSkippedNoJobs = 0;

    try {
      // Find all teams with assigned jobs today
      const teamsNeedingRoutes = todaysTeamsRequiringRoutes.filter(team => !team.routeExists);

      if (teamsNeedingRoutes.length === 0) {
        toast.success("All teams with assigned jobs today already have routes.");
        setGeneratingRoutes(false);
        return;
      }

      // Generate routes for each team that doesn't have one
      for (const team of teamsNeedingRoutes) {
        if (team.assignedJobsCount === 0) {
          teamsSkippedNoJobs++;
          continue;
        }

        try {
          const { data, error } = await supabase.rpc(
            'generate_team_route_for_day',
            {
              p_service_date: today,
              p_team_id: team.teamId
            }
          );

          if (error) {
            console.error(`Error generating route for team ${team.teamName}:`, error);
            // Map error to user-friendly message (logged but not shown per-team to avoid spam)
            routesSkipped++;
            continue;
          }

          // Check if route was actually generated
          if (data && data.length > 0 && data[0]?.route_run_id) {
            routesCreated++;
            // Log product event: route_generated
            logProductEvent('route_generated', {
              route_run_id: data[0].route_run_id,
              team_id: team.teamId,
              service_date: today,
              stops_count: data[0].total_stops || 0
            });
          } else {
            routesSkipped++;
          }
        } catch (err) {
          console.error(`Unexpected error generating route for team ${team.teamName}:`, err);
          routesSkipped++;
        }
      }

      // Refresh route_runs
      const { data: routeRunsData } = await supabase
        .from("route_runs")
        .select("id, service_date, team_id, status")
        .eq("company_id", companyId)
        .eq("service_date", today);

      if (routeRunsData) setRouteRuns(routeRunsData);

      // Show summary toast
      const parts = [];
      if (routesCreated > 0) {
        parts.push(`${routesCreated} ${routesCreated === 1 ? 'route' : 'routes'} created`);
      }
      if (routesSkipped > 0) {
        parts.push(`${routesSkipped} ${routesSkipped === 1 ? 'team' : 'teams'} skipped (route already exists or no routable jobs)`);
      }
      if (teamsSkippedNoJobs > 0) {
        parts.push(`${teamsSkippedNoJobs} ${teamsSkippedNoJobs === 1 ? 'team' : 'teams'} skipped (no assigned jobs)`);
      }

      if (parts.length > 0) {
        toast.success(parts.join(', '));
      } else {
        toast.success("Route generation completed.");
      }
    } catch (err) {
      console.error("Unexpected error generating routes:", err);
      toast.error("Could not generate routes.");
    } finally {
      setGeneratingRoutes(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Focal: key actions + metrics */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <PageHeader
            title="Scheduling Center"
            subtitle="Operational view of recurring schedules and upcoming service generation."
          />
          <Button
          onClick={handleGenerateJobs}
          disabled={generating || loading || supportMode || billingDisabled}
          className="flex items-center gap-2"
          title={supportMode ? "Job generation is disabled in support mode" : billingDisabled ? billingReason : undefined}
        >
          <Play className="h-4 w-4" />
          {generating ? "Generating..." : "Generate Scheduled Jobs"}
        </Button>
        </div>

        {/* Plan Usage */}
        <LimitCard
        label="Jobs This Month"
        current={usage.current_jobs_this_month}
        limit={limits.max_jobs_per_month}
        isLoading={limitsLoading}
      />

      {/* Approaching Limit Warning */}
        <LimitWarningBanner
          label="Jobs This Month"
          current={usage.current_jobs_this_month}
          limit={limits.max_jobs_per_month}
          isLoading={limitsLoading}
        />

        <div className="rounded-xl border border-slate-100 bg-white/80 p-4 mt-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-slate-600">
              Use "Generate Today's Draft Routes" below to bulk-generate routes for all teams with assigned jobs today.
            </p>
          </div>
        </div>
      </div>

      {/* Schedule Health Summary — grouped */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-slate-600" />
              <div className="text-sm text-slate-600">Active Recurring Schedules</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{scheduleHealth.activeRecurring}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-slate-600" />
              <div className="text-sm text-slate-600">Jobs Scheduled (Next 7 Days)</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{scheduleHealth.scheduledNext7Days}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div className="text-sm text-slate-600">Unassigned (Next 7 Days)</div>
            </div>
            <div className="text-2xl font-bold text-amber-900">{scheduleHealth.unassignedNext7Days}</div>
          </div>
        </Card>
      </div>

      {/* Upcoming Recurring Work — secondary */}
      <Card>
        <div className="p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Upcoming Recurring Work
          </h2>
          {upcomingRecurringWork.length === 0 ? (
            <div className="text-sm text-slate-500">No recurring work due in the next 7 days</div>
          ) : (
            <div className="space-y-3">
              {upcomingRecurringWork.map(job => (
                <div key={job.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900">
                        {job.customer?.full_name || 'Unknown Customer'}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {job.services_performed || 'Recurring service'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900">
                        {job.nextScheduledDate}
                      </div>
                      <div className="text-xs text-slate-500 capitalize">
                        {job.recurrence_type}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Next 7 Days Scheduled Jobs — secondary */}
      <Card>
        <div className="p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Next 7 Days Scheduled Jobs
          </h2>
          <div className="space-y-3">
            {jobsByDate.map(({ date, jobs, unassignedCount }) => (
              <div key={date} className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-900">{date}</div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</span>
                    {unassignedCount > 0 && (
                      <span className="text-amber-600 font-medium">
                        {unassignedCount} unassigned
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Validation Summary */}
      {showValidation && validationSummary && (
        <Card>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Pre-Generation Validation</h3>
              <button
                onClick={() => setShowValidation(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-slate-700">
                <span className="font-medium">{validationSummary.teamsNeedingRoutes}</span> team{validationSummary.teamsNeedingRoutes !== 1 ? 's' : ''} need{validationSummary.teamsNeedingRoutes === 1 ? 's' : ''} routes today
              </div>
              <div className="text-slate-700">
                <span className="font-medium">{validationSummary.totalJobs}</span> total job{validationSummary.totalJobs !== 1 ? 's' : ''} assigned
              </div>
              {validationSummary.missingAddress > 0 && (
                <div className="text-amber-700">
                  <span className="font-medium">{validationSummary.missingAddress}</span> job{validationSummary.missingAddress !== 1 ? 's' : ''} missing address{validationSummary.missingAddress !== 1 ? 'es' : ''}
                </div>
              )}
              {validationSummary.missingCoords > 0 && (
                <div className="text-amber-700">
                  <span className="font-medium">{validationSummary.missingCoords}</span> job{validationSummary.missingCoords !== 1 ? 's' : ''} missing coordinates (routes will use fallback ordering)
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Today's Teams Requiring Routes — secondary */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Route className="h-5 w-5" />
              Today's Teams Requiring Routes
            </h2>
            <Button
              onClick={handleGenerateTodaysRoutes}
              disabled={generatingRoutes || loading || supportMode || billingDisabled}
              className="flex items-center gap-2"
              title={supportMode ? "Route generation is disabled in support mode" : billingDisabled ? billingReason : undefined}
            >
              <Play className="h-4 w-4" />
              {generatingRoutes ? "Generating..." : "Generate Today's Draft Routes"}
            </Button>
          </div>
          {todaysTeamsRequiringRoutes.length === 0 ? (
            <div className="text-sm text-slate-500">No teams have assigned jobs today</div>
          ) : (
            <div className="space-y-3">
              {todaysTeamsRequiringRoutes.map(team => (
                <div key={team.teamId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{team.teamName}</span>
                    {team.routeExists ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        Route exists
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                        No route
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-slate-600">
                    {team.assignedJobsCount} {team.assignedJobsCount === 1 ? 'job' : 'jobs'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Scheduling Gaps */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Scheduling Gaps
          </h2>
          {schedulingGaps.length === 0 ? (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3">
              No scheduling gaps detected for the next 7 days.
            </div>
          ) : (
            <div className="space-y-2">
              {schedulingGaps.map((gap, index) => (
                <div key={index} className="flex items-start justify-between gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2 flex-1">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-900">{gap.message}</span>
                  </div>
                  {gap.type === 'unassigned' && (
                    <Button
                      onClick={() => navigate('/admin/operations?tab=schedule')}
                      variant="secondary"
                      className="flex items-center gap-1 text-xs px-2 py-1"
                    >
                      <Users className="h-3 w-3" />
                      Assign Teams
                    </Button>
                  )}
                  {gap.type === 'missing_job' && (
                    <Button
                      onClick={() => navigate('/admin/operations?tab=automation')}
                      variant="secondary"
                      className="flex items-center gap-1 text-xs px-2 py-1"
                    >
                      <Calendar className="h-3 w-3" />
                      Generate Jobs
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      <UpgradeLimitModal
        open={showUpgradeModal}
        limitType="jobs"
        currentUsage={usage.current_jobs_this_month}
        limit={limits.max_jobs_per_month}
        plan={plan || 'starter'}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigate('/admin/billing');
        }}
        onCancel={() => setShowUpgradeModal(false)}
      />
    </div>
  );
}
