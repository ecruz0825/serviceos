import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "../../supabaseClient";
import toast from "react-hot-toast";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";
import { Calendar, Repeat, PauseCircle } from "lucide-react";

// Next scheduled date: uses last_generated_date + frequency when set, else start_date.
// Returns YYYY-MM-DD or "" for form preview / null for table when invalid.
function getNextScheduledDate(startDateStr, recurrenceType, lastGeneratedDate) {
  if (!startDateStr || !recurrenceType) return "";
  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const base = lastGeneratedDate ? new Date(lastGeneratedDate) : new Date(startDate);
  base.setHours(0, 0, 0, 0);
  let next = new Date(base.getTime());

  while (next <= today) {
    if (recurrenceType === "weekly") next.setDate(next.getDate() + 7);
    else if (recurrenceType === "biweekly") next.setDate(next.getDate() + 14);
    else if (recurrenceType === "monthly") next.setMonth(next.getMonth() + 1);
    else return "";
  }

  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function humanizeFrequency(type) {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function RecurringJobsAdmin() {
  const [customers, setCustomers] = useState([]);
  const [recurringJobs, setRecurringJobs] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [recurrenceType, setRecurrenceType] = useState("");
  const [servicesPerformed, setServicesPerformed] = useState("");
  const [jobCost, setJobCost] = useState("");
  const [nextScheduledPreview, setNextScheduledPreview] = useState("");
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [defaultTeamId, setDefaultTeamId] = useState("");
  const customerSelectRef = useRef(null);
  const createCardRef = useRef(null);




  // Get user's company_id from profiles table
  async function getCompanyId() {
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userData.user.id)
      .single();

    if (error) {
      toast.error("Failed to get company ID");
      console.error(error);
      return null;
    }

    return profile.company_id;
  }

  // Fetch customers
  useEffect(() => {
    const fetchCustomers = async () => {
      const company_id = await getCompanyId();
      if (!company_id) return;

      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", company_id);

      if (error) {
        console.error(error);
      } else {
        setCustomers(data);
      }
    };

    fetchCustomers();
  }, []);

  // Fetch teams and team members
  useEffect(() => {
    const fetchTeams = async () => {
      const company_id = await getCompanyId();
      if (!company_id) return;

      // Fetch teams
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("company_id", company_id)
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
    };

    fetchTeams();
  }, []);

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
      if (!team) return 'Unassigned';

      const memberCount = membersByTeamId[teamId] || 0;
      if (memberCount === 1 && crewMemberByTeamId[teamId] && crewMemberByTeamId[teamId].full_name) {
        return crewMemberByTeamId[teamId].full_name;
      }
      return team.name;
    };
  }, [teams, teamMembers]);


  // Fetch recurring jobs
  useEffect(() => {
    const fetchRecurringJobs = async () => {
      const company_id = await getCompanyId();
      if (!company_id) return;

      const { data, error } = await supabase
        .from("recurring_jobs")
        .select("*, customers(full_name)")
        .eq("company_id", company_id)
        .order("start_date", { ascending: true });

      if (error) {
        console.error(error);
      } else {
        setRecurringJobs(data);
      }
    };

    fetchRecurringJobs();
  }, []);

  // Summary counts for cards
  const summary = useMemo(() => ({
    total: recurringJobs.length,
    active: recurringJobs.filter((j) => !j.is_paused).length,
    paused: recurringJobs.filter((j) => j.is_paused).length,
  }), [recurringJobs]);

  // Live preview: next scheduled for the form (no last_generated_date yet)
  useEffect(() => {
    setNextScheduledPreview(getNextScheduledDate(startDate, recurrenceType, null));
  }, [startDate, recurrenceType]);

  // Add recurring job
  const handleAddRecurringJob = async () => {
    if (!customerId || !startDate || !recurrenceType || !servicesPerformed || !jobCost) {
      toast.error("Please fill in all fields.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const company_id = await getCompanyId();
    if (!company_id) return;

    const { error } = await supabase.from("recurring_jobs").insert([
  {
    customer_id: customerId,
    company_id,
    start_date: startDate,
    recurrence_type: recurrenceType,
    services_performed: servicesPerformed,
    job_cost: parseFloat(jobCost),
    created_by: user.id,
    last_generated_date: null,
    is_paused: false,
    default_team_id: defaultTeamId || null,
  },
]);

    if (error) {
      toast.error("Failed to add recurring job.");
      console.error(error);
    } else {
      toast.success("Recurring job added!");
      setCustomerId("");
      setStartDate("");
      setRecurrenceType("");
      setServicesPerformed("");
      setJobCost("");
      setNextScheduledPreview("");
      setDefaultTeamId("");
      // Refresh job list
      const { data } = await supabase
        .from("recurring_jobs")
        .select("*, customers(full_name)")
        .eq("company_id", company_id);
      setRecurringJobs(data);
    }
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from("recurring_jobs").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete job");
    } else {
      toast.success("Job deleted");
      setRecurringJobs((prev) => prev.filter((j) => j.id !== id));
    }
  };

  const handleTogglePause = async (job) => {
    const { error } = await supabase
      .from("recurring_jobs")
      .update({ is_paused: !job.is_paused })
      .eq("id", job.id);

    if (error) {
      toast.error("Failed to update job status");
    } else {
      toast.success(`Job ${job.is_paused ? "resumed" : "paused"}`);
      setRecurringJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, is_paused: !j.is_paused } : j))
      );
    }
  };

  const focusCreateForm = () => {
    createCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => customerSelectRef.current?.focus(), 300);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring Jobs"
        subtitle="Create schedules and automatically generate upcoming jobs."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-slate-600" />
              <div className="text-sm text-slate-600">Total Schedules</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.total}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-5 w-5 text-slate-600" />
              <div className="text-sm text-slate-600">Active</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.active}</div>
          </div>
        </Card>
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <PauseCircle className="h-5 w-5 text-slate-600" />
              <div className="text-sm text-slate-600">Paused</div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.paused}</div>
          </div>
        </Card>
      </div>

      <div ref={createCardRef}>
        <Card>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Create Recurring Job</h2>

        {/* Schedule */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Schedule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
              <select
                ref={customerSelectRef}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Choose a customer</option>
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              <p className="mt-1 text-xs text-slate-500">First day this job will be performed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
              <select
                value={recurrenceType}
                onChange={(e) => setRecurrenceType(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Choose frequency</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">How often the job repeats</p>
            </div>
          </div>
        </div>

        {/* Service Details */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Service Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Services</label>
              <input
                type="text"
                value={servicesPerformed}
                onChange={(e) => setServicesPerformed(e.target.value)}
                placeholder="e.g. Mow, Edge, Blow"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Job Cost ($)</label>
              <input
                type="number"
                value={jobCost}
                onChange={(e) => setJobCost(e.target.value)}
                placeholder="e.g. 45.00"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        </div>

        {/* Assignment */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Assignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Team (optional)</label>
              <select
                value={defaultTeamId}
                onChange={(e) => setDefaultTeamId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Unassigned</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {getTeamDisplayName(team.id)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Default team for generated jobs</p>
            </div>
          </div>
        </div>

        {nextScheduledPreview && (
          <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-sm text-slate-700">
              <span className="font-medium">Next scheduled job:</span>{" "}
              <span className="text-slate-900">{nextScheduledPreview}</span>
            </p>
          </div>
        )}

        <Button
          onClick={handleAddRecurringJob}
          variant="primary"
          className="px-4 py-2"
        >
          Add Recurring Job
        </Button>
        </Card>
      </div>

      {recurringJobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Calendar}
            title="No recurring jobs yet"
            description="Create recurring job schedules to automatically generate upcoming work. Set frequency, start date, and default team assignment."
            actionLabel="Create Recurring Job"
            onAction={focusCreateForm}
          />
        </Card>
      ) : (
        <Card>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Recurring Jobs ({recurringJobs.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-slate-100 text-left text-sm font-semibold text-slate-700">
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Start Date</th>
                  <th className="px-3 py-2.5">Next Scheduled</th>
                  <th className="px-3 py-2.5">Frequency</th>
                  <th className="px-3 py-2.5">Team</th>
                  <th className="px-3 py-2.5">Services</th>
                  <th className="px-3 py-2.5">Cost</th>
                  <th className="px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recurringJobs.map((job, index) => {
                  const nextDate = getNextScheduledDate(
                    job.start_date,
                    job.recurrence_type,
                    job.last_generated_date
                  );
                  return (
                    <tr
                      key={job.id}
                      className={`border-t border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors ${
                        index % 2 === 1 ? "bg-slate-50/50" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-900">{job.customers?.full_name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={job.is_paused ? "neutral" : "success"}>
                          {job.is_paused ? "Paused" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">{job.start_date}</td>
                      <td className="px-3 py-2.5">{nextDate || "—"}</td>
                      <td className="px-3 py-2.5">{humanizeFrequency(job.recurrence_type)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{getTeamDisplayName(job.default_team_id)}</td>
                      <td className="px-3 py-2.5">{job.services_performed}</td>
                      <td className="px-3 py-2.5">${Number(job.job_cost).toFixed(2)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={() => handleTogglePause(job)}
                            variant="secondary"
                            className="text-xs"
                          >
                            {job.is_paused ? "Resume" : "Pause"}
                          </Button>
                          <span className="text-slate-300">|</span>
                          <Button
                            onClick={() => handleDelete(job.id)}
                            variant="danger"
                            className="text-xs"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}