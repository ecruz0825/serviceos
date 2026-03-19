/**
 * PaymentsAdmin - Payment management with deep linking support
 * 
 * DEEP LINKING TEST CHECKLIST:
 * 1) Click customer name in payment row → customer drawer opens to Overview tab
 * 2) Click job/service → Jobs page opens and edit drawer opens for the correct job
 * 3) Directly visit /admin/customers?customer_id=...&tab=timeline → drawer opens on Timeline tab
 */

import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import { CreditCard, Loader2, Search, Calendar, DollarSign, Plus, X, Upload, Eye, Download, Trash2, FileText } from "lucide-react";
import Button from "../../components/ui/Button";
import useConfirm from "../../hooks/useConfirm";
import toast from "react-hot-toast";
import { logProductEvent } from "../../lib/productEvents";
import InputModal from "../../components/ui/InputModal";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Drawer from "../../components/ui/Drawer";
import useCompanySettings from "../../hooks/useCompanySettings";
import EmptyState from "../../components/customer/EmptyState";
import { triggerEmailProcessing } from "../../utils/emailQueue";
import { useBillingGuard } from "../../components/ui/BillingGuard";
import BillingGuard from "../../components/ui/BillingGuard";

export default function PaymentsAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, ConfirmDialog } = useConfirm();
  const { settings } = useCompanySettings();
  const { effectiveCompanyId, supportMode } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profilesById, setProfilesById] = useState({});
  const [companyId, setCompanyId] = useState(null);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState("all"); // all, posted, voided
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("paid_at"); // paid_at, amount
  const [sortAsc, setSortAsc] = useState(false); // false = desc (newest first)
  
  // InputModal state for void payment reason
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [pendingVoidPaymentId, setPendingVoidPaymentId] = useState(null);
  const [voidLoading, setVoidLoading] = useState(false);

  // Record Payment Drawer state
  const [recordDrawerOpen, setRecordDrawerOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobPayments, setJobPayments] = useState({}); // jobId -> { total: number, records: [] }
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "Cash",
    notes: "",
    receiptNumber: "",
    externalRef: "",
    receivedBy: ""
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [staffProfiles, setStaffProfiles] = useState([]); // For received_by dropdown

  // Payment Receipts state
  const [paymentReceipts, setPaymentReceipts] = useState({}); // paymentId -> [receipt objects]
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptUploadDrawer, setReceiptUploadDrawer] = useState({ open: false, paymentId: null, customerId: null });
  const [receiptUploadLoading, setReceiptUploadLoading] = useState(false);
  const [receiptPreviewModal, setReceiptPreviewModal] = useState({ open: false, file: null, url: null });

  // Initialize company ID from UserContext (supports support mode)
  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId);
    }
  }, [effectiveCompanyId]);

  const fetchPayments = async () => {
    if (!companyId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          payment_method,
          paid,
          date_paid,
          notes,
          status,
          paid_at,
          created_by,
          voided_at,
          void_reason,
          receipt_number,
          external_ref,
          received_by,
          job_id,
          jobs (
            id,
            services_performed,
            customer_id,
            job_cost,
            customers (
              id,
              full_name
            )
          )
        `)
        .eq('company_id', companyId)
        .order('paid_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setPayments(data || []);

      // Build staff list: union of received_by and created_by UUIDs (non-null only)
      const staffIds = new Set();
      (data || []).forEach(p => {
        const receivedById = typeof p.received_by === 'object' ? p.received_by?.id : p.received_by;
        const createdById = typeof p.created_by === 'object' ? p.created_by?.id : p.created_by;
        
        if (receivedById) staffIds.add(String(receivedById));
        if (createdById) staffIds.add(String(createdById));
      });

      // Fetch profiles for staff (only if we have IDs)
      if (staffIds.size > 0) {
        try {
          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", Array.from(staffIds));

          if (profilesError) {
            console.warn("Error fetching profiles:", profilesError);
            // Continue without profiles - will show "—" in UI
          } else {
            // Build lookup map: id -> { full_name, email }
            const lookup = {};
            (profilesData || []).forEach(profile => {
              if (profile.id) {
                lookup[String(profile.id)] = {
                  name: profile.full_name || profile.email || '—',
                  email: profile.email || null
                };
              }
            });
            setProfilesById(lookup);
          }
        } catch (profilesErr) {
          console.warn("Error fetching profiles:", profilesErr);
          // Continue without profiles
        }
      } else {
        // No staff IDs found - this is fine, just set empty map
        setProfilesById({});
      }
    } catch (err) {
      console.warn("Error fetching payments:", err);
      setError("Unable to load payments. Please try again.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchPayments();
      fetchStaffProfiles();
    }
  }, [companyId]);

  // Fetch payment receipts when payments change
  useEffect(() => {
    if (companyId && payments.length > 0) {
      fetchPaymentReceipts();
    }
  }, [companyId, payments]);

  // Handle jobId and customerId query params for deep-linking
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    const customerId = searchParams.get('customerId');
    
    if ((jobId || customerId) && companyId) {
      const openRecordPayment = async () => {
        // If jobId is provided, fetch the job and open drawer
        if (jobId) {
          try {
            // First try to find in existing jobs list
            let job = jobs.find(j => j.id === jobId);
            
            // If not found, fetch it directly
            if (!job) {
              const { data, error } = await supabase
                .from('jobs')
                .select(`
                  id,
                  services_performed,
                  job_cost,
                  customer_id,
                  status,
                  service_date,
                  customers (
                    id,
                    full_name,
                    email
                  )
                `)
                .eq('id', jobId)
                .eq('company_id', companyId)
                .single();
              
              if (error || !data) {
                if (error?.code === 'PGRST116') {
                  toast.error('Job not found. It may have been deleted.');
                } else {
                  toast.error(error?.message || 'Job not found');
                }
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('jobId');
                newParams.delete('customerId');
                setSearchParams(newParams, { replace: true });
                return;
              }
              
              // Validate job belongs to company (defense in depth)
              if (data.company_id !== companyId) {
                toast.error('Job not found or access denied');
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('jobId');
                newParams.delete('customerId');
                setSearchParams(newParams, { replace: true });
                return;
              }
              
              job = data;
              // Add to jobs list if not already there
              if (!jobs.find(j => j.id === job.id)) {
                setJobs(prev => [...prev, job]);
              }
            }
            
            // Select the job and open drawer
            setSelectedJobId(jobId);
            setSelectedJob(job);
            await fetchJobPayments(jobId);
            setRecordDrawerOpen(true);
            
            // Clear URL params
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('jobId');
            newParams.delete('customerId');
            setSearchParams(newParams, { replace: true });
          } catch (err) {
            console.error('Error opening record payment:', err);
            toast.error('Failed to open payment form');
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('jobId');
            newParams.delete('customerId');
            setSearchParams(newParams, { replace: true });
          }
        } else if (customerId) {
          // If only customerId is provided, just open the drawer
          // (job selection will be manual)
          setRecordDrawerOpen(true);
          await fetchJobs();
          
          // Clear URL params
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('jobId');
          newParams.delete('customerId');
          setSearchParams(newParams, { replace: true });
        }
      };
      
      // Wait for jobs to load if we need to search, or proceed if we have jobId to fetch
      if (jobs.length > 0 || jobId) {
        openRecordPayment();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, jobs, searchParams, setSearchParams]);

  // Fetch staff profiles for received_by dropdown
  const fetchStaffProfiles = async () => {
    if (!companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId)
        .order('full_name');
      
      if (error) {
        console.warn('Error fetching staff profiles:', error);
        return;
      }
      
      setStaffProfiles(data || []);
    } catch (err) {
      console.warn('Error fetching staff profiles:', err);
    }
  };

  // Job search state
  const [jobSearchTerm, setJobSearchTerm] = useState("");

  // Fetch jobs for job selector
  const fetchJobs = async (searchTerm = "") => {
    if (!companyId) return;
    
    setJobsLoading(true);
    try {
      // Fetch all jobs (company-scoped, limit to recent 200 for performance)
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id,
          services_performed,
          job_cost,
          customer_id,
          status,
          service_date,
          customers (
            id,
            full_name,
            email
          )
        `)
        .eq('company_id', companyId)
        .order('service_date', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      
      let filtered = data || [];
      
      // Client-side filtering if search term provided
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(job => {
          const customerName = job.customers?.full_name || '';
          const serviceDesc = job.services_performed || '';
          return customerName.toLowerCase().includes(search) ||
                 serviceDesc.toLowerCase().includes(search);
        });
      }
      
      setJobs(filtered);
    } catch (err) {
      console.warn('Error fetching jobs:', err);
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  // Fetch payments for selected job to calculate balance
  const fetchJobPayments = async (jobId) => {
    if (!jobId || !companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('job_id', jobId)
        .eq('company_id', companyId)
        .eq('status', 'posted');
      
      if (error) {
        console.warn('Error fetching job payments:', error);
        return;
      }
      
      const total = (data || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      setJobPayments(prev => ({
        ...prev,
        [jobId]: { total, records: data || [] }
      }));
    } catch (err) {
      console.warn('Error fetching job payments:', err);
    }
  };

  // Handle job selection
  const handleJobSelect = async (jobId) => {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    setSelectedJob(job || null);
    
    if (jobId) {
      await fetchJobPayments(jobId);
    }
  };

  // Open record payment drawer
  const handleOpenRecordPayment = async () => {
    setRecordDrawerOpen(true);
    setSelectedJobId("");
    setSelectedJob(null);
    setJobSearchTerm("");
    setPaymentForm({
      amount: "",
      method: "Cash",
      notes: "",
      receiptNumber: "",
      externalRef: "",
      receivedBy: ""
    });
    setFormErrors({});
    await fetchJobs();
  };

  // Calculate remaining balance
  const remainingBalance = useMemo(() => {
    if (!selectedJob) return 0;
    const jobCost = Number(selectedJob.job_cost) || 0;
    const paidTotal = jobPayments[selectedJobId]?.total || 0;
    return Math.max(0, jobCost - paidTotal);
  }, [selectedJob, selectedJobId, jobPayments]);

  // Validate form
  const validateForm = () => {
    const errors = {};
    
    if (!selectedJobId) {
      errors.job = "Please select a job";
    }
    
    const amount = Number(paymentForm.amount);
    if (!paymentForm.amount || amount <= 0) {
      errors.amount = "Amount must be greater than 0";
    } else if (amount > remainingBalance) {
      errors.amount = `Amount cannot exceed remaining balance of $${remainingBalance.toFixed(2)}`;
    }
    
    if (!paymentForm.method) {
      errors.method = "Please select a payment method";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleRecordPayment = async () => {
    if (supportMode) {
      toast.error("Payment actions are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Payment actions are disabled due to billing status.");
      return;
    }
    if (!validateForm()) return;
    
    setSubmitting(true);
    
    try {
      const amount = Number(paymentForm.amount);
      
      // Get invoice_id for this job if invoice exists (for automatic balance sync)
      let invoiceId = null;
      if (selectedJobId) {
        try {
          const { data: invoiceData } = await supabase
            .from('invoices')
            .select('id')
            .eq('job_id', selectedJobId)
            .maybeSingle();
          invoiceId = invoiceData?.id || null;
        } catch (invoiceError) {
          // Invoice might not exist - that's ok, continue without invoice_id
          console.debug('No invoice found for job:', selectedJobId);
        }
      }
      
      // Call RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc('record_payment', {
        p_job_id: selectedJobId,
        p_amount: amount,
        p_method: paymentForm.method,
        p_notes: paymentForm.notes.trim() || null,
        p_external_ref: paymentForm.externalRef.trim() || null,
        p_invoice_id: invoiceId
      });
      
      if (rpcError) {
        if (rpcError.message?.includes('OVERPAYMENT')) {
          toast.error('Payment exceeds remaining balance. This attempt was logged.');
          setFormErrors({ amount: 'Payment exceeds remaining balance' });
        } else {
          toast.error(rpcError.message || 'Could not record payment.');
        }
        setSubmitting(false);
        return;
      }
      
      const paymentResult = rpcResult?.[0];
      if (!paymentResult) {
        toast.error('Payment recorded but no data returned.');
        setSubmitting(false);
        return;
      }
      
      const paymentId = paymentResult.payment_id;
      
      // Log product event: invoice_paid (if balance becomes 0)
      if (paymentResult.balance_due === 0 && invoiceId) {
        logProductEvent('invoice_paid', {
          invoice_id: invoiceId,
          job_id: selectedJobId,
          payment_id: paymentId,
          amount: amount,
          total_paid: paymentResult.total_paid
        });
      }
      
      // Update receipt_number and received_by if provided
      if (paymentForm.receiptNumber.trim() || paymentForm.receivedBy) {
        const updateData = {};
        if (paymentForm.receiptNumber.trim()) {
          updateData.receipt_number = paymentForm.receiptNumber.trim();
        }
        if (paymentForm.receivedBy) {
          updateData.received_by = paymentForm.receivedBy;
        }
        
        const { error: updateError } = await supabase
          .from('payments')
          .update(updateData)
          .eq('id', paymentId);
        
        if (updateError) {
          console.warn('Error updating payment metadata:', updateError);
          // Continue anyway - payment was recorded
        }
      }
      
      // Log activity
      if (selectedJob?.customer_id) {
        try {
          await supabase.rpc('log_customer_activity', {
            p_customer_id: selectedJob.customer_id,
            p_event_type: 'payment.recorded',
            p_event_title: 'Payment recorded',
            p_event_description: `Payment of $${amount.toFixed(2)} recorded via ${paymentForm.method}`,
            p_event_category: 'payments',
            p_related_type: 'payment',
            p_related_id: paymentId,
            p_severity: 'success',
            p_event_data: {
              amount: amount,
              method: paymentForm.method,
              job_id: selectedJobId
            }
          });
        } catch (logError) {
          console.warn('Failed to log payment activity:', logError);
          // Don't block on logging failure
        }
      }
      
      // Queue payment receipt email
      const customerEmail = selectedJob?.customers?.email;
      if (customerEmail) {
        try {
          const brandName = settings?.display_name || 'Your Service Provider';
          const customerName = selectedJob?.customers?.full_name || 'there';
          const paymentDate = new Date().toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
          });
          const serviceDescription = selectedJob?.services_performed || 'Services rendered';
          const newBalanceDue = paymentResult.balance_due != null 
            ? Number(paymentResult.balance_due).toFixed(2) 
            : null;
          
          // Fetch invoice number if we have an invoice
          let invoiceNumber = null;
          if (invoiceId) {
            try {
              const { data: invData } = await supabase
                .from('invoices')
                .select('invoice_number')
                .eq('id', invoiceId)
                .single();
              invoiceNumber = invData?.invoice_number || null;
            } catch {
              // Invoice number is optional
            }
          }
          
          const subject = `${brandName} – Payment Receipt`;
          
          // Build plain text
          const textLines = [
            `Hi ${customerName},`,
            '',
            'Thank you for your payment!',
            '',
            `Amount Paid: $${amount.toFixed(2)}`,
            `Payment Method: ${paymentForm.method}`,
            `Date: ${paymentDate}`,
          ];
          if (invoiceNumber) textLines.push(`Invoice: ${invoiceNumber}`);
          textLines.push(`Service: ${serviceDescription}`);
          if (newBalanceDue !== null) {
            if (Number(newBalanceDue) === 0) {
              textLines.push('', 'Your account is now paid in full.');
            } else {
              textLines.push(`Remaining Balance: $${newBalanceDue}`);
            }
          }
          textLines.push('', 'Thank you for your business!', brandName);
          const textContent = textLines.join('\n');
          
          // Build HTML
          const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  <p>Hi ${customerName},</p>
  <p>Thank you for your payment!</p>
  <div style="margin: 20px 0; padding: 15px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
    <p style="margin: 5px 0;"><strong>Amount Paid:</strong> $${amount.toFixed(2)}</p>
    <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${paymentForm.method}</p>
    <p style="margin: 5px 0;"><strong>Date:</strong> ${paymentDate}</p>
    ${invoiceNumber ? `<p style="margin: 5px 0;"><strong>Invoice:</strong> ${invoiceNumber}</p>` : ''}
    <p style="margin: 5px 0;"><strong>Service:</strong> ${serviceDescription}</p>
  </div>
  ${newBalanceDue !== null ? (
    Number(newBalanceDue) === 0 
      ? '<p style="color: #16a34a; font-weight: 500;">Your account is now paid in full.</p>'
      : `<p><strong>Remaining Balance:</strong> $${newBalanceDue}</p>`
  ) : ''}
  <p>Thank you for your business!</p>
  <p>${brandName}</p>
</div>
          `.trim();
          
          // Enqueue the receipt email
          const { error: enqueueError } = await supabase.rpc('enqueue_email', {
            p_company_id: companyId,
            p_message_type: 'payment_receipt',
            p_to_email: customerEmail,
            p_subject: subject,
            p_payload: {
              payment_id: paymentId,
              payment_amount: amount,
              payment_method: paymentForm.method,
              payment_date: paymentDate,
              invoice_id: invoiceId,
              invoice_number: invoiceNumber,
              balance_due: newBalanceDue,
              customer_name: customerName,
              service_description: serviceDescription,
              brand_name: brandName,
            },
            p_html_content: htmlContent,
            p_text_content: textContent,
            p_job_id: selectedJobId,
            p_invoice_id: invoiceId,
            p_customer_id: selectedJob.customer_id,
          });
          
          if (enqueueError) {
            console.warn('Failed to queue payment receipt email:', enqueueError);
            // Don't block payment success on email failure
          } else {
            triggerEmailProcessing();
          }
        } catch (emailError) {
          console.warn('Error queueing payment receipt email:', emailError);
          // Don't block payment success on email failure
        }
      }
      
      // Show success message (mention receipt if customer had email)
      if (customerEmail) {
        toast.success('Payment recorded! Receipt email queued.');
      } else {
        toast.success('Payment recorded successfully!');
      }
      setRecordDrawerOpen(false);
      
      // Refresh payments list
      await fetchPayments();
      
      // Refetch invoice if it exists (trigger will have updated status automatically)
      if (selectedJobId) {
        try {
          const { data: invoiceData } = await supabase
            .from('invoices')
            .select('id, status, total, pdf_path, sent_at, paid_at, due_date, created_at')
            .eq('job_id', selectedJobId)
            .single();
          
          // If invoice exists, trigger a refresh of invoice data
          // (This will be picked up by components that subscribe to invoice changes)
          if (invoiceData) {
            // Dispatch a custom event or update state if needed
            // For now, we'll rely on the component's own refresh mechanism
            console.log('Invoice status updated:', invoiceData);
          }
        } catch (invoiceError) {
          // Invoice might not exist yet - that's ok
          if (invoiceError.code !== 'PGRST116') {
            console.warn('Error refetching invoice after payment:', invoiceError);
          }
        }
      }
      
    } catch (err) {
      console.error('Error recording payment:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch payment receipts (batched query to avoid N+1)
  const fetchPaymentReceipts = async () => {
    if (!companyId || payments.length === 0) return;
    
    setReceiptsLoading(true);
    try {
      const paymentIds = payments.map(p => p.id).filter(Boolean);
      if (paymentIds.length === 0) {
        setPaymentReceipts({});
        setReceiptsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('payment_receipts')
        .select(`
          id,
          payment_id,
          customer_file_id,
          created_at,
          customer_files (
            id,
            file_name,
            file_path,
            mime_type,
            size_bytes
          )
        `)
        .eq('company_id', companyId)
        .in('payment_id', paymentIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group receipts by payment_id
      const receiptsByPayment = {};
      (data || []).forEach(receipt => {
        if (!receiptsByPayment[receipt.payment_id]) {
          receiptsByPayment[receipt.payment_id] = [];
        }
        receiptsByPayment[receipt.payment_id].push(receipt);
      });

      setPaymentReceipts(receiptsByPayment);
    } catch (err) {
      console.warn('Error fetching payment receipts:', err);
      setPaymentReceipts({});
    } finally {
      setReceiptsLoading(false);
    }
  };

  // Open receipt upload drawer
  const handleOpenReceiptUpload = (paymentId, customerId) => {
    setReceiptUploadDrawer({ open: true, paymentId, customerId });
  };

  // Upload receipt files
  const handleUploadReceipts = async (fileList) => {
    if (supportMode) {
      toast.error("Receipt uploads are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Receipt uploads are disabled due to billing status.");
      return;
    }
    const { paymentId, customerId } = receiptUploadDrawer;
    if (!paymentId || !customerId || !companyId || !fileList || fileList.length === 0) return;

    setReceiptUploadLoading(true);
    
    try {
      const files = Array.from(fileList);
      const uploadedFiles = [];

      for (const file of files) {
        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const timestamp = Date.now();
        const filePath = `${companyId}/customers/${customerId}/payments/${paymentId}/${timestamp}_${safeName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('customer-files')
          .upload(filePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false
          });

        if (uploadError) {
          console.error('File upload failed:', uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        // Insert customer_files row
        const { data: fileRecord, error: dbError } = await supabase
          .from('customer_files')
          .insert([{
            company_id: companyId,
            customer_id: customerId,
            file_name: file.name,
            file_path: filePath,
            mime_type: file.type || null,
            size_bytes: file.size || null,
            created_by: (await supabase.auth.getUser()).data.user?.id || null
          }])
          .select()
          .single();

        if (dbError) {
          console.error('DB insert failed:', dbError);
          await supabase.storage.from('customer-files').remove([filePath]);
          toast.error(`Failed to save record for ${file.name}`);
          continue;
        }

        // Link to payment via payment_receipts
        const { data: receiptRecord, error: receiptError } = await supabase
          .from('payment_receipts')
          .insert([{
            company_id: companyId,
            payment_id: paymentId,
            customer_file_id: fileRecord.id,
            created_by: (await supabase.auth.getUser()).data.user?.id || null
          }])
          .select()
          .single();

        if (receiptError) {
          console.error('Receipt link failed:', receiptError);
          // Clean up customer_file and storage
          await supabase.from('customer_files').delete().eq('id', fileRecord.id);
          await supabase.storage.from('customer-files').remove([filePath]);
          toast.error(`Failed to link receipt for ${file.name}`);
          continue;
        }

        uploadedFiles.push({ receipt: receiptRecord, file: fileRecord });

        // Log activity (don't break if it fails)
        try {
          const payment = payments.find(p => p.id === paymentId);
          if (payment?.jobs?.customer_id) {
            await supabase.rpc('log_customer_activity', {
              p_customer_id: payment.jobs.customer_id,
              p_event_type: 'payment.receipt_uploaded',
              p_event_title: 'Payment receipt uploaded',
              p_event_description: `Receipt uploaded: ${file.name}`,
              p_event_category: 'payments',
              p_related_type: 'payment',
              p_related_id: paymentId,
              p_severity: 'info',
              p_event_data: {
                file_name: file.name,
                customer_file_id: fileRecord.id,
                mime_type: file.type || null,
                size_bytes: file.size || null
              }
            });
          }
        } catch (logError) {
          console.warn('Failed to log receipt upload activity:', logError);
        }
      }

      if (uploadedFiles.length > 0) {
        toast.success(`Uploaded ${uploadedFiles.length} receipt(s)`);
        await fetchPaymentReceipts();
        await fetchPayments(); // Refresh to update any UI that depends on payment data
      }

      setReceiptUploadDrawer({ open: false, paymentId: null, customerId: null });
    } catch (error) {
      console.error('Error uploading receipts:', error);
      toast.error('Failed to upload receipts');
    } finally {
      setReceiptUploadLoading(false);
    }
  };

  // View receipt (preview or download)
  const handleViewReceipt = async (receipt) => {
    const customerFile = receipt.customer_files;
    if (!customerFile) return;

    try {
      // Get signed URL
      const { data, error } = await supabase.storage
        .from('customer-files')
        .createSignedUrl(customerFile.file_path, 3600); // 1 hour expiry

      if (error) throw error;

      // Check if it's an image
      const isImage = customerFile.mime_type?.startsWith('image/');
      
      if (isImage) {
        // Open in preview modal
        setReceiptPreviewModal({ open: true, file: customerFile, url: data.signedUrl });
      } else {
        // Download directly
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      console.error('Error viewing receipt:', err);
      toast.error('Failed to open receipt');
    }
  };

  // Download receipt
  const handleDownloadReceipt = async (receipt) => {
    const customerFile = receipt.customer_files;
    if (!customerFile) return;

    try {
      const { data, error } = await supabase.storage
        .from('customer-files')
        .createSignedUrl(customerFile.file_path, 3600);

      if (error) throw error;

      // Trigger download
      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = customerFile.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading receipt:', err);
      toast.error('Failed to download receipt');
    }
  };

  // Delete receipt link (and optionally the file)
  const handleDeleteReceipt = async (receipt) => {
    if (supportMode) {
      toast.error("Receipt deletions are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Receipt deletions are disabled due to billing status.");
      return;
    }
    
    const confirmed = await confirm({
      title: 'Remove receipt?',
      message: 'This will remove the link between the payment and receipt. The file will remain in customer files unless you delete it separately.',
      confirmText: 'Remove',
      confirmVariant: 'danger'
    });

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('payment_receipts')
        .delete()
        .eq('id', receipt.id);

      if (error) throw error;

      // Log activity
      try {
        const payment = payments.find(p => p.id === receipt.payment_id);
        if (payment?.jobs?.customer_id) {
          await supabase.rpc('log_customer_activity', {
            p_customer_id: payment.jobs.customer_id,
            p_event_type: 'payment.receipt_unlinked',
            p_event_title: 'Payment receipt unlinked',
            p_event_description: `Receipt unlinked from payment`,
            p_event_category: 'payments',
            p_related_type: 'payment',
            p_related_id: receipt.payment_id,
            p_severity: 'warning',
            p_event_data: {
              customer_file_id: receipt.customer_file_id
            }
          });
        }
      } catch (logError) {
        console.warn('Failed to log receipt unlink activity:', logError);
      }

      toast.success('Receipt removed');
      await fetchPaymentReceipts();
    } catch (err) {
      console.error('Error deleting receipt:', err);
      toast.error('Failed to remove receipt');
    }
  };

  // Get distinct payment methods from data
  const distinctMethods = useMemo(() => {
    const methods = new Set();
    payments.forEach(p => {
      if (p.payment_method) {
        methods.add(p.payment_method);
      }
    });
    return Array.from(methods).sort();
  }, [payments]);

  // Get staff name helper
  const getStaffName = (userId) => {
    if (!userId) return '—';
    const idStr = String(userId);
    const profile = profilesById[idStr];
    return profile?.name || '—';
  };

  // Filtered and sorted payments
  const filtered = useMemo(() => {
    let result = [...payments];

    // Status filter
    if (statusFilter === 'posted') {
      result = result.filter(p => p.status === 'posted');
    } else if (statusFilter === 'voided') {
      result = result.filter(p => p.status === 'voided');
    }

    // Method filter
    if (methodFilter !== 'all') {
      result = result.filter(p => 
        p.payment_method?.toLowerCase() === methodFilter.toLowerCase()
      );
    }

    // Date range filter
    if (dateStart) {
      try {
        const startDate = new Date(dateStart);
        if (isNaN(startDate.getTime())) {
          console.warn('Invalid dateStart:', dateStart);
        } else {
          startDate.setHours(0, 0, 0, 0);
          result = result.filter(p => {
            const paidAt = p.paid_at ? new Date(p.paid_at) : (p.date_paid ? new Date(p.date_paid) : null);
            if (!paidAt || isNaN(paidAt.getTime())) return false;
            return paidAt >= startDate;
          });
        }
      } catch (e) {
        console.error('Error parsing dateStart:', e);
      }
    }
    if (dateEnd) {
      try {
        const endDate = new Date(dateEnd);
        if (isNaN(endDate.getTime())) {
          console.warn('Invalid dateEnd:', dateEnd);
        } else {
          endDate.setHours(23, 59, 59, 999);
          result = result.filter(p => {
            const paidAt = p.paid_at ? new Date(p.paid_at) : (p.date_paid ? new Date(p.date_paid) : null);
            if (!paidAt || isNaN(paidAt.getTime())) return false;
            return paidAt <= endDate;
          });
        }
      } catch (e) {
        console.error('Error parsing dateEnd:', e);
      }
    }

    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase().trim();
      result = result.filter(p => {
        const customerName = p.jobs?.customers?.full_name || '';
        const jobService = p.jobs?.services_performed || '';
        const notes = p.notes || '';
        const externalRef = p.external_ref || '';
        const receiptNumber = p.receipt_number || '';
        
        return customerName.toLowerCase().includes(search) ||
               jobService.toLowerCase().includes(search) ||
               notes.toLowerCase().includes(search) ||
               externalRef.toLowerCase().includes(search) ||
               receiptNumber.toLowerCase().includes(search);
      });
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'paid_at') {
        const aDate = a.paid_at ? new Date(a.paid_at) : (a.date_paid ? new Date(a.date_paid) : new Date(0));
        const bDate = b.paid_at ? new Date(b.paid_at) : (b.date_paid ? new Date(b.date_paid) : new Date(0));
        return sortAsc ? aDate - bDate : bDate - aDate;
      } else if (sortBy === 'amount') {
        const aAmount = Number(a.amount) || 0;
        const bAmount = Number(b.amount) || 0;
        return sortAsc ? aAmount - bAmount : bAmount - aAmount;
      }
      return 0;
    });

    return result;
  }, [payments, statusFilter, methodFilter, dateStart, dateEnd, searchTerm, sortBy, sortAsc]);

  // KPIs
  const kpis = useMemo(() => {
    const posted = filtered.filter(p => p.status === 'posted');
    const voided = filtered.filter(p => p.status === 'voided');
    
    const totalCollected = posted.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const voidedTotal = voided.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    
    // By Method breakdown (posted only)
    const byMethod = {};
    distinctMethods.forEach(method => {
      byMethod[method] = posted
        .filter(p => p.payment_method?.toLowerCase() === method.toLowerCase())
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    });
    
    return {
      totalCollected,
      voidedTotal,
      byMethod
    };
  }, [filtered, distinctMethods]);

  // Compute Unpaid Total (company-wide, similar to customer KPIs)
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  
  useEffect(() => {
    if (!companyId) return;
    
    const computeUnpaid = async () => {
      setUnpaidLoading(true);
      try {
        // Fetch jobs and payments (company-wide)
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('id, job_cost, status')
          .eq('company_id', companyId)
          .neq('status', 'Canceled');
        
        if (jobsError) throw jobsError;
        
        const jobIds = (jobsData || []).map(j => j.id);
        let paymentsByJob = {};
        
        if (jobIds.length > 0) {
          const { data: paymentsData, error: paymentsError } = await supabase
            .from('payments')
            .select('job_id, amount, status')
            .in('job_id', jobIds)
            .eq('status', 'posted');
          
          if (paymentsError) throw paymentsError;
          
          (paymentsData || []).forEach(pmt => {
            if (!paymentsByJob[pmt.job_id]) paymentsByJob[pmt.job_id] = 0;
            paymentsByJob[pmt.job_id] += Number(pmt.amount) || 0;
          });
        }
        
        // Calculate unpaid total
        const unpaid = (jobsData || []).reduce((sum, job) => {
          const jobCost = Number(job.job_cost) || 0;
          const paid = paymentsByJob[job.id] || 0;
          const outstanding = Math.max(0, jobCost - paid);
          return sum + outstanding;
        }, 0);
        
        setUnpaidTotal(unpaid);
      } catch (err) {
        console.warn('Error computing unpaid total:', err);
        setUnpaidTotal(0);
      } finally {
        setUnpaidLoading(false);
      }
    };
    
    computeUnpaid();
  }, [companyId, payments]); // Recompute when payments change

  const handleVoidPayment = async (paymentId) => {
    // Find payment details for display
    const payment = payments.find(p => p.id === paymentId);
    
    setPendingVoidPaymentId(paymentId);
    setVoidReason("");
    setVoidModalOpen(true);
  };

  const handleVoidConfirm = async () => {
    if (supportMode) {
      toast.error("Payment actions are disabled in support mode.");
      setVoidModalOpen(false);
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Payment actions are disabled due to billing status.");
      setVoidModalOpen(false);
      return;
    }
    if (!pendingVoidPaymentId || !voidReason.trim()) return;

    setVoidLoading(true);

    const { error } = await supabase.rpc('void_payment', {
      p_payment_id: pendingVoidPaymentId,
      p_reason: voidReason.trim()
    });

    setVoidLoading(false);

    if (error) {
      // Handle specific error cases
      if (error.message?.includes('PAYMENT_ALREADY_VOIDED') || error.message?.includes('already voided')) {
        toast.error("This payment has already been voided.");
      } else if (error.message?.includes('REASON_REQUIRED') || error.message?.includes('reason')) {
        toast.error("A reason is required to void a payment.");
      } else if (error.message?.includes('ADMIN_ONLY') || error.message?.includes('admin')) {
        toast.error("Only administrators can void payments.");
      } else if (error.message?.includes('PAYMENT_NOT_FOUND')) {
        toast.error("Payment not found.");
      } else {
        toast.error(error.message || "Could not void payment.");
      }
      return;
    }

    setVoidModalOpen(false);
    setVoidReason("");
    setPendingVoidPaymentId(null);

    // Refresh payments list and KPIs
    await fetchPayments();
    toast.success("Payment voided successfully.");
  };

  const handleVoidCancel = () => {
    if (voidLoading) return;
    setVoidModalOpen(false);
    setVoidReason("");
    setPendingVoidPaymentId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Record and manage payments. This is the canonical location for payment recording."
        actions={
          <BillingGuard>
            <Button
              variant="primary"
              onClick={handleOpenRecordPayment}
              className="flex items-center gap-2"
              disabled={supportMode || billingDisabled}
              title={supportMode ? "Payment actions are disabled in support mode" : billingDisabled ? billingReason : "Record a new payment"}
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </Button>
          </BillingGuard>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-green-600" />
            <p className="text-sm font-medium text-slate-600">Total Collected</p>
          </div>
          <p className="text-2xl font-bold text-green-700">
            ${kpis.totalCollected.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Posted payments (filtered)</p>
        </Card>
        
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-red-600" />
            <p className="text-sm font-medium text-slate-600">Voided Total</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            ${kpis.voidedTotal.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Voided payments (filtered)</p>
        </Card>
        
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-orange-600" />
            <p className="text-sm font-medium text-slate-600">Unpaid Total</p>
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {unpaidLoading ? (
              <Loader2 className="h-5 w-5 animate-spin inline" />
            ) : (
              `$${unpaidTotal.toFixed(2)}`
            )}
          </p>
          <p className="text-xs text-slate-500 mt-1">Company-wide outstanding</p>
        </Card>
        
        <Card>
          <p className="text-sm font-medium text-slate-600 mb-2">By Method</p>
          <div className="space-y-1">
            {distinctMethods.length > 0 ? (
              distinctMethods.map((method) => {
                const total = kpis.byMethod[method] || 0;
                return total > 0 ? (
                  <div key={method} className="text-xs text-slate-700">
                    <span className="font-medium">{method}:</span> ${total.toFixed(2)}
                  </div>
                ) : null;
              })
            ) : (
              <p className="text-xs text-slate-500">No payments yet</p>
            )}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          {/* Status Filter */}
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
            >
              <option value="all">All</option>
              <option value="posted">Posted</option>
              <option value="voided">Voided</option>
            </select>
          </div>

          {/* Method Filter */}
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
            >
              <option value="all">All Methods</option>
              {distinctMethods.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
            />
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
            />
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Customer, job, notes, ref..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
              />
            </div>
          </div>

          {/* Sort */}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (sortBy === 'paid_at') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortBy('paid_at');
                  setSortAsc(false);
                }
              }}
              variant={sortBy === 'paid_at' ? 'primary' : 'tertiary'}
              className="text-sm"
            >
              {sortBy === 'paid_at' ? (sortAsc ? '↑ Date' : '↓ Date') : 'Date'}
            </Button>
            <Button
              onClick={() => {
                if (sortBy === 'amount') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortBy('amount');
                  setSortAsc(false);
                }
              }}
              variant={sortBy === 'amount' ? 'primary' : 'tertiary'}
              className="text-sm"
            >
              {sortBy === 'amount' ? (sortAsc ? '↑ Amount' : '↓ Amount') : 'Amount'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
            <Button
              variant="primary"
              onClick={fetchPayments}
              className="mt-2 text-sm"
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <Card>
          <div className="text-center py-10 flex justify-center items-center">
            <Loader2 className="animate-spin mr-2 h-5 w-5" />
            <span>Loading payments...</span>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payments yet"
              description="Record payments for completed jobs with invoices. Use the Record Payment button above or go to Jobs to record payments after generating invoices."
              actionLabel="Go to Jobs"
              onAction={() => navigate('/admin/jobs')}
            />
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>No payments match these filters.</p>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-100 text-slate-900">
                <tr>
                  <th className="py-3 px-4 font-semibold text-sm">Paid At</th>
                  <th className="py-3 px-4 font-semibold text-sm">Customer</th>
                  <th className="py-3 px-4 font-semibold text-sm">Job/Service</th>
                  <th className="py-3 px-4 font-semibold text-sm">Amount</th>
                  <th className="py-3 px-4 font-semibold text-sm">Method</th>
                  <th className="py-3 px-4 font-semibold text-sm">Status</th>
                  <th className="py-3 px-4 font-semibold text-sm">Received By</th>
                  <th className="py-3 px-4 font-semibold text-sm">Notes</th>
                  <th className="py-3 px-4 font-semibold text-sm">Receipt</th>
                  <th className="py-3 px-4 font-semibold text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const receivedById = typeof p.received_by === 'object' ? p.received_by?.id : p.received_by;
                  const createdById = typeof p.created_by === 'object' ? p.created_by?.id : p.created_by;
                  const receivedByName = getStaffName(receivedById || createdById);
                  
                  return (
                    <tr key={p.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4 text-sm">
                        {p.paid_at 
                          ? new Date(p.paid_at).toLocaleDateString() 
                          : p.date_paid 
                            ? new Date(p.date_paid).toLocaleDateString() 
                            : "—"}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {p.jobs?.customers?.id ? (
                          <button
                            onClick={() => navigate(`/admin/customers?customer_id=${p.jobs.customers.id}&tab=overview`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            title="View customer details"
                          >
                            {p.jobs?.customers?.full_name || "Unknown Customer"}
                          </button>
                        ) : (
                          <span>{p.jobs?.customers?.full_name || "Unknown Customer"}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {p.job_id ? (
                          <button
                            onClick={() => navigate(`/admin/jobs?job_id=${p.job_id}`)}
                            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors max-w-xs truncate block"
                            title={p.jobs?.services_performed || 'View job details'}
                          >
                            {p.jobs?.services_performed || "Unknown Job"}
                          </button>
                        ) : (
                          <div className="max-w-xs truncate" title={p.jobs?.services_performed || ''}>
                            {p.jobs?.services_performed || "Unknown Job"}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm font-semibold text-green-700">
                        ${(Number(p.amount) || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-sm capitalize">
                        {p.payment_method || "—"}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === 'voided' 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {p.status || 'posted'}
                        </span>
                        {p.status === 'voided' && p.void_reason && (
                          <div className="text-xs text-slate-500 mt-1" title={p.void_reason}>
                            {p.void_reason.length > 30 ? p.void_reason.substring(0, 30) + '...' : p.void_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {receivedByName}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="max-w-xs truncate" title={p.notes || ''}>
                          {p.notes || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {(() => {
                          const receipts = paymentReceipts[p.id] || [];
                          if (receipts.length === 0) {
                            // Show "Add Receipt" button for admins only
                            return (
                              <BillingGuard>
                                <Button
                                  onClick={() => handleOpenReceiptUpload(p.id, p.jobs?.customer_id)}
                                  variant="tertiary"
                                  className="text-xs flex items-center gap-1"
                                  title={billingDisabled ? billingReason : "Add receipt for this payment"}
                                  disabled={supportMode || billingDisabled}
                                >
                                  <Upload className="h-3 w-3" />
                                  Add
                                </Button>
                              </BillingGuard>
                            );
                          }
                          // Show receipt actions
                          return (
                            <div className="flex items-center gap-1">
                              {receipts.map((receipt, idx) => {
                                const file = receipt.customer_files;
                                const isImage = file?.mime_type?.startsWith('image/');
                                return (
                                  <div key={receipt.id} className="flex items-center gap-1">
                                    {isImage && (
                                  <Button
                                    onClick={() => handleViewReceipt(receipt)}
                                    variant="tertiary"
                                    className="text-xs p-1"
                                    title="Preview receipt"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  onClick={() => handleDownloadReceipt(receipt)}
                                  variant="tertiary"
                                  className="text-xs p-1"
                                  title="Download receipt"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                    {idx === receipts.length - 1 && (
                                      <BillingGuard>
                                        <Button
                                          onClick={() => handleOpenReceiptUpload(p.id, p.jobs?.customer_id)}
                                          variant="tertiary"
                                          className="text-xs p-1"
                                          title={billingDisabled ? billingReason : "Add another receipt for this payment"}
                                          disabled={supportMode || billingDisabled}
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </BillingGuard>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <BillingGuard>
                          <Button
                            onClick={() => handleVoidPayment(p.id)}
                            variant="danger"
                            disabled={supportMode || billingDisabled || p.status !== 'posted'}
                            className="text-xs"
                            title={supportMode ? 'Void payment is disabled in support mode' : billingDisabled ? billingReason : (p.status !== 'posted' ? `Payment is ${p.status || 'not available'} and cannot be voided` : 'Void this payment')}
                          >
                            Void
                          </Button>
                        </BillingGuard>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      
      {/* Record Payment Drawer */}
      <Drawer
        open={recordDrawerOpen}
        title="Record Payment"
        onClose={() => {
          if (!submitting) {
            setRecordDrawerOpen(false);
            setSelectedJobId("");
            setSelectedJob(null);
            setJobSearchTerm("");
            setPaymentForm({
              amount: "",
              method: "Cash",
              notes: "",
              receiptNumber: "",
              externalRef: "",
              receivedBy: ""
            });
            setFormErrors({});
            // Clean up URL params if they exist
            const newParams = new URLSearchParams(searchParams);
            if (newParams.has('jobId') || newParams.has('customerId')) {
              newParams.delete('jobId');
              newParams.delete('customerId');
              setSearchParams(newParams, { replace: true });
            }
          }
        }}
        disableClose={submitting}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={() => {
                if (!submitting) {
                  setRecordDrawerOpen(false);
                  setSelectedJobId("");
                  setSelectedJob(null);
                  setJobSearchTerm("");
                  setPaymentForm({
                    amount: "",
                    method: "Cash",
                    notes: "",
                    receiptNumber: "",
                    externalRef: "",
                    receivedBy: ""
                  });
                  setFormErrors({});
                }
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <BillingGuard>
              <Button
                variant="primary"
                onClick={handleRecordPayment}
                disabled={submitting || billingDisabled}
                title={billingDisabled ? billingReason : undefined}
              >
                {submitting ? "Recording..." : "Record Payment"}
              </Button>
            </BillingGuard>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Job Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Job <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Search jobs by customer or service..."
                value={jobSearchTerm}
                onChange={(e) => {
                  setJobSearchTerm(e.target.value);
                  fetchJobs(e.target.value);
                }}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
                disabled={billingDisabled}
                readOnly={billingDisabled}
              />
              {jobsLoading ? (
                <div className="text-sm text-slate-500 py-2">Loading jobs...</div>
              ) : (
                <select
                  value={selectedJobId}
                  onChange={(e) => handleJobSelect(e.target.value)}
                  className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 ${
                    formErrors.job ? 'border-red-300' : 'border-slate-200'
                  }`}
                  disabled={billingDisabled}
                >
                  <option value="">Select a job...</option>
                  {jobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.customers?.full_name || 'Unknown Customer'} - {job.services_performed || 'No description'} (${(Number(job.job_cost) || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              )}
              {formErrors.job && (
                <p className="text-xs text-red-600">{formErrors.job}</p>
              )}
            </div>
          </div>

          {/* Job Details */}
          {selectedJob && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Job:</span>
                <span className="text-sm text-slate-900">{selectedJob.services_performed || 'No description'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Customer:</span>
                <span className="text-sm text-slate-900">{selectedJob.customers?.full_name || 'Unknown Customer'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Job Total:</span>
                <span className="text-sm font-semibold text-slate-900">${(Number(selectedJob.job_cost) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Total Paid:</span>
                <span className="text-sm text-slate-900">${(jobPayments[selectedJobId]?.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-300 pt-2">
                <span className="text-sm font-semibold text-slate-700">Remaining Balance:</span>
                <span className={`text-sm font-bold ${remainingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  ${remainingBalance.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Payment Amount */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Payment Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance > 0 ? remainingBalance : undefined}
              value={paymentForm.amount}
              onChange={(e) => {
                const val = e.target.value;
                setPaymentForm(prev => ({ ...prev, amount: val }));
                // Clear amount error when user types
                if (formErrors.amount) {
                  setFormErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors.amount;
                    return newErrors;
                  });
                }
              }}
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 ${
                formErrors.amount ? 'border-red-300' : 'border-slate-200'
              }`}
              placeholder="0.00"
              disabled={billingDisabled}
              readOnly={billingDisabled}
            />
            {formErrors.amount && (
              <p className="text-xs text-red-600">{formErrors.amount}</p>
            )}
            {selectedJob && remainingBalance > 0 && (
              <p className="text-xs text-slate-500">
                Maximum: ${remainingBalance.toFixed(2)}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentForm.method}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, method: e.target.value }))}
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 ${
                formErrors.method ? 'border-red-300' : 'border-slate-200'
              }`}
              disabled={billingDisabled}
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Check">Check</option>
              <option value="Zelle">Zelle</option>
              <option value="Stripe">Stripe</option>
            </select>
            {formErrors.method && (
              <p className="text-xs text-red-600">{formErrors.method}</p>
            )}
          </div>

          {/* Received By */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Received By
            </label>
            <select
              value={paymentForm.receivedBy}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, receivedBy: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
              disabled={billingDisabled}
            >
              <option value="">Current user (default)</option>
              {staffProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || 'Unknown'}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Leave blank to use your account as the receiver
            </p>
          </div>

          {/* Receipt Number */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Receipt Number
            </label>
            <input
              type="text"
              value={paymentForm.receiptNumber}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, receiptNumber: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
              placeholder="Leave blank for auto-generated"
              disabled={billingDisabled}
              readOnly={billingDisabled}
            />
            <p className="text-xs text-slate-500">
              Auto-generated if left blank
            </p>
          </div>

          {/* External Reference */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              External Reference
            </label>
            <input
              type="text"
              value={paymentForm.externalRef}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, externalRef: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
              placeholder="Optional reference number"
              disabled={billingDisabled}
              readOnly={billingDisabled}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 resize-y"
              rows={3}
              placeholder="Optional payment notes"
              disabled={billingDisabled}
              readOnly={billingDisabled}
            />
          </div>
        </div>
      </Drawer>

      {/* Receipt Upload Drawer */}
      <Drawer
        open={receiptUploadDrawer.open}
        title="Upload Receipt"
        onClose={() => {
          if (!receiptUploadLoading) {
            setReceiptUploadDrawer({ open: false, paymentId: null, customerId: null });
          }
        }}
        disableClose={receiptUploadLoading}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={() => {
                if (!receiptUploadLoading) {
                  setReceiptUploadDrawer({ open: false, paymentId: null, customerId: null });
                }
              }}
              disabled={receiptUploadLoading}
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Receipt Files
            </label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUploadReceipts(e.target.files);
                }
              }}
              disabled={receiptUploadLoading}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              Supported formats: Images (JPG, PNG, etc.) and PDF files
            </p>
          </div>
          {receiptUploadLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading receipt...
            </div>
          )}
        </div>
      </Drawer>

      {/* Receipt Preview Modal */}
      {receiptPreviewModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setReceiptPreviewModal({ open: false, file: null, url: null })}>
          <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 z-[10000]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {receiptPreviewModal.file?.file_name || 'Receipt Preview'}
              </h3>
              <button
                onClick={() => setReceiptPreviewModal({ open: false, file: null, url: null })}
                className="rounded-md p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              {receiptPreviewModal.url && (
                <img
                  src={receiptPreviewModal.url}
                  alt={receiptPreviewModal.file?.file_name || 'Receipt'}
                  className="max-w-full h-auto rounded"
                />
              )}
            </div>
          </div>
        </div>
      )}
      
      <ConfirmDialog />
      <InputModal
        open={voidModalOpen}
        title="Void Payment?"
        message={(() => {
          if (!pendingVoidPaymentId) {
            return "This keeps history and reverses totals. Reason is required.";
          }
          const payment = payments.find(p => p.id === pendingVoidPaymentId);
          if (!payment) {
            return "This keeps history and reverses totals. Reason is required.";
          }
          const customerName = payment.jobs?.customers?.full_name || 'Unknown';
          const amount = payment.amount ? `$${Number(payment.amount).toFixed(2)}` : 'N/A';
          return (
            <div className="space-y-2">
              <p>This keeps history and reverses totals. Reason is required.</p>
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-sm">
                <p><span className="font-medium">Amount:</span> {amount}</p>
                {customerName !== 'Unknown' && (
                  <p><span className="font-medium">Customer:</span> {customerName}</p>
                )}
                {payment.jobs?.services_performed && (
                  <p><span className="font-medium">Job:</span> {payment.jobs.services_performed}</p>
                )}
              </div>
            </div>
          );
        })()}
        label="Reason"
        placeholder="Enter reason for voiding (required)"
        value={voidReason}
        onChange={setVoidReason}
        confirmText="Void Payment"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleVoidConfirm}
        onCancel={handleVoidCancel}
        loading={voidLoading}
      />
    </div>
  );
}
