import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { JOB_SELECT_CUSTOMERS_ADMIN } from '../lib/dbSelects';
import { warnIfMissingColumns, parseSelectString } from '../utils/schemaGuards';

/**
 * useFinancialKPIs - Hook for calculating financial KPIs for a customer
 * 
 * @param {string} companyId - Company ID (required)
 * @param {string} customerId - Customer ID (required)
 * @returns {Object} { kpiData, loading, error, refetch }
 *   kpiData: { totalPaid, outstanding, totalJobs, completedJobs, upcomingJobs, lastActivity }
 */
export default function useFinancialKPIs(companyId, customerId) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kpiData, setKpiData] = useState(null);

  const fetchKPIs = async () => {
    if (!customerId || !companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch jobs for customer
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, status, job_cost, service_date')
        .eq('customer_id', customerId)
        .eq('company_id', companyId);

      if (jobsError) throw jobsError;

      // Schema guardrail: warn if expected columns are missing
      if (jobs && jobs.length > 0) {
        const requiredJobColumns = parseSelectString(JOB_SELECT_CUSTOMERS_ADMIN);
        warnIfMissingColumns('useFinancialKPIs.jobs', jobs, requiredJobColumns);
      }

      const jobsList = jobs || [];
      const jobIds = jobsList.map(j => j.id);

      // Early return if no jobs - set KPI data to zeros/defaults
      if (jobIds.length === 0) {
        // Fetch last activity even if no jobs
        let lastActivity = null;
        try {
          const { data: activityData, error: activityError } = await supabase
            .from('customer_activity_log')
            .select('created_at')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (!activityError || activityError.code === 'PGRST116') {
            lastActivity = activityData?.created_at || null;
          }
        } catch (activityErr) {
          console.warn('Could not fetch last activity for customer with no jobs:', activityErr);
        }

        setKpiData({
          totalPaid: 0,
          outstanding: 0,
          totalJobs: 0,
          completedJobs: 0,
          upcomingJobs: 0,
          lastActivity: lastActivity
        });
        setLoading(false);
        return;
      }

      // Fetch posted payments for those jobs
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, job_id, status')
        .in('job_id', jobIds)
        .eq('status', 'posted')
        .eq('company_id', companyId);

      if (paymentsError) throw paymentsError;

      const totalPaid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      // Fetch last activity
      const { data: lastActivity, error: activityError } = await supabase
        .from('customer_activity_log')
        .select('created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (activityError && activityError.code !== 'PGRST116') {
        throw activityError;
      }

      // Compute totals client-side
      const totalJobs = jobsList.length;
      const completedJobs = jobsList.filter(j => j.status === 'Completed').length;

      // Upcoming jobs: service_date >= today AND status NOT IN ('Completed','Canceled')
      const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const upcomingJobs = jobsList.filter(j => {
        if (!j.service_date) return false;
        if (j.status === 'Completed' || j.status === 'Canceled') return false;
        return j.service_date >= todayStr;
      }).length;

      // Outstanding: sum(job_cost) - sum(posted payments) for all non-canceled jobs
      const nonCanceledJobs = jobsList.filter(j => j.status !== 'Canceled');
      const totalJobCost = nonCanceledJobs.reduce((sum, j) => sum + (Number(j.job_cost) || 0), 0);
      const outstanding = Math.max(0, totalJobCost - totalPaid);

      setKpiData({
        totalPaid,
        outstanding,
        totalJobs,
        completedJobs,
        upcomingJobs,
        lastActivity: lastActivity?.created_at || null
      });
    } catch (err) {
      console.error('Error fetching financial KPIs:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        err
      });
      setError(err.message || 'Unable to load summary right now.');
      setKpiData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIs();
  }, [companyId, customerId]);

  return {
    kpiData,
    loading,
    error,
    refetch: fetchKPIs
  };
}
