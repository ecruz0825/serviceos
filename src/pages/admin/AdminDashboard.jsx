import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import {
  Users,
  Briefcase,
  DollarSign,
  BarChart3,
  CreditCard,
  Users2,
  Settings as SettingsIcon,
  Calendar,
  Clock,
  AlertCircle,
  TrendingUp,
  UserX,
  ArrowRight,
  ExternalLink,
  Plus,
} from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import toast from "react-hot-toast";

// Date helper functions
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
};

const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Week starts on Sunday (0 = Sunday)
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
};

const endOfWeek = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day)); // End of week (Saturday)
  return d.toISOString().split('T')[0];
};

const endOfNext7Days = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
};

const daysAgo = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const startOfMonth = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.toISOString().split('T')[0];
};

const endOfMonth = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().split('T')[0];
};

export default function AdminDashboard() {
  const { effectiveCompanyId } = useUser();
  const [companyId, setCompanyId] = useState(null);
  const [kpis, setKpis] = useState({
    jobsToday: null,
    jobsThisWeek: null,
    overdueJobs: null,
    revenueThisWeek: null,
    unpaidInvoices: null, // TODO: Implement when invoice status tracking is available
    upcoming7Days: null,
    unassignedThisWeek: null,
  });
  const [financials, setFinancials] = useState({
    revenueThisMonth: null,
    paymentsReceived: null,
    expensesThisMonth: null,
    outstandingInvoices: null,
  });
  const [outstandingBalances, setOutstandingBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crewWorkload, setCrewWorkload] = useState([]);
  const [statusBreakdown, setStatusBreakdown] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [crewMembers, setCrewMembers] = useState([]); // Keep for legacy mapping
  const [overdueWindow, setOverdueWindow] = useState("30d"); // 7d, 30d, 90d, all
  const [overdueJobsData, setOverdueJobsData] = useState([]); // Store all overdue jobs for client-side filtering
  const [todaysJobs, setTodaysJobs] = useState([]);
  const [todaysJobsLoading, setTodaysJobsLoading] = useState(false);
  const navigate = useNavigate();

  // Initialize company ID from UserContext (supports support mode)
  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId);
    }
  }, [effectiveCompanyId]);

  // Fetch teams and team members
  useEffect(() => {
    if (!companyId) return;

    const fetchTeams = async () => {
      try {
        // Fetch teams
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name");

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
        } else {
          setTeams(teamsData || []);
        }

        // Fetch team members if teams exist
        if (teamsData && teamsData.length > 0) {
          const teamIds = teamsData.map(t => t.id);
          const { data: teamMembersData, error: teamMembersError } = await supabase
            .from("team_members")
            .select("*, crew_members(id, full_name)")
            .in("team_id", teamIds);

          if (teamMembersError) {
            console.error("Error fetching team members:", teamMembersError);
          } else {
            setTeamMembers(teamMembersData || []);
          }
        }
      } catch (err) {
        console.error("Unexpected error fetching teams:", err);
      }
    };

    fetchTeams();
  }, [companyId]);

  // Helper: Get team display name (worker name for single-person teams, team name for multi-person)
  const getTeamDisplayName = useMemo(() => {
    const membersByTeamId = {};
    const crewMemberByTeamId = {};

    teamMembers.forEach(tm => {
      if (!membersByTeamId[tm.team_id]) {
        membersByTeamId[tm.team_id] = 0;
      }
      membersByTeamId[tm.team_id]++;

      if (membersByTeamId[tm.team_id] === 1 && tm.crew_members) {
        crewMemberByTeamId[tm.team_id] = tm.crew_members;
      } else {
        crewMemberByTeamId[tm.team_id] = null;
      }
    });

    return (teamId) => {
      if (!teamId) return 'Unassigned';
      const team = teams.find(t => t.id === teamId);
      if (!team) return 'Unknown';

      const memberCount = membersByTeamId[teamId] || 0;
      if (memberCount === 1 && crewMemberByTeamId[teamId] && crewMemberByTeamId[teamId].full_name) {
        return crewMemberByTeamId[teamId].full_name;
      }
      return team.name;
    };
  }, [teams, teamMembers]);

  // Helper: Resolve job assignee label (with legacy fallback)
  const resolveJobAssigneeLabel = useMemo(() => {
    // Build mapping: crew_member_id -> team_id (for legacy fallback)
    const teamIdByCrewMemberId = {};
    teamMembers.forEach(tm => {
      if (tm.crew_member_id) {
        teamIdByCrewMemberId[tm.crew_member_id] = tm.team_id;
      }
    });

    // Build mapping: crew_member full_name + company_id -> team_id (for legacy fallback)
    const teamIdByCrewName = {};
    crewMembers.forEach(cm => {
      if (cm.full_name && companyId) {
        // Find team with matching name and company_id
        const matchingTeam = teams.find(t => t.company_id === companyId && t.name === cm.full_name);
        if (matchingTeam) {
          teamIdByCrewName[cm.id] = matchingTeam.id;
        }
      }
    });

    return (job) => {
      // Use assigned_team_id
      if (job.assigned_team_id) {
        return getTeamDisplayName(job.assigned_team_id);
      }

      // Unassigned
      return "Unassigned";
    };
  }, [getTeamDisplayName, teamMembers, crewMembers, teams, companyId]);

  // Fetch KPI data and breakdowns
  useEffect(() => {
    if (!companyId || teams.length === 0) return; // Wait for teams to load

    const fetchKPIs = async () => {
      setLoading(true);
      try {
        const today = startOfToday();
        const weekStart = startOfWeek();
        const weekEnd = endOfWeek();
        const next7DaysEnd = endOfNext7Days();

        // Parallel queries for all KPIs, breakdown data, and crew members
        const [
          jobsTodayResult,
          jobsThisWeekResult,
          overdueJobsResult,
          unassignedThisWeekResult,
          completedJobsThisWeekResult,
          upcoming7DaysResult,
          jobsThisWeekForBreakdown,
          crewMembersResult,
        ] = await Promise.all([
          // Jobs Today
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: false })
            .eq("company_id", companyId)
            .eq("service_date", today),

          // Jobs This Week
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: false })
            .eq("company_id", companyId)
            .gte("service_date", weekStart)
            .lte("service_date", weekEnd),

          // Overdue Jobs (service_date < today AND status NOT in [Completed, Canceled])
          // Fetch jobs with service_date < today, then filter client-side
          // We'll apply the window filter client-side based on overdueWindow state
          supabase
            .from("jobs")
            .select("id, status, service_date")
            .eq("company_id", companyId)
            .lt("service_date", today),

          // Unassigned Jobs This Week (assigned_team_id must be null)
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: false })
            .eq("company_id", companyId)
            .is("assigned_team_id", null)
            .gte("service_date", weekStart)
            .lte("service_date", weekEnd),

          // Completed Jobs This Week (for revenue calculation)
          supabase
            .from("jobs")
            .select("job_cost")
            .eq("company_id", companyId)
            .eq("status", "Completed")
            .gte("service_date", weekStart)
            .lte("service_date", weekEnd),

          // Upcoming 7 Days
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: false })
            .eq("company_id", companyId)
            .gte("service_date", today)
            .lte("service_date", next7DaysEnd),

          // Jobs This Week for breakdowns (team workload + status)
          supabase
            .from("jobs")
            .select("id, status, assigned_team_id")
            .eq("company_id", companyId)
            .gte("service_date", weekStart)
            .lte("service_date", weekEnd),

          // Crew members for workload names
          supabase
            .from("crew_members")
            .select("id, full_name")
            .eq("company_id", companyId),
        ]);

        // Calculate revenue from completed jobs this week
        const revenueThisWeek = (completedJobsThisWeekResult.data || []).reduce(
          (sum, job) => sum + (Number(job.job_cost) || 0),
          0
        );

        // Store overdue jobs data for client-side filtering
        const allOverdueJobs = (overdueJobsResult.data || []).filter(
          (job) => job.status !== "Completed" && job.status !== "Canceled"
        );
        setOverdueJobsData(allOverdueJobs);

        // Calculate overdue count based on current window
        const overdueCount = calculateOverdueCount(allOverdueJobs, overdueWindow);

        setKpis({
          jobsToday: jobsTodayResult.count || 0,
          jobsThisWeek: jobsThisWeekResult.count || 0,
          overdueJobs: overdueCount,
          revenueThisWeek,
          unpaidInvoices: null, // TODO: Implement when invoice status tracking is available
          upcoming7Days: upcoming7DaysResult.count || 0,
          unassignedThisWeek: unassignedThisWeekResult.count || 0,
        });

        // Store crew members (for legacy mapping)
        const crewData = crewMembersResult.data || [];
        setCrewMembers(crewData);

        // Build helper maps for resolving assignee labels
        const membersByTeamId = {};
        const crewMemberByTeamId = {};
        teamMembers.forEach(tm => {
          if (!membersByTeamId[tm.team_id]) {
            membersByTeamId[tm.team_id] = 0;
          }
          membersByTeamId[tm.team_id]++;
          if (membersByTeamId[tm.team_id] === 1 && tm.crew_members) {
            crewMemberByTeamId[tm.team_id] = tm.crew_members;
          } else {
            crewMemberByTeamId[tm.team_id] = null;
          }
        });

        const getTeamDisplayNameLocal = (teamId) => {
          if (!teamId) return 'Unassigned';
          const team = teams.find(t => t.id === teamId);
          if (!team) return 'Unknown';
          const memberCount = membersByTeamId[teamId] || 0;
          if (memberCount === 1 && crewMemberByTeamId[teamId] && crewMemberByTeamId[teamId].full_name) {
            return crewMemberByTeamId[teamId].full_name;
          }
          return team.name;
        };

        // Build mapping: crew_member_id -> team_id (for legacy fallback)
        const teamIdByCrewMemberId = {};
        teamMembers.forEach(tm => {
          if (tm.crew_member_id) {
            teamIdByCrewMemberId[tm.crew_member_id] = tm.team_id;
          }
        });

        // Build mapping: crew_member full_name + company_id -> team_id (for legacy fallback)
        const teamIdByCrewName = {};
        crewData.forEach(cm => {
          if (cm.full_name && companyId) {
            const matchingTeam = teams.find(t => t.company_id === companyId && t.name === cm.full_name);
            if (matchingTeam) {
              teamIdByCrewName[cm.id] = matchingTeam.id;
            }
          }
        });

        // Helper to resolve job assignee label
        const resolveJobAssigneeLabelLocal = (job) => {
          // Primary: use assigned_team_id
          if (job.assigned_team_id) {
            return getTeamDisplayNameLocal(job.assigned_team_id);
          }

          // Unassigned
          return "Unassigned";
        };

        // Compute team workload breakdown
        const jobsForBreakdown = jobsThisWeekForBreakdown.data || [];
        const workloadMap = {};
        jobsForBreakdown.forEach((job) => {
          // Resolve assignee label using local helper
          const assigneeLabel = resolveJobAssigneeLabelLocal(job);
          if (!workloadMap[assigneeLabel]) {
            workloadMap[assigneeLabel] = 0;
          }
          workloadMap[assigneeLabel]++;
        });

        const workloadArray = Object.entries(workloadMap).map(([label, count]) => ({
          label,
          count,
        }));

        // Sort: "Unassigned" first, then alphabetical
        workloadArray.sort((a, b) => {
          if (a.label === "Unassigned") return -1;
          if (b.label === "Unassigned") return 1;
          return a.label.localeCompare(b.label);
        });
        setCrewWorkload(workloadArray);

        // Compute status breakdown
        const statusMap = {};
        jobsForBreakdown.forEach((job) => {
          const status = job.status || "Pending";
          if (!statusMap[status]) {
            statusMap[status] = 0;
          }
          statusMap[status]++;
        });

        // Build status breakdown array - always include standard statuses
        const standardStatuses = ["Pending", "In Progress", "Completed", "Canceled"];
        const statusArray = standardStatuses.map((status) => ({
          status,
          count: statusMap[status] || 0,
        }));

        // Add any other statuses found (not in standard list)
        Object.entries(statusMap).forEach(([status, count]) => {
          if (!standardStatuses.includes(status)) {
            statusArray.push({ status, count });
          }
        });

        // Sort non-standard statuses alphabetically
        const standardCount = standardStatuses.length;
        const standardStatusesArray = statusArray.slice(0, standardCount);
        const otherStatusesArray = statusArray.slice(standardCount);
        otherStatusesArray.sort((a, b) => a.status.localeCompare(b.status));

        setStatusBreakdown([...standardStatusesArray, ...otherStatusesArray]);
      } catch (error) {
        console.error("Error fetching KPIs:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchKPIs();
  }, [companyId, teams, teamMembers]);

  // Fetch financial data
  useEffect(() => {
    if (!companyId) return;

    const fetchFinancials = async () => {
      try {
        const monthStart = startOfMonth();
        const monthEnd = endOfMonth();

        // Fetch completed jobs this month (for revenue calculation)
        const { data: completedJobsData } = await supabase
          .from("jobs")
          .select("job_cost")
          .eq("company_id", companyId)
          .eq("status", "Completed")
          .gte("service_date", monthStart)
          .lte("service_date", monthEnd);

        // Fetch payments this month (non-voided, posted)
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("amount, status, voided_at")
          .eq("company_id", companyId)
          .gte("paid_at", monthStart)
          .lte("paid_at", monthEnd);

        // Fetch expenses this month
        const { data: expensesData } = await supabase
          .from("expenses")
          .select("amount")
          .eq("company_id", companyId)
          .gte("date", monthStart)
          .lte("date", monthEnd);

        // Fetch jobs with customer info to calculate outstanding invoices and balances
        const { data: jobsData } = await supabase
          .from("jobs")
          .select("id, job_cost, company_id, customer_id, services_performed")
          .eq("company_id", companyId);

        // Calculate revenue from completed jobs this month
        const revenueThisMonth = (completedJobsData || [])
          .reduce((sum, job) => sum + (Number(job.job_cost) || 0), 0);

        // Calculate payments received (non-voided, posted payments)
        const paymentsReceived = (paymentsData || [])
          .filter(p => p.status === 'posted' && !p.voided_at)
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        // Calculate expenses this month
        const expensesThisMonth = (expensesData || [])
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        // Calculate outstanding invoices and balances
        let outstandingInvoices = 0;
        let balancesList = [];
        
        if (jobsData && jobsData.length > 0) {
          const jobIds = jobsData.map(j => j.id);
          
          // Fetch all payments for these jobs
          const { data: allPaymentsData } = await supabase
            .from("payments")
            .select("job_id, amount, status, voided_at")
            .eq("company_id", companyId)
            .in("job_id", jobIds);

          // Fetch customers for customer names
          const customerIds = [...new Set(jobsData.map(j => j.customer_id).filter(Boolean))];
          const { data: customersData } = await supabase
            .from("customers")
            .select("id, full_name")
            .eq("company_id", companyId)
            .in("id", customerIds);

          // Build customer lookup map
          const customersById = {};
          (customersData || []).forEach(c => {
            customersById[c.id] = c.full_name || 'Unknown Customer';
          });

          // Group payments by job_id
          const paymentsByJob = {};
          (allPaymentsData || [])
            .filter(p => p.status === 'posted' && !p.voided_at)
            .forEach(p => {
              if (!paymentsByJob[p.job_id]) {
                paymentsByJob[p.job_id] = 0;
              }
              paymentsByJob[p.job_id] += Number(p.amount) || 0;
            });

          // Calculate outstanding for each job and build balances list
          jobsData.forEach(job => {
            const jobCost = Number(job.job_cost) || 0;
            const paid = paymentsByJob[job.id] || 0;
            const outstanding = Math.max(0, jobCost - paid);
            
            outstandingInvoices += outstanding;
            
            // Only include jobs with outstanding balance
            if (outstanding > 0 && job.customer_id) {
              balancesList.push({
                customerId: job.customer_id,
                customerName: customersById[job.customer_id] || 'Unknown Customer',
                jobId: job.id,
                jobDescription: job.services_performed || 'Job',
                balance: outstanding,
              });
            }
          });

          // Sort by balance descending and take top 5
          balancesList.sort((a, b) => b.balance - a.balance);
          balancesList = balancesList.slice(0, 5);
        }

        setFinancials({
          revenueThisMonth,
          paymentsReceived,
          expensesThisMonth,
          outstandingInvoices,
        });
        setOutstandingBalances(balancesList);
      } catch (error) {
        console.error("Error fetching financials:", error);
        // Don't show toast for financials - it's supplementary data
      }
    };

    fetchFinancials();
  }, [companyId]);

  // Recalculate overdue count when window changes
  useEffect(() => {
    if (overdueJobsData.length > 0) {
      const newCount = calculateOverdueCount(overdueJobsData, overdueWindow);
      setKpis((prev) => ({ ...prev, overdueJobs: newCount }));
    }
  }, [overdueWindow, overdueJobsData]);

  // Fetch today's jobs for schedule preview
  useEffect(() => {
    if (!companyId) return;

    const fetchTodaysJobs = async () => {
      setTodaysJobsLoading(true);
      try {
        const today = startOfToday();
        const { data, error } = await supabase
          .from("jobs")
          .select("id, service_date, services_performed, customer_id, customers(full_name)")
          .eq("company_id", companyId)
          .eq("service_date", today)
          .order("service_date", { ascending: true })
          .limit(6); // Fetch 6 to check if there are more than 5

        if (error) {
          console.error("Error fetching today's jobs:", error);
          setTodaysJobs([]);
          return;
        }

        setTodaysJobs(data || []);
      } catch (err) {
        console.error("Unexpected error fetching today's jobs:", err);
        setTodaysJobs([]);
      } finally {
        setTodaysJobsLoading(false);
      }
    };

    fetchTodaysJobs();
  }, [companyId]);

  // Helper function to calculate overdue count based on window
  const calculateOverdueCount = (jobs, window) => {
    if (window === "all") {
      return jobs.length;
    }

    const today = startOfToday();
    let windowStart;
    if (window === "7d") {
      windowStart = daysAgo(7);
    } else if (window === "30d") {
      windowStart = daysAgo(30);
    } else if (window === "90d") {
      windowStart = daysAgo(90);
    } else {
      windowStart = daysAgo(30); // default
    }

    return jobs.filter((job) => {
      const serviceDate = job.service_date;
      return serviceDate >= windowStart && serviceDate < today;
    }).length;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "—";
      // Check if it's a full datetime or just a date
      const hasTime = dateString.includes("T") && dateString.includes(":");
      if (hasTime) {
        return date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      }
      // If it's just a date, return "All day" or similar
      return "All day";
    } catch {
      return "—";
    }
  };

  const KPICard = ({ label, value, helperText, icon: Icon, iconColor = "text-green-600", onClick }) => (
    <Card clickable={!!onClick} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-600 mb-1 truncate">{label}</p>
          <p
            className="text-2xl sm:text-3xl font-bold mb-1 break-words"
            style={{ color: "var(--brand-secondary, var(--brand-primary))" }}
          >
            {loading || value === null ? "—" : value}
          </p>
          {helperText && (
            <div className="text-xs text-slate-500 mt-1">
              {typeof helperText === "string" ? helperText : helperText}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={`${iconColor} opacity-80`}>
              <Icon className="w-8 h-8" />
            </div>
          )}
          {onClick && (
            <ArrowRight className="w-4 h-4 text-slate-400 opacity-60" />
          )}
        </div>
      </div>
    </Card>
  );

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Admin Dashboard" 
        subtitle="Overview of company activity" 
      />

      {/* Greeting / Context Line */}
      <div className="text-sm text-slate-600 -mt-2">
        {getGreeting()} — here's what needs attention today.
      </div>

      {/* Quick Action Bar */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => navigate("/admin/jobs")}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Job
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/admin/payments")}
            className="flex items-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            Record Payment
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/admin/customers")}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
        </div>
      </section>

      {/* Attention Needed Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Attention Needed</h2>
        <p className="text-sm text-slate-500 mb-4">Quick actions based on current workload</p>
        <Card>
          {(() => {
            const attentionItems = [
              {
                icon: AlertCircle,
                iconColor: "text-red-600",
                bgColor: "bg-red-50",
                borderColor: "border-red-200",
                label: "Overdue Jobs",
                helper: "Past due date, not completed",
                count: kpis.overdueJobs || 0,
                action: "View overdue",
                onClick: () => {
                  navigate("/admin/jobs?filter=overdue");
                },
              },
              {
                icon: UserX,
                iconColor: "text-amber-600",
                bgColor: "bg-amber-50",
                borderColor: "border-amber-200",
                label: "Unassigned Jobs",
                helper: "Needs assignment",
                count: kpis.unassignedThisWeek || 0,
                action: "Assign now",
                onClick: () => {
                  navigate("/admin/jobs?quickFilter=unassigned");
                },
              },
              {
                icon: Calendar,
                iconColor: "text-blue-600",
                bgColor: "bg-blue-50",
                borderColor: "border-blue-200",
                label: "Jobs Today",
                helper: "Scheduled for today",
                count: kpis.jobsToday || 0,
                action: "View today",
                onClick: () => {
                  navigate("/admin/operations?tab=today");
                },
              },
              {
                icon: Clock,
                iconColor: "text-purple-600",
                bgColor: "bg-purple-50",
                borderColor: "border-purple-200",
                label: "Upcoming Jobs",
                helper: "Next week's schedule",
                count: kpis.upcoming7Days || 0,
                action: "Open schedule",
                onClick: () => {
                  navigate("/admin/operations?tab=schedule");
                },
              },
            ];

            const totalCount = attentionItems.reduce((sum, item) => sum + item.count, 0);

            if (loading) {
              return (
                <div className="p-8 text-center">
                  <div className="inline-block animate-pulse text-slate-400">Loading attention items...</div>
                </div>
              );
            }

            if (totalCount === 0) {
              return (
                <div className="p-8 text-center">
                  <p className="text-slate-700 font-medium text-base">All caught up!</p>
                  <p className="text-sm text-slate-500 mt-1">No items requiring attention at this time.</p>
                </div>
              );
            }

            return (
              <div className="divide-y divide-slate-200">
                {attentionItems.map((item, index) => {
                  const Icon = item.icon;
                  const hasCount = item.count > 0;
                  return (
                    <div
                      key={index}
                      className={`py-5 px-5 flex flex-col sm:flex-row sm:items-center items-start justify-between gap-3 transition-all ${
                        hasCount 
                          ? `${item.bgColor} border-l-4 ${item.borderColor} hover:shadow-sm` 
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                        <div className={`${item.iconColor} ${hasCount ? "opacity-100" : "opacity-60"}`}>
                          <Icon className={`${hasCount ? "w-6 h-6" : "w-5 h-5"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`${hasCount ? "text-base font-semibold text-slate-900" : "text-sm font-medium text-slate-700"} break-words`}>
                            {item.label}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 break-words">
                            {item.helper}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap justify-end w-full sm:w-auto">
                        <span className={`${hasCount ? "text-2xl font-bold" : "text-lg font-semibold"} text-slate-900 min-w-[3rem] text-right`}>
                          {item.count}
                        </span>
                        {hasCount && (
                          <button
                            onClick={item.onClick}
                            className="btn-accent px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 w-full sm:w-auto"
                          >
                            {item.action}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Card>
      </section>

      {/* Today's Schedule Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Today's Schedule</h2>
          {todaysJobs.length > 5 && (
            <button
              onClick={() => navigate("/admin/operations?tab=today")}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <span>View full schedule</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Card>
          {todaysJobsLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-pulse text-slate-400">Loading today's schedule...</div>
            </div>
          ) : todaysJobs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-600 font-medium">No jobs scheduled today.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200">
                {todaysJobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="py-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-16 text-sm font-medium text-slate-600">
                        {formatTime(job.service_date)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {job.customers?.full_name || "Unknown Customer"}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {job.services_performed || "Job"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {todaysJobs.length > 5 && (
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
                  <button
                    onClick={() => navigate("/admin/operations?tab=today")}
                    className="text-sm text-slate-600 hover:text-slate-900 transition-colors w-full text-center"
                  >
                    View all {todaysJobs.length} jobs scheduled today
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </section>

      {/* Financial Summary Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Financial Summary</h2>
          <button
            onClick={() => navigate("/admin/revenue-hub")}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span>Open Revenue Hub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard
            label="Completed Job Value"
            value={financials.revenueThisMonth !== null ? formatCurrency(financials.revenueThisMonth) : null}
            helperText="This month"
            icon={TrendingUp}
            iconColor="text-green-600"
            onClick={() => navigate("/admin/revenue-hub")}
          />
          <KPICard
            label="Payments Received"
            value={financials.paymentsReceived !== null ? formatCurrency(financials.paymentsReceived) : null}
            helperText="This month"
            icon={CreditCard}
            iconColor="text-blue-600"
            onClick={() => navigate("/admin/payments")}
          />
          <KPICard
            label="Expenses"
            value={financials.expensesThisMonth !== null ? formatCurrency(financials.expensesThisMonth) : null}
            helperText="This month"
            icon={DollarSign}
            iconColor="text-amber-600"
            onClick={() => navigate("/admin/expenses")}
          />
          <KPICard
            label="Outstanding Invoices"
            value={financials.outstandingInvoices !== null ? formatCurrency(financials.outstandingInvoices) : null}
            helperText="Unpaid balances"
            icon={AlertCircle}
            iconColor="text-red-600"
            onClick={() => navigate("/admin/revenue-hub")}
          />
        </div>
      </section>

      {/* Outstanding Balances Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Outstanding Balances</h2>
          <button
            onClick={() => navigate("/admin/revenue-hub")}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span>View All in Revenue Hub</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <Card>
          {outstandingBalances.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-600 font-medium">No outstanding balances right now.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200">
                {outstandingBalances.map((item, index) => (
                  <div
                    key={`${item.customerId}-${item.jobId}`}
                    className="py-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.customerName}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {item.jobDescription}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(item.balance)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-500 text-center">
                  Showing top 5 outstanding balances
                </p>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* KPI Cards - Overview Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
          <KPICard
            label="Jobs This Week"
            value={kpis.jobsThisWeek}
            helperText="Scheduled this week"
            icon={Briefcase}
            iconColor="text-green-600"
          />
          <KPICard
            label="Revenue This Week"
            value={kpis.revenueThisWeek !== null ? formatCurrency(kpis.revenueThisWeek) : null}
            helperText="From completed jobs"
            icon={TrendingUp}
            iconColor="text-green-600"
          />
        </div>
      </section>

      {/* Workload Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Workload (This Week)</h2>
        <Card>
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-pulse text-slate-400">Loading workload...</div>
            </div>
          ) : crewWorkload.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No workload assigned this week"
              description="Assign jobs to teams in Schedule or create new jobs to get started."
              actionLabel="Go to Schedule"
              onAction={() => navigate('/admin/operations?tab=schedule')}
            />
          ) : (
            <div className="divide-y divide-slate-200">
              {crewWorkload.map((item, index) => (
                <div
                  key={item.label || "unassigned"}
                  className="py-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-900">
                      {item.count}
                    </span>
                    <span className="text-xs text-slate-500">
                      {item.count === 1 ? "job" : "jobs"} assigned
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Jobs by Status Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Jobs by Status (This Week)</h2>
        <Card>
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-pulse text-slate-400">Loading status breakdown...</div>
            </div>
          ) : statusBreakdown.length === 0 || statusBreakdown.every(item => item.count === 0) ? (
            <EmptyState
              icon={Briefcase}
              title="No jobs this week"
              description="Create your first job or schedule recurring work to see activity here."
              actionLabel="Create Job"
              onAction={() => navigate('/admin/jobs')}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {statusBreakdown.map((item) => {
                // Status color mapping
                const statusColors = {
                  Pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                  "In Progress": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                  Completed: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
                  Canceled: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
                };
                const baseColors = statusColors[item.status] || {
                  bg: "bg-slate-50",
                  text: "text-slate-700",
                  border: "border-slate-200",
                };
                
                // Make 0-count cards more muted
                const isZero = item.count === 0;
                const colorClass = isZero
                  ? "bg-slate-50 text-slate-400 border-slate-200"
                  : `${baseColors.bg} ${baseColors.text} ${baseColors.border}`;

                return (
                  <div
                    key={item.status}
                    className={`border rounded-lg p-4 ${colorClass} transition-colors ${!isZero ? "hover:shadow-sm" : "opacity-60"}`}
                  >
                    <p className={`text-xs font-medium mb-1 ${isZero ? "opacity-60" : "opacity-80"}`}>
                      {item.status}
                    </p>
                    <p className={`text-2xl font-bold ${isZero ? "opacity-50" : ""}`}>{item.count}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* Recent Activity Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h2>
        <Card>
          <div className="max-h-80 overflow-y-auto">
            {(() => {
              // Placeholder: Replace with actual activity data when available
              const recentActivity = [];

              if (recentActivity.length === 0) {
                return (
                  <EmptyState
                    icon={Clock}
                    title="No recent activity"
                    description="Activity from jobs, payments, and invoices will appear here as you use the system."
                    actionLabel="View Jobs"
                    onAction={() => navigate('/admin/jobs')}
                  />
                );
              }

              return (
                <div className="divide-y divide-slate-100">
                  {recentActivity.map((activity, index) => (
                    <div
                      key={index}
                      className="py-2.5 px-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 leading-snug">
                            {activity.message || "Activity item"}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {activity.timestamp || "Just now"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </Card>
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card clickable onClick={() => navigate("/admin/settings")} style={{ borderTop: "3px solid var(--brand-accent, var(--brand-primary))" }}>
          <SettingsIcon className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
          <h2 className="text-xl font-bold">Settings</h2>
          <p>Branding, timezone, and contact info</p>
        </Card>

        <Card clickable onClick={() => navigate("/admin/jobs")} style={{ borderTop: "3px solid var(--brand-accent, var(--brand-primary))" }}>
          <Briefcase className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
          <h2 className="text-xl font-bold">Jobs</h2>
          <p>Manage and assign jobs to workers</p>
        </Card>

        <Card clickable onClick={() => navigate("/admin/customers")} style={{ borderTop: "3px solid var(--brand-accent, var(--brand-primary))" }}>
          <Users className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
          <h2 className="text-xl font-bold">Customers</h2>
          <p>Manage customer accounts and details</p>
        </Card>

        <Card clickable onClick={() => navigate("/admin/crew")} style={{ borderTop: "3px solid var(--brand-accent, var(--brand-primary))" }}>
          <Users2 className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
          <h2 className="text-xl font-bold">Workers</h2>
          <p>Manage workers and roles</p>
        </Card>

        {false && (
          <Card clickable onClick={() => navigate("/admin/reports")}>
            <BarChart3 className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
            <h2 className="text-xl font-bold">Reports</h2>
            <p>View performance, revenue, and stats</p>
          </Card>
        )}

        <Card clickable onClick={() => navigate("/admin/payments")} style={{ borderTop: "3px solid var(--brand-accent, var(--brand-primary))" }}>
          <CreditCard className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
          <h2 className="text-xl font-bold">Payments</h2>
          <p>Track and manage payments</p>
        </Card>

        <Card clickable onClick={() => navigate("/admin/operations?tab=schedule")} style={{ borderTop: "3px solid var(--brand-accent, var(--brand-primary))" }}>
          <Calendar className="w-10 h-10 mb-3" style={{ color: "var(--brand-secondary, var(--brand-primary))" }} />
          <h2 className="text-xl font-bold">Schedule</h2>
          <p>Plan and manage upcoming work</p>
        </Card>
        </div>
      </section>
    </div>
  );
}