import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import JobsNeedingSchedulingTable from '../../components/schedule/JobsNeedingSchedulingTable';
import DateSchedulingModal from '../../components/schedule/DateSchedulingModal';
import useCompanySettings from '../../hooks/useCompanySettings';

export default function JobsNeedsScheduling() {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const crewLabel = settings?.crew_label || "Crew";
  const customerLabel = settings?.customer_label || "Customer";

  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [teams, setTeams] = useState([]);
  
  // Action states
  const [assigningJobId, setAssigningJobId] = useState(null);
  const [schedulingJobId, setSchedulingJobId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  // Initialize company ID
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
      }
    };
    init();
  }, []);

  // Fetch data
  useEffect(() => {
    if (!companyId) return;
    fetchData();
  }, [companyId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Step 1: Fetch jobs needing scheduling (matches RevenueHub logic)
      // Filter: service_date IS NULL AND status NOT IN ('Completed', 'Canceled')
      const { data: allJobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, customer_id, service_date, scheduled_end_date, services_performed, status, assigned_team_id, created_at')
        .eq('company_id', companyId)
        .is('service_date', null)
        .order('created_at', { ascending: true });

      // Filter out completed/cancelled jobs (matches RevenueHub normalization)
      const jobsData = (allJobsData || []).filter(j => {
        const status = (j.status || '').toLowerCase();
        const isCompleted = status === 'completed' || status === 'done' || status === 'canceled' || status === 'cancelled';
        return !isCompleted;
      });

      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        toast.error('Failed to load jobs');
        setJobs([]);
      } else {
        setJobs(jobsData || []);
      }

      if (!jobsData || jobsData.length === 0) {
        setQuotes([]);
        setCustomers([]);
        setTeams([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch quotes for jobs that have converted_job_id (optional enrichment)
      // Get job IDs that might have associated quotes
      const jobIds = (jobsData || []).map(j => j.id);
      
      const { data: quotesData, error: quotesError } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_id, converted_job_id, services, total')
        .eq('company_id', companyId)
        .in('converted_job_id', jobIds);

      if (quotesError) {
        console.error('Error fetching quotes:', quotesError);
        // Non-critical - quotes are optional enrichment
        setQuotes([]);
      } else {
        setQuotes(quotesData || []);
      }

      // Step 3: Fetch customers
      const customerIds = [...new Set([
        ...(quotesData || []).map(q => q.customer_id),
        ...(jobsData || []).map(j => j.customer_id)
      ].filter(Boolean))];

      if (customerIds.length > 0) {
        const { data: customersData, error: customersError } = await supabase
          .from('customers')
          .select('id, full_name, email')
          .in('id', customerIds);

        if (customersError) {
          console.error('Error fetching customers:', customersError);
        } else {
          setCustomers(customersData || []);
        }
      }

      // Step 4: Fetch teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
      } else {
        setTeams(teamsData || []);
      }
    } catch (err) {
      console.error('Unexpected error loading data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Merge quotes and jobs in memory
  const mergedData = useMemo(() => {
    if (!jobs.length) return [];

    const quotesByJobId = {};
    quotes.forEach(q => {
      if (q.converted_job_id) {
        quotesByJobId[q.converted_job_id] = q;
      }
    });

    const customersById = {};
    customers.forEach(c => {
      customersById[c.id] = c;
    });

    return jobs.map(job => {
      const quote = quotesByJobId[job.id];
      const customer = customersById[job.customer_id] || customersById[quote?.customer_id];

      // Format services summary from quote.services (JSONB) or job.services_performed
      let servicesSummary = job.services_performed || '';
      if (quote?.services) {
        try {
          const servicesArray = Array.isArray(quote.services) 
            ? quote.services 
            : JSON.parse(quote.services);
          
          if (Array.isArray(servicesArray) && servicesArray.length > 0) {
            const serviceNames = servicesArray
              .map(s => s.name || s.service || s)
              .filter(Boolean)
              .slice(0, 3)
              .join(', ');
            if (serviceNames) {
              servicesSummary = serviceNames + (servicesArray.length > 3 ? '...' : '');
            }
          }
        } catch (e) {
          // If parsing fails, use job.services_performed
        }
      }

      return {
        ...job,
        quote,
        customer,
        servicesSummary
      };
    });
  }, [jobs, quotes, customers]);


  // Handle assign team
  const handleAssignTeam = async (jobId, teamId) => {
    if (!teamId) {
      toast.error('Please select a team');
      return;
    }

    setAssigningJobId(jobId);
    setSelectedTeamId(teamId);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ assigned_team_id: teamId || null })
        .eq('id', jobId);

      if (error) {
        throw error;
      }

      toast.success('Team assigned');
      setSelectedTeamId('');
      await fetchData();
    } catch (err) {
      console.error('Error assigning team:', err);
      toast.error(err.message || 'Failed to assign team');
    } finally {
      setAssigningJobId(null);
    }
  };

  // Handle schedule dates (called from modal)
  const handleScheduleDates = async (serviceDate, endDate) => {
    if (!serviceDate) {
      toast.error('Service date is required');
      return;
    }

    // Validate end date >= start date
    if (endDate && endDate < serviceDate) {
      toast.error('End date cannot be before start date');
      return;
    }

    const jobId = schedulingJobId;
    if (!jobId) return;

    try {
      const updateData = {
        service_date: serviceDate || null,
        scheduled_end_date: endDate || serviceDate || null
      };

      const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', jobId);

      if (error) {
        throw error;
      }

      toast.success('Dates scheduled');
      setSchedulingJobId(null);
      await fetchData();
    } catch (err) {
      console.error('Error scheduling dates:', err);
      toast.error(err.message || 'Failed to schedule dates');
    }
  };

  // Handle schedule button click (open modal)
  const handleScheduleClick = (jobId) => {
    if (schedulingJobId === jobId) {
      // Cancel scheduling
      setSchedulingJobId(null);
    } else {
      // Start scheduling
      setSchedulingJobId(jobId);
    }
  };

  // Handle open job
  const handleOpenJob = (jobId) => {
    navigate(`/admin/jobs?openJobId=${jobId}`);
  };

  // Handle schedule in calendar
  const handleScheduleInCalendar = (job) => {
    // Use job.service_date if present, else today's date
    const focusDate = job.service_date 
      ? job.service_date.split('T')[0] 
      : new Date().toISOString().split('T')[0];
    
    navigate(`/admin/schedule?jobId=${job.id}&focusDate=${focusDate}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs Needing Scheduling"
        subtitle="Assign teams and schedule dates for jobs that need scheduling."
      />

      {loading ? (
        <Card>
          <div className="p-8 text-center text-slate-500">Loading...</div>
        </Card>
      ) : mergedData.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-slate-600 mb-4">No jobs need scheduling</p>
            <p className="text-sm text-slate-500">All jobs have been scheduled.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <JobsNeedingSchedulingTable
            mergedData={mergedData}
            teams={teams}
            assigningJobId={assigningJobId}
            schedulingJobId={schedulingJobId}
            selectedTeamId={selectedTeamId}
            onAssignTeam={handleAssignTeam}
            onScheduleClick={handleScheduleClick}
            onScheduleInCalendar={handleScheduleInCalendar}
            onOpenJob={handleOpenJob}
          />
        </Card>
      )}

      {/* Schedule Dates Modal */}
      <DateSchedulingModal
        open={!!schedulingJobId}
        job={schedulingJobId ? mergedData.find(j => j.id === schedulingJobId) : null}
        onSave={handleScheduleDates}
        onCancel={() => setSchedulingJobId(null)}
      />
    </div>
  );
}

