import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { INVOICE_SELECT_CUSTOMERS_ADMIN, JOB_SELECT_CUSTOMERS_ADMIN_INVOICES } from '../lib/dbSelects';
import { warnIfMissingColumns, parseSelectString } from '../utils/schemaGuards';

/**
 * useInvoiceList - Hook for fetching invoice list for a customer or job
 * 
 * @param {string} companyId - Company ID (required)
 * @param {string} customerId - Optional customer ID to filter invoices
 * @param {string} jobId - Optional job ID to filter invoices
 * @returns {Object} { invoices, loading, error, refetch }
 */
export default function useInvoiceList(companyId, customerId = null, jobId = null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoices, setInvoices] = useState([]);

  const fetchInvoices = async () => {
    if (!companyId || (!customerId && !jobId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let invoiceData = [];

      // Try to load from invoices table first (preferred)
      try {
        let invoiceQuery = supabase
          .from('invoices')
          .select(INVOICE_SELECT_CUSTOMERS_ADMIN)
          .eq('company_id', companyId)
          .not('pdf_path', 'is', null)
          .neq('pdf_path', '');

        if (jobId) {
          invoiceQuery = invoiceQuery.eq('job_id', jobId);
        } else if (customerId) {
          invoiceQuery = invoiceQuery.eq('customer_id', customerId);
        }

        const { data: invoicesData, error: invoicesError } = await invoiceQuery;

        if (!invoicesError && invoicesData) {
          // Schema guardrail: warn if expected columns are missing
          if (invoicesData.length > 0) {
            const requiredInvoiceColumns = parseSelectString(INVOICE_SELECT_CUSTOMERS_ADMIN);
            warnIfMissingColumns('useInvoiceList.invoices', invoicesData, requiredInvoiceColumns);
          }

          // Get job details for these invoices
          const jobIds = invoicesData.map(inv => inv.job_id).filter(Boolean);
          if (jobIds.length > 0) {
            const { data: jobsData } = await supabase
              .from('jobs')
              .select('id, service_date, services_performed, status, job_cost, invoice_path')
              .in('id', jobIds)
              .eq('company_id', companyId);

            // Schema guardrail: warn if expected columns are missing
            if (jobsData && jobsData.length > 0) {
              const requiredJobColumns = parseSelectString(JOB_SELECT_CUSTOMERS_ADMIN_INVOICES);
              warnIfMissingColumns('useInvoiceList.jobs', jobsData, requiredJobColumns);
            }

            // Merge invoice and job data
            const jobsById = {};
            jobsData?.forEach(job => { jobsById[job.id] = job; });

            invoiceData = invoicesData.map(inv => {
              const job = jobsById[inv.job_id];
              if (!job) return null;
              return {
                ...job,
                // Canonical path resolution: prefer invoices.pdf_path
                invoice_path: inv.pdf_path || job.invoice_path,
                invoice_id: inv.id,
                invoice_status: inv.status,
                invoice_due_date: inv.due_date
              };
            }).filter(Boolean);
          }
        }
      } catch (err) {
        console.warn('Could not load from invoices table, falling back to jobs:', err);
      }

      // Fallback: Load from jobs with invoice_path (temporary legacy support)
      if (invoiceData.length === 0) {
        let jobQuery = supabase
          .from('jobs')
          .select('id, service_date, services_performed, status, job_cost, invoice_path')
          .eq('company_id', companyId)
          .not('invoice_path', 'is', null)
          .neq('invoice_path', '');

        if (jobId) {
          jobQuery = jobQuery.eq('id', jobId);
        } else if (customerId) {
          jobQuery = jobQuery.eq('customer_id', customerId);
        }

        const { data, error: jobError } = await jobQuery
          .order('service_date', { ascending: false });

        if (jobError) throw jobError;

        // Schema guardrail: warn if expected columns are missing
        if (data && data.length > 0) {
          const requiredJobColumns = parseSelectString(JOB_SELECT_CUSTOMERS_ADMIN_INVOICES);
          warnIfMissingColumns('useInvoiceList.jobs.fallback', data, requiredJobColumns);
        }

        invoiceData = data || [];
      } else {
        // Sort by service_date descending
        invoiceData.sort((a, b) => {
          const dateA = new Date(a.service_date || 0);
          const dateB = new Date(b.service_date || 0);
          return dateB - dateA;
        });
      }

      setInvoices(invoiceData);
    } catch (err) {
      console.error('Error fetching invoice list:', err);
      setError(err.message || 'Unable to load invoices. Please try again.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [companyId, customerId, jobId]);

  return {
    invoices,
    loading,
    error,
    refetch: fetchInvoices
  };
}
