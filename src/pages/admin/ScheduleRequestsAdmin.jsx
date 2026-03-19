import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ScheduleRequestsTable from '../../components/schedule/ScheduleRequestsTable';
import useScheduleRequests from '../../hooks/useScheduleRequests';

export default function ScheduleRequestsAdmin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [companyId, setCompanyId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  
  // Get jobId from query params
  const jobIdParam = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('jobId');
  }, [location.search]);

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

  // Use extracted hook for data fetching
  const { mergedData, loading, refetch } = useScheduleRequests(companyId, jobIdParam);

  // Scroll to highlighted row when jobId param is present and data is loaded
  useEffect(() => {
    if (jobIdParam && mergedData.length > 0) {
      // Find the first row matching the jobId and scroll to it
      const highlightedRow = document.querySelector(`[data-job-id="${jobIdParam}"]`);
      if (highlightedRow) {
        setTimeout(() => {
          highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [jobIdParam, mergedData.length]);


  // Handle approve
  const handleApprove = async (requestId) => {
    const request = mergedData.find(r => r.id === requestId)
    const isRescheduleRequest = (request?.request_type || 'initial') === 'reschedule'
    setApprovingId(requestId);
    try {
      const { data, error } = await supabase.rpc('approve_job_schedule_request', {
        p_request_id: requestId
      });

      if (error) {
        throw error;
      }

      if (!data || data.ok === false) {
        throw new Error(data?.reason || data?.error || 'Failed to approve request');
      }

      toast.success(isRescheduleRequest ? 'Job rescheduled successfully.' : 'Schedule request approved');
      await refetch();
    } catch (err) {
      console.error('Error approving request:', err);
      toast.error(err.message || 'Failed to approve request');
    } finally {
      setApprovingId(null);
    }
  };

  // Handle decline
  const handleDecline = async (requestId) => {
    const reason = prompt('Reason for declining (optional):');
    if (reason === null) return; // User cancelled

    setDecliningId(requestId);
    try {
      const { data, error } = await supabase.rpc('decline_job_schedule_request', {
        p_request_id: requestId,
        p_reason: reason || null
      });

      if (error) {
        throw error;
      }

      if (!data || data.ok === false) {
        throw new Error(data?.reason || data?.error || 'Failed to decline request');
      }

      toast.success('Schedule request declined');
      await refetch();
    } catch (err) {
      console.error('Error declining request:', err);
      toast.error(err.message || 'Failed to decline request');
    } finally {
      setDecliningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Schedule Requests"
          subtitle="Review and approve customer schedule date requests."
        />
        {jobIdParam && (
          <div className="flex gap-2">
            <Button
              variant="tertiary"
              onClick={() => navigate('/admin/schedule?tab=requests')}
              className="text-sm"
            >
              View All Requests
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/admin/revenue-hub')}
              className="text-sm"
            >
              Back to Revenue Hub
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <Card>
          <div className="p-8 text-center text-slate-500">Loading...</div>
        </Card>
      ) : mergedData.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-slate-600 mb-4">
              {jobIdParam ? 'No open schedule request found for this job.' : 'No schedule requests'}
            </p>
            <p className="text-sm text-slate-500">
              {jobIdParam 
                ? 'This job may not have a pending schedule request, or it may have already been processed.'
                : 'All schedule requests have been processed.'}
            </p>
            {jobIdParam && (
              <Button
                variant="tertiary"
                onClick={() => navigate('/admin/schedule?tab=requests')}
                className="mt-4"
              >
                View All Requests
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <ScheduleRequestsTable
            mergedData={mergedData}
            jobIdParam={jobIdParam}
            approvingId={approvingId}
            decliningId={decliningId}
            onApprove={handleApprove}
            onDecline={handleDecline}
          />
        </Card>
      )}
    </div>
  );
}

