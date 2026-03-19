import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

/**
 * usePaymentHistory - Hook for fetching payment history for a job or customer
 * 
 * @param {string} companyId - Company ID (required)
 * @param {string} jobId - Optional job ID to filter payments
 * @param {string} customerId - Optional customer ID to filter payments (via jobs)
 * @returns {Object} { paymentData, loading, error, refetch }
 *   paymentData: { total: number, records: Array } - Total paid and payment records
 */
export default function usePaymentHistory(companyId, jobId = null, customerId = null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payments, setPayments] = useState([]);
  const [profilesById, setProfilesById] = useState({});

  const fetchPayments = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('payments')
        .select('job_id, invoice_id, amount, payment_method, date_paid, paid_at, receipt_number, external_ref, status, received_by, voided_at, notes')
        .eq('company_id', companyId)
        .eq('status', 'posted');

      if (jobId) {
        query = query.eq('job_id', jobId);
      } else if (customerId) {
        // If customerId provided, we need to get job IDs first
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id')
          .eq('customer_id', customerId)
          .eq('company_id', companyId);
        
        const jobIds = (jobsData || []).map(j => j.id);
        if (jobIds.length > 0) {
          query = query.in('job_id', jobIds);
        } else {
          // No jobs for customer, return empty
          setPayments([]);
          setLoading(false);
          return;
        }
      }

      const { data, error: fetchError } = await query
        .order('paid_at', { ascending: false, nullsFirst: false });

      if (fetchError) throw fetchError;

      setPayments(data || []);

      // Fetch profiles for received_by names
      const receivedByIds = [...new Set(
        (data || [])
          .map(p => {
            const receivedById = typeof p.received_by === 'object' ? p.received_by?.id : p.received_by;
            return receivedById;
          })
          .filter(Boolean)
      )];

      if (receivedByIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', receivedByIds)
          .eq('company_id', companyId);

        if (profilesData) {
          const profilesMap = {};
          profilesData.forEach(profile => {
            profilesMap[String(profile.id)] = profile.full_name;
          });
          setProfilesById(profilesMap);
        }
      }
    } catch (err) {
      console.error('Error fetching payment history:', err);
      setError(err.message || 'Failed to load payment history');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [companyId, jobId, customerId]);

  // Build payment data structure
  const paymentData = useMemo(() => {
    if (!payments || payments.length === 0) {
      return { total: 0, records: [] };
    }

    // Decorate payments with received_by_name
    const decoratedPayments = payments.map(payment => {
      const receivedById = typeof payment.received_by === 'object' ? payment.received_by?.id : payment.received_by;
      const receivedByIdStr = receivedById ? String(receivedById) : null;
      const name = receivedByIdStr ? (profilesById[receivedByIdStr] || null) : null;
      
      return {
        ...payment,
        received_by_name: name
      };
    });

    // Sort by date (paid_at preferred, fallback date_paid), descending
    decoratedPayments.sort((a, b) => {
      const dateA = a.paid_at ? new Date(a.paid_at) : (a.date_paid ? new Date(a.date_paid) : new Date(0));
      const dateB = b.paid_at ? new Date(b.paid_at) : (b.date_paid ? new Date(b.date_paid) : new Date(0));
      return dateB - dateA; // descending order
    });

    // Calculate total
    const total = decoratedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // If jobId provided, return single job's payment data
    if (jobId) {
      return {
        total,
        records: decoratedPayments
      };
    }

    // If customerId provided, group by job
    if (customerId) {
      const byJob = {};
      decoratedPayments.forEach(payment => {
        if (!byJob[payment.job_id]) {
          byJob[payment.job_id] = { total: 0, records: [] };
        }
        byJob[payment.job_id].total += Number(payment.amount) || 0;
        byJob[payment.job_id].records.push(payment);
      });
      return byJob;
    }

    // Default: return all payments
    return {
      total,
      records: decoratedPayments
    };
  }, [payments, profilesById, jobId, customerId]);

  return {
    paymentData,
    loading,
    error,
    refetch: fetchPayments
  };
}
