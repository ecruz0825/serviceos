import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

/**
 * useScheduleRequests - Hook for fetching schedule requests and related data
 * 
 * @param {string} companyId - Company ID (required)
 * @param {string} jobIdFilter - Optional job ID to filter requests
 * @returns {Object} { requests, jobs, quotes, customers, loading, error, refetch }
 */
export default function useScheduleRequests(companyId, jobIdFilter = null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);

  const fetchData = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      // Step 1: Fetch schedule requests with status='requested'
      // If jobIdFilter exists, filter to that job only
      let query = supabase
        .from('job_schedule_requests')
        .select('id, job_id, quote_id, request_type, requested_date, customer_note, created_at')
        .eq('company_id', companyId)
        .eq('status', 'requested');
      
      if (jobIdFilter) {
        query = query.eq('job_id', jobIdFilter);
      }
      
      const { data: requestsData, error: requestsError } = await query
        .order('request_type', { ascending: false })
        .order('created_at', { ascending: false });

      if (requestsError) {
        console.error('Error fetching schedule requests:', requestsError);
        toast.error('Failed to load schedule requests');
        setRequests([]);
        setJobs([]);
        setQuotes([]);
        setCustomers([]);
        setError(requestsError);
        return;
      }

      const requestsList = requestsData || [];
      setRequests(requestsList);

      if (requestsList.length === 0) {
        setJobs([]);
        setQuotes([]);
        setCustomers([]);
        setLoading(false);
        return;
      }

      // Step 2: Get job IDs and quote IDs
      const jobIds = [...new Set(requestsList.map(r => r.job_id).filter(Boolean))];
      const quoteIds = [...new Set(requestsList.map(r => r.quote_id).filter(Boolean))];

      // Step 3: Fetch jobs
      let jobsList = [];
      if (jobIds.length > 0) {
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('id, customer_id, services_performed, service_date, scheduled_end_date')
          .in('id', jobIds);

        if (jobsError) {
          console.error('Error fetching jobs:', jobsError);
          setJobs([]);
        } else {
          jobsList = jobsData || [];
          setJobs(jobsList);
        }
      } else {
        setJobs([]);
      }

      // Step 4: Fetch quotes
      let quotesList = [];
      if (quoteIds.length > 0) {
        const { data: quotesData, error: quotesError } = await supabase
          .from('quotes')
          .select('id, quote_number, services, customer_id')
          .in('id', quoteIds);

        if (quotesError) {
          console.error('Error fetching quotes:', quotesError);
          setQuotes([]);
        } else {
          quotesList = quotesData || [];
          setQuotes(quotesList);
        }
      } else {
        setQuotes([]);
      }

      // Step 5: Fetch customers
      const customerIds = [...new Set([
        ...jobsList.map(j => j.customer_id),
        ...quotesList.map(q => q.customer_id)
      ].filter(Boolean))];

      if (customerIds.length > 0) {
        const { data: customersData, error: customersError } = await supabase
          .from('customers')
          .select('id, full_name, email')
          .in('id', customerIds);

        if (customersError) {
          console.error('Error fetching customers:', customersError);
          setCustomers([]);
        } else {
          setCustomers(customersData || []);
        }
      } else {
        setCustomers([]);
      }
    } catch (err) {
      console.error('Unexpected error loading schedule requests:', err);
      toast.error('Failed to load data');
      setError(err);
      setRequests([]);
      setJobs([]);
      setQuotes([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId, jobIdFilter]);

  // Merge data in memory (same logic as ScheduleRequestsAdmin)
  const mergedData = useMemo(() => {
    if (!requests.length) return [];

    const jobsById = {};
    jobs.forEach(j => { jobsById[j.id] = j; });

    const quotesById = {};
    quotes.forEach(q => { quotesById[q.id] = q; });

    const customersById = {};
    customers.forEach(c => { customersById[c.id] = c; });

    return requests.map(request => {
      const job = jobsById[request.job_id];
      const quote = quotesById[request.quote_id];
      const customer = customersById[job?.customer_id] || customersById[quote?.customer_id];

      // Format services summary from quote.services (JSONB) or job.services_performed
      let servicesSummary = job?.services_performed || '';
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
        ...request,
        job,
        quote,
        customer,
        servicesSummary
      };
    });
  }, [requests, jobs, quotes, customers]);

  return {
    requests,
    jobs,
    quotes,
    customers,
    mergedData,
    loading,
    error,
    refetch: fetchData
  };
}
