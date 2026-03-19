import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ScheduleRequestsTable from './ScheduleRequestsTable';
import useScheduleRequests from '../../hooks/useScheduleRequests';

/**
 * ScheduleRequestsTab - Tab component for managing schedule requests
 * 
 * @param {string} companyId - Company ID (required)
 * @param {string} jobIdParam - Optional jobId from query params to filter/highlight
 * @param {Function} onRequestChange - Optional callback to refresh schedule requests count in parent
 */
export default function ScheduleRequestsTab({ companyId, jobIdParam, onRequestChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [approvingId, setApprovingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);

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
    const request = mergedData.find(r => r.id === requestId);
    const isRescheduleRequest = (request?.request_type || 'initial') === 'reschedule';
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
      // Refresh schedule requests count in parent if callback provided
      if (onRequestChange) {
        onRequestChange();
      }
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
      // Refresh schedule requests count in parent if callback provided
      if (onRequestChange) {
        onRequestChange();
      }
    } catch (err) {
      console.error('Error declining request:', err);
      toast.error(err.message || 'Failed to decline request');
    } finally {
      setDecliningId(null);
    }
  };

  return (
    <div className="space-y-6">
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
