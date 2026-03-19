import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import useCompanySettings from '../../hooks/useCompanySettings';
import { useBrand } from '../../context/BrandContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import JobProgressStepper from '../../components/crew/JobProgressStepper';
import JobNextActionCallout from '../../components/crew/JobNextActionCallout';
import JobPhotoPanel from '../../components/crew/JobPhotoPanel';
import { getNextAction } from '../../utils/crewNextAction';
import toast from 'react-hot-toast';
import { userCanAccessJob } from '../../utils/teamAccess';
import { triggerEmailProcessing } from '../../utils/emailQueue';
import { RefreshCw } from 'lucide-react';

export default function CrewJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const { brand } = useBrand();
  const primaryColor = brand?.primaryColor || settings?.primary_color || '#2563eb';
  const secondaryColor = brand?.secondaryColor || brand?.primaryColor || primaryColor;
  const crewLabel = settings?.crew_label || 'Crew';

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobPayments, setJobPayments] = useState({ total: 0, records: [] });
  const [jobImages, setJobImages] = useState({ before: null, after: null });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: '',
    notes: '',
    externalRef: ''
  });
  const [overpaymentWarning, setOverpaymentWarning] = useState('');
  const [jobUpdated, setJobUpdated] = useState(false);
  const subscriptionRef = useRef(null);
  const [elapsedTime, setElapsedTime] = useState(null);
  const [jobNotes, setJobNotes] = useState([]);
  const [jobFlags, setJobFlags] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [flagForm, setFlagForm] = useState({
    category: 'other',
    severity: 'medium',
    message: ''
  });
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);

  // Refs for scrolling to steps
  const step1Ref = useRef(null);
  const step2Ref = useRef(null);
  const step3Ref = useRef(null);
  const step4Ref = useRef(null);

  // Update elapsed time for in-progress jobs
  useEffect(() => {
    if (!job || !job.started_at || job.completed_at) {
      setElapsedTime(null);
      return;
    }

    const updateElapsed = () => {
      const start = new Date(job.started_at);
      const now = new Date();
      const diffMs = now - start;
      const diffSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;
      
      if (hours > 0) {
        setElapsedTime(`${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
        setElapsedTime(`${minutes}:${String(seconds).padStart(2, '0')}`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000); // Update every second

    return () => clearInterval(interval);
  }, [job?.started_at, job?.completed_at]);

  useEffect(() => {
    loadJob();
    
    // Set up realtime subscription for this specific job
    const channel = supabase
      .channel(`job-detail-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${id}`
        },
        () => {
          // Job was updated - show banner
          setJobUpdated(true);
        }
      )
      .subscribe();
    
    subscriptionRef.current = channel;
    
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [id]);

  // Auto-scroll to first incomplete step
  useEffect(() => {
    if (!job || loading) return;

    const hasBefore = !!job.before_image;
    const hasAfter = !!job.after_image;
    const isCompleted = job.status === 'Completed';

    setTimeout(() => {
      if (!hasBefore && step1Ref.current) {
        step1Ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (!hasAfter && step2Ref.current) {
        step2Ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (!isCompleted && step4Ref.current) {
        step4Ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  }, [job, loading]);

  const loadJob = async () => {
    setLoading(true);
    try {
      // Load job with customer info
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select(`
          *,
          started_at,
          completed_at,
          customer:customers(full_name, email, phone, address)
        `)
        .eq('id', id)
        .single();

      if (jobError || !jobData) {
        toast.error('Job not found.');
        navigate('/crew/jobs');
        return;
      }

      // Verify access
      const canAccess = await userCanAccessJob(supabase, jobData);
      if (!canAccess) {
        toast.error('You do not have permission to view this job.');
        navigate('/crew/jobs');
        return;
      }

      setJob(jobData);
      setJobUpdated(false); // Clear update banner when job is refreshed

      // Load payments - filter by status='posted' and voided_at IS NULL
      const { data: paymentsData, error: payError } = await supabase
        .from('payments')
        .select('id, amount, payment_method, notes, paid_at, date_paid, status, voided_at, external_ref')
        .eq('job_id', id)
        .eq('status', 'posted')
        .is('voided_at', null)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('date_paid', { ascending: false })
        .order('id', { ascending: false });

      if (payError) {
        console.error('Error loading payments:', payError);
        toast.error('Failed to load payments');
        // Set empty payments on error to prevent crashes
        setJobPayments({ total: 0, records: [] });
      } else if (paymentsData) {
        const total = paymentsData.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        setJobPayments({ total, records: paymentsData });
      } else {
        // No error but no data - set empty
        setJobPayments({ total: 0, records: [] });
      }
    } catch (err) {
      console.error('Error loading job:', err);
      toast.error('Could not load job.');
    } finally {
      setLoading(false);
    }
  };

  const extractStoragePath = (url) => {
    if (!url) return null;
    const parts = url.split('/storage/v1/object/public/job-images/');
    return parts.length > 1 ? parts[1] : null;
  };

  const handleUploadBefore = async () => {
    if (!job || !jobImages.before || !(jobImages.before instanceof File)) {
      toast.error('Please select a before photo first.');
      return;
    }

    setUploadingBefore(true);
    try {
      if (job?.before_image) {
        const oldPath = extractStoragePath(job.before_image);
        if (oldPath) await supabase.storage.from('job-images').remove([oldPath]);
      }

      const { data, error } = await supabase.storage
        .from('job-images')
        .upload(`before/${Date.now()}-${jobImages.before.name}`, jobImages.before);

      if (error) {
        toast.error('Could not upload before image.');
        return;
      }

      const beforeImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-images/${data.path}`;

      const { error: updateError } = await supabase
        .from('jobs')
        .update({ before_image: beforeImageUrl })
        .eq('id', id);

      if (updateError) {
        toast.error('Could not save before image.');
        return;
      }

      toast.success('Before photo uploaded');
      setJobImages(prev => ({ ...prev, before: null }));
      loadJob();
    } finally {
      setUploadingBefore(false);
    }
  };

  const handleUploadAfter = async () => {
    if (!job || !jobImages.after || !(jobImages.after instanceof File)) {
      toast.error('Please select an after photo first.');
      return;
    }

    setUploadingAfter(true);
    try {
      if (job?.after_image) {
        const oldPath = extractStoragePath(job.after_image);
        if (oldPath) await supabase.storage.from('job-images').remove([oldPath]);
      }

      const { data, error } = await supabase.storage
        .from('job-images')
        .upload(`after/${Date.now()}-${jobImages.after.name}`, jobImages.after);

      if (error) {
        toast.error('Could not upload after image.');
        return;
      }

      const afterImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-images/${data.path}`;

      const { error: updateError } = await supabase
        .from('jobs')
        .update({ after_image: afterImageUrl })
        .eq('id', id);

      if (updateError) {
        toast.error('Could not save after image.');
        return;
      }

      toast.success('After photo uploaded');
      setJobImages(prev => ({ ...prev, after: null }));
      loadJob();
    } finally {
      setUploadingAfter(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!job) return;

    const canAccess = await userCanAccessJob(supabase, job);
    if (!canAccess) {
      toast.error('You do not have permission to complete this job.');
      return;
    }

    let beforeImageUrl = job?.before_image || null;
    let afterImageUrl = job?.after_image || null;

    // Upload before image if new file selected
    if (jobImages.before && jobImages.before instanceof File) {
      if (job?.before_image) {
        const oldPath = extractStoragePath(job.before_image);
        if (oldPath) await supabase.storage.from('job-images').remove([oldPath]);
      }
      const { data, error } = await supabase.storage
        .from('job-images')
        .upload(`before/${Date.now()}-${jobImages.before.name}`, jobImages.before);
      if (error) {
        toast.error('Could not upload before image.');
        return;
      }
      beforeImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-images/${data.path}`;
    }

    // Upload after image if new file selected
    if (jobImages.after && jobImages.after instanceof File) {
      if (job?.after_image) {
        const oldPath = extractStoragePath(job.after_image);
        if (oldPath) await supabase.storage.from('job-images').remove([oldPath]);
      }
      const { data, error } = await supabase.storage
        .from('job-images')
        .upload(`after/${Date.now()}-${jobImages.after.name}`, jobImages.after);
      if (error) {
        toast.error('Could not upload after image.');
        return;
      }
      afterImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-images/${data.path}`;
    }

    const { data: updatedJob, error } = await supabase
      .from('jobs')
      .update({ status: 'Completed', before_image: beforeImageUrl, after_image: afterImageUrl })
      .eq('id', id)
      .select('customer_id, services_performed, job_cost')
      .single();

    if (error) {
      toast.error('Could not complete job.');
      return;
    }

    // Log job completed activity
    if (updatedJob?.customer_id) {
      try {
        await supabase.rpc('log_customer_activity', {
          p_customer_id: updatedJob.customer_id,
          p_event_type: 'job.completed',
          p_event_title: 'Job completed',
          p_event_description: updatedJob.services_performed || 'Job marked as completed',
          p_related_id: id,
          p_event_data: {
            job_id: id,
            status: 'Completed',
            job_cost: updatedJob.job_cost
          },
          p_event_category: 'jobs',
          p_related_type: 'job',
          p_severity: 'success'
        });
      } catch (logError) {
        console.warn('Failed to log job completed activity:', logError);
      }
    }

    // Queue job completed notification email to customer
    const customerEmail = job?.customer?.email;
    if (customerEmail && job?.company_id) {
      try {
        const brandName = settings?.display_name || 'Your Service Provider';
        const customerName = job?.customer?.full_name || 'Valued Customer';
        const servicePerformed = updatedJob.services_performed || job?.services_performed || 'Service';
        const completionDate = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const jobCost = updatedJob.job_cost ?? job?.job_cost ?? 0;

        const subject = `${brandName}: Your service has been completed`;
        
        const textContent = `Hi ${customerName},

Great news! Your service has been completed.

Service: ${servicePerformed}
Completed on: ${completionDate}
${jobCost > 0 ? `Amount: $${Number(jobCost).toFixed(2)}` : ''}

Thank you for choosing ${brandName}. We appreciate your business!

If you have any questions about the service, please don't hesitate to reach out.

Best regards,
${brandName}`;

        const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  <p>Hi ${customerName},</p>
  <p>Great news! Your service has been completed.</p>
  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${servicePerformed}</p>
    <p style="margin: 0 0 8px 0;"><strong>Completed on:</strong> ${completionDate}</p>
    ${jobCost > 0 ? `<p style="margin: 0;"><strong>Amount:</strong> $${Number(jobCost).toFixed(2)}</p>` : ''}
  </div>
  <p>Thank you for choosing ${brandName}. We appreciate your business!</p>
  <p>If you have any questions about the service, please don't hesitate to reach out.</p>
  <p>Best regards,<br>${brandName}</p>
</div>
        `.trim();

        await supabase.rpc('enqueue_email', {
          p_company_id: job.company_id,
          p_message_type: 'job_completed',
          p_to_email: customerEmail,
          p_subject: subject,
          p_payload: {
            job_id: id,
            customer_id: updatedJob.customer_id,
            customer_name: customerName,
            service_performed: servicePerformed,
            completion_date: completionDate,
            job_cost: jobCost,
            brand_name: brandName,
          },
          p_html_content: htmlContent,
          p_text_content: textContent,
          p_job_id: id,
          p_customer_id: updatedJob.customer_id,
        });
        triggerEmailProcessing();
      } catch (emailError) {
        console.warn('Failed to queue job completed email (non-fatal):', emailError);
      }
    }

    toast.success('Job marked as completed!');
    loadJob();
  };

  const handleStartSession = async () => {
    if (!job) return;

    try {
      const { data, error } = await supabase.rpc('start_job_session', {
        p_job_id: job.id
      });

      if (error) {
        if (error.message?.includes('JOB_ALREADY_COMPLETED')) {
          toast.error('Cannot start a completed job');
        } else {
          toast.error('Could not start job session');
          console.error('Error starting session:', error);
        }
        return;
      }

      toast.success('Job session started');
      loadJob(); // Reload to get updated started_at
    } catch (err) {
      toast.error('Failed to start job session');
      console.error('Error starting session:', err);
    }
  };

  const handleStopSession = async () => {
    if (!job) return;

    try {
      const { data, error } = await supabase.rpc('stop_job_session', {
        p_job_id: job.id
      });

      if (error) {
        if (error.message?.includes('PHOTOS_REQUIRED')) {
          toast.error('Before and after photos are required to complete the job');
        } else if (error.message?.includes('JOB_NOT_ASSIGNED_TO_TEAM')) {
          toast.error('You do not have permission to complete this job');
        } else {
          toast.error('Could not complete job session');
          console.error('Error stopping session:', error);
        }
        return;
      }

      toast.success('Job session completed');
      loadJob(); // Reload to get updated completed_at
    } catch (err) {
      toast.error('Failed to complete job session');
      console.error('Error stopping session:', err);
    }
  };

  const getSessionDuration = () => {
    if (!job?.started_at || !job?.completed_at) return null;
    const start = new Date(job.started_at);
    const end = new Date(job.completed_at);
    const diffMs = end - start;
    const diffSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const recordPayment = async (e) => {
    // Prevent form submission if called from form
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not logged in.');
      return;
    }

    if (!job) {
      toast.error('Job not found.');
      return;
    }

    const canAccess = await userCanAccessJob(supabase, job);
    if (!canAccess) {
      toast.error('You do not have permission to record payment for this job.');
      return;
    }

    const amount = Number(paymentForm.amount);
    if (!paymentForm.method) {
      toast.error('Please select a payment method.');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }

    const newTotal = totalPaid + amount;
    if (newTotal > Number(job.job_cost)) {
      setOverpaymentWarning(`Overpayment detected: $${newTotal.toFixed(2)} vs billed $${Number(job.job_cost).toFixed(2)}.`);
      toast.error('Payment exceeds job total.');
      return;
    } else {
      setOverpaymentWarning('');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.company_id) {
      toast.error('Unable to record payment – company not found.');
      console.error('Profile error:', profileError);
      return;
    }

    try {
      // Get invoice_id for this job if invoice exists (for automatic balance sync)
      let invoiceId = null;
      try {
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('id')
          .eq('job_id', id)
          .maybeSingle();
        invoiceId = invoiceData?.id || null;
      } catch (invoiceError) {
        // Invoice might not exist - that's ok, continue without invoice_id
        console.debug('No invoice found for job:', id);
      }

      const { data, error } = await supabase.rpc('record_payment', {
        p_job_id: id,
        p_amount: amount,
        p_method: paymentForm.method,
        p_notes: paymentForm.notes?.trim() || null,
        p_external_ref: paymentForm.externalRef?.trim() || null,
        p_invoice_id: invoiceId
      });

      if (error) {
        console.error('Payment RPC error:', error);
        
        if (error?.message?.includes('OVERPAYMENT')) {
          toast.error('Payment exceeds remaining balance. This attempt was logged.');
          return;
        }
        if (error?.message?.includes('forbidden_job_not_assigned_to_team') || error?.code === 'P0001') {
          toast.error('You do not have permission to record payment for this job. The job must be assigned to your team.');
          return;
        }
        if (error?.message?.includes('AUTH_REQUIRED') || error?.message?.includes('NO_COMPANY')) {
          toast.error('Authentication error. Please refresh and try again.');
          return;
        }
        if (error?.message?.includes('INVALID_AMOUNT')) {
          toast.error('Invalid payment amount.');
          return;
        }
        
        // Generic error with message
        toast.error(error?.message || 'Could not save payment.');
        return;
      }

      // Success - clear form and refresh
      setPaymentForm({ amount: '', method: '', notes: '', externalRef: '' });
      setOverpaymentWarning('');
      toast.success('Payment recorded successfully!');
      
      // Reload job to get updated payments
      await loadJob();
    } catch (err) {
      console.error('Unexpected error recording payment:', err);
      toast.error('An unexpected error occurred. Please try again.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No date';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'No date';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'No date';
    }
  };

  const formatMoney = (amount) => {
    const num = parseFloat(amount || 0);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'No date';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'No date';
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return 'No date';
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      toast.error('Please enter a note');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('crew_add_job_note', {
        p_job_id: id,
        p_note: noteText.trim()
      });

      if (error) {
        console.error('Error adding note:', error);
        if (error.message?.includes('forbidden_job_not_assigned_to_team') || error.message?.includes('JOB_NOT_ASSIGNED_TO_CREW')) {
          toast.error('You do not have permission to add notes for this job.');
        } else {
          toast.error('Could not add note.');
        }
        return;
      }

      toast.success('Note added');
      setNoteText('');
      await loadJob(); // Reload to get updated notes
    } catch (err) {
      console.error('Unexpected error adding note:', err);
      toast.error('An unexpected error occurred.');
    }
  };

  const handleFlagIssue = async () => {
    if (!flagForm.message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('crew_flag_job_issue', {
        p_job_id: id,
        p_category: flagForm.category,
        p_severity: flagForm.severity,
        p_message: flagForm.message.trim()
      });

      if (error) {
        console.error('Error flagging issue:', error);
        if (error.message?.includes('forbidden_job_not_assigned_to_team') || error.message?.includes('JOB_NOT_ASSIGNED_TO_CREW')) {
          toast.error('You do not have permission to flag issues for this job.');
        } else if (error.message?.includes('INVALID_CATEGORY') || error.message?.includes('INVALID_SEVERITY')) {
          toast.error('Invalid category or severity.');
        } else {
          toast.error('Could not flag issue.');
        }
        return;
      }

      toast.success('Issue flagged');
      setFlagForm({ category: 'other', severity: 'medium', message: '' });
      await loadJob(); // Reload to get updated flags
    } catch (err) {
      console.error('Unexpected error flagging issue:', err);
      toast.error('An unexpected error occurred.');
    }
  };

  const openFlags = jobFlags.filter(f => f.status === 'open');
  const severityColors = {
    low: 'bg-yellow-100 text-yellow-800',
    medium: 'bg-orange-100 text-orange-800',
    high: 'bg-red-100 text-red-800'
  };

  // Compute totals once - used by both Job Information and Payment History
  // IMPORTANT: All hooks must be declared BEFORE any early returns to maintain hook order
  const payments = Array.isArray(jobPayments?.records) ? jobPayments.records : [];
  const jobCost = Number(job?.job_cost || 0);
  
  const totalPaid = useMemo(() => {
    // Calculate from posted, non-voided payments
    return payments
      .filter(p => !p.voided_at)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments]);

  const balanceDue = useMemo(() => {
    return Math.max(0, jobCost - totalPaid);
  }, [jobCost, totalPaid]);

  const remainingBalance = balanceDue; // Keep for backward compatibility with existing code
  const hasBefore = !!job?.before_image;
  const hasAfter = !!job?.after_image;
  const isCompleted = job?.status === 'Completed';
  const canMarkComplete = !isCompleted && hasBefore && hasAfter;
  
  // Determine next action and current step
  const nextAction = useMemo(() => {
    return getNextAction(job, jobPayments);
  }, [job, jobPayments]);
  
  const currentStep = useMemo(() => {
    if (isCompleted) return 4;
    if (!hasBefore) return 1;
    if (!hasAfter) return 2;
    if (hasBefore && hasAfter) return 4;
    return 3;
  }, [hasBefore, hasAfter, isCompleted]);
  
  const hasPayment = totalPaid > 0;

  // Early returns AFTER all hooks
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-600">Loading job...</div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  // Determine sticky bar action
  const getStickyAction = () => {
    if (!hasBefore) {
      return {
        primary: 'Upload Before Photos',
        primaryAction: handleUploadBefore,
        primaryDisabled: !jobImages.before || !(jobImages.before instanceof File),
        secondary: null
      };
    }
    if (!hasAfter) {
      return {
        primary: 'Upload After Photos',
        primaryAction: handleUploadAfter,
        primaryDisabled: !jobImages.after || !(jobImages.after instanceof File),
        secondary: null
      };
    }
    if (!isCompleted) {
      return {
        primary: 'Mark Complete',
        primaryAction: handleMarkComplete,
        primaryDisabled: false,
        secondary: remainingBalance > 0 ? 'Record Payment' : null,
        secondaryAction: remainingBalance > 0 ? recordPayment : null,
        secondaryDisabled: remainingBalance <= 0 || !paymentForm.amount || Number(paymentForm.amount) <= 0 || !paymentForm.method
      };
    }
    return {
      primary: remainingBalance > 0 ? 'Record Payment' : null,
      primaryAction: remainingBalance > 0 ? recordPayment : null,
      primaryDisabled: remainingBalance <= 0 || !paymentForm.amount || Number(paymentForm.amount) <= 0 || !paymentForm.method,
      secondary: null
    };
  };

  const stickyAction = getStickyAction();

  return (
    <div className="pb-24">
      <div className="space-y-6">
        {/* Update Banner */}
        {jobUpdated && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-medium">This job was updated</span>
              <span className="text-sm text-blue-600">— tap to refresh</span>
            </div>
            <Button
              onClick={() => {
                setJobUpdated(false);
                loadJob();
              }}
              variant="primary"
              size="sm"
              className="text-sm"
            >
              Refresh
            </Button>
          </div>
        )}
        
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/crew/jobs')}
            className="text-sm text-slate-600 hover:text-slate-900 mb-4"
          >
            ← Back to Jobs
          </button>
          
          {/* Title Row */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                {job.customer?.full_name || 'Job Details'}
              </h1>
              <p className="text-lg text-slate-600">
                {job.services_performed || 'Job'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadJob()}
                disabled={loading}
                className="inline-flex items-center gap-1 px-2 py-1.5 btn-secondary text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh job"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {job.service_date && (
                <div className="text-right">
                  <p className="text-sm text-slate-600">Scheduled</p>
                  <p className="font-medium text-slate-900">{formatDate(job.service_date)}</p>
                </div>
              )}
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                isCompleted 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {isCompleted ? 'Completed' : 'Pending'}
              </div>
            </div>
          </div>
          
          {/* Progress Stepper */}
          <Card className="mb-4">
            <JobProgressStepper
              hasBefore={hasBefore}
              hasAfter={hasAfter}
              hasPayment={hasPayment}
              isCompleted={isCompleted}
              currentStep={currentStep}
            />
          </Card>
          
          {/* Next Action Callout */}
          <JobNextActionCallout
            nextAction={nextAction}
            isCompleted={isCompleted}
            onActionClick={() => {
              if (!hasBefore) {
                step1Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (!hasAfter) {
                step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (remainingBalance > 0) {
                step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (canMarkComplete) {
                step4Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
          />
        </div>

        {/* Job Info Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Job Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-600">Customer</p>
              <p className="font-medium">{job.customer?.full_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Scheduled Date</p>
              <p className="font-medium">{formatDate(job.service_date)}</p>
            </div>
            {/* Session Information */}
            {job.started_at && (
              <div>
                <p className="text-sm text-slate-600">Started At</p>
                <p className="font-medium">
                  {new Date(job.started_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            )}
            {job.completed_at && (
              <div>
                <p className="text-sm text-slate-600">Completed At</p>
                <p className="font-medium">
                  {new Date(job.completed_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            )}
            {job.started_at && job.completed_at && (
              <div>
                <p className="text-sm text-slate-600">Duration</p>
                <p className="font-medium">{getSessionDuration() || 'N/A'}</p>
              </div>
            )}
            {job.started_at && !job.completed_at && elapsedTime && (
              <div>
                <p className="text-sm text-slate-600">Elapsed Time</p>
                <p className="font-medium text-blue-600">{elapsedTime}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-slate-600">Status</p>
              <p className="font-medium">
                {isCompleted ? (
                  <span className="text-green-600">Completed</span>
                ) : (
                  <span className="text-orange-600">Pending</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Paid</p>
              <p className="font-medium">{formatMoney(totalPaid)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Balance Due</p>
              <p className={`font-medium ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatMoney(balanceDue)}
              </p>
            </div>
          </div>

          {/* Session Actions */}
          {!isCompleted && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                {!job.started_at && (
                  <Button
                    onClick={handleStartSession}
                    variant="primary"
                    className="flex-1"
                  >
                    Start Job Session
                  </Button>
                )}
                {job.started_at && !job.completed_at && (
                  <>
                    {!hasBefore && (
                      <Button
                        onClick={() => step1Ref.current?.scrollIntoView({ behavior: 'smooth' })}
                        variant="primary"
                        className="flex-1"
                      >
                        Upload Before Photo
                      </Button>
                    )}
                    {hasBefore && !hasAfter && (
                      <Button
                        onClick={() => step2Ref.current?.scrollIntoView({ behavior: 'smooth' })}
                        variant="primary"
                        className="flex-1"
                      >
                        Upload After Photo
                      </Button>
                    )}
                    {hasBefore && hasAfter && (
                      <Button
                        onClick={handleStopSession}
                        variant="primary"
                        className="flex-1"
                      >
                        Complete Job Session
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Job Checklist */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Job Checklist</h2>
          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-3 rounded ${!hasBefore ? 'bg-amber-50 border-2 border-amber-200' : 'bg-slate-50'}`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold ${
                hasBefore ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
              }`}>
                {hasBefore ? '✓' : '1'}
              </div>
              <div className="flex-1">
                <p className="font-medium">Before Photos {hasBefore ? '✅' : '❌'}</p>
                <p className="text-sm text-slate-600">Required</p>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded ${hasBefore && !hasAfter ? 'bg-amber-50 border-2 border-amber-200' : 'bg-slate-50'}`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold ${
                hasAfter ? 'bg-green-500 text-white' : hasBefore ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-600'
              }`}>
                {hasAfter ? '✓' : '2'}
              </div>
              <div className="flex-1">
                <p className="font-medium">After Photos {hasAfter ? '✅' : '❌'}</p>
                <p className="text-sm text-slate-600">Required</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded bg-slate-50">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold bg-blue-500 text-white">
                3
              </div>
              <div className="flex-1">
                <p className="font-medium">Record Payment</p>
                <p className="text-sm text-slate-600">Optional</p>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded ${canMarkComplete ? 'bg-green-50 border-2 border-green-200' : 'bg-slate-50'}`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold ${
                isCompleted ? 'bg-green-500 text-white' : canMarkComplete ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'
              }`}>
                {isCompleted ? '✓' : '4'}
              </div>
              <div className="flex-1">
                <p className="font-medium">Mark Complete {isCompleted ? '✅' : canMarkComplete ? 'Ready' : '❌'}</p>
                <p className="text-sm text-slate-600">
                  {isCompleted ? 'Completed' : canMarkComplete ? 'Ready to complete' : 'Requires steps 1 & 2'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Photos Section - Side by side on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1: Before Photos */}
          <div ref={step1Ref}>
            <JobPhotoPanel
              label="Before Photos"
              photoUrl={job.before_image}
              selectedFile={jobImages.before}
              onFileSelect={(file) => setJobImages(prev => ({ ...prev, before: file }))}
              onUpload={handleUploadBefore}
              disabled={isCompleted || uploadingBefore}
              uploading={uploadingBefore}
            />
          </div>

          {/* Step 2: After Photos */}
          <div ref={step2Ref}>
            <JobPhotoPanel
              label="After Photos"
              photoUrl={job.after_image}
              selectedFile={jobImages.after}
              onFileSelect={(file) => setJobImages(prev => ({ ...prev, after: file }))}
              onUpload={handleUploadAfter}
              disabled={isCompleted || uploadingAfter}
              uploading={uploadingAfter}
            />
          </div>
        </div>

        {/* Step 3: Record Payment */}
        <div ref={step3Ref}>
          <Card>
            <h2 className="text-xl font-semibold mb-4">Step 3: Record Payment (Optional)</h2>
            
            {/* Payment Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Paid</p>
                <p className="text-lg font-semibold text-slate-900">{formatMoney(totalPaid)}</p>
              </div>
              {jobCost > 0 && (
                <div>
                  <p className="text-sm text-slate-600 mb-1">Balance Due</p>
                  <p className={`text-lg font-semibold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatMoney(balanceDue)}
                  </p>
                </div>
              )}
            </div>
          
          {remainingBalance > 0 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Payment Amount</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Method</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, method: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select Method</option>
                  <option value="Cash">Cash</option>
                  <option value="Check">Check</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  rows="2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Confirmation / Check # (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Zelle confirmation, Check #1028"
                  value={paymentForm.externalRef}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, externalRef: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              {overpaymentWarning && (
                <p className="text-sm text-red-600">{overpaymentWarning}</p>
              )}
              <Button
                onClick={recordPayment}
                variant="primary"
                className="btn-accent"
                disabled={!paymentForm.amount || Number(paymentForm.amount) <= 0 || !paymentForm.method}
              >
                Record Payment
              </Button>
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">Payment complete</p>
            </div>
          )}

            {/* Payment History */}
            {jobPayments.records.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-lg font-semibold mb-4">Payment History</h3>
                <div className="space-y-3">
                  {jobPayments.records.map((payment) => (
                    <div 
                      key={payment.id || `payment-${payment.date_paid}-${payment.amount}`} 
                      className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{formatMoney(payment.amount)}</p>
                          <p className="text-sm text-slate-600 mt-1">
                            {payment.payment_method} • {formatDate(payment.date_paid || payment.paid_at)}
                          </p>
                        </div>
                      </div>
                      {payment.notes && (
                        <p className="text-sm text-slate-700 mt-2">{payment.notes}</p>
                      )}
                      {payment.external_ref && (
                        <p className="text-xs text-slate-500 mt-1">Reference: {payment.external_ref}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Notes & Issues */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Notes & Issues</h2>

          {/* Open Flags Alert */}
          {openFlags.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-600 font-semibold">⚠️ {openFlags.length} Open Issue{openFlags.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {openFlags.map((flag) => (
                  <div key={flag.id} className="p-3 bg-white rounded border border-red-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${severityColors[flag.severity] || severityColors.medium}`}>
                            {flag.severity.toUpperCase()}
                          </span>
                          <span className="text-sm text-slate-600">{flag.category}</span>
                        </div>
                        <p className="text-sm text-slate-900">{flag.message}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatDateTime(flag.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Note */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-2">Add Note</h3>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note about this job..."
              className="w-full border rounded px-3 py-2 mb-2"
              rows="3"
            />
            <Button
              onClick={handleAddNote}
              variant="primary"
              size="sm"
              disabled={!noteText.trim()}
            >
              Add Note
            </Button>
          </div>

          {/* Flag Issue */}
          <div className="mb-6 pb-6 border-b">
            <h3 className="text-lg font-medium mb-2">Flag Issue</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={flagForm.category}
                  onChange={(e) => setFlagForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="access">Access</option>
                  <option value="equipment">Equipment</option>
                  <option value="scope">Scope</option>
                  <option value="safety">Safety</option>
                  <option value="customer">Customer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Severity</label>
                <select
                  value={flagForm.severity}
                  onChange={(e) => setFlagForm(prev => ({ ...prev, severity: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <textarea
                  value={flagForm.message}
                  onChange={(e) => setFlagForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Describe the issue..."
                  className="w-full border rounded px-3 py-2"
                  rows="3"
                />
              </div>
              <Button
                onClick={handleFlagIssue}
                variant="primary"
                size="sm"
                disabled={!flagForm.message.trim()}
              >
                Flag Issue
              </Button>
            </div>
          </div>

          {/* Notes List */}
          {jobNotes.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-3">Notes History</h3>
              <div className="space-y-2">
                {jobNotes.map((note) => (
                  <div key={note.id} className="p-3 bg-slate-50 rounded">
                    <p className="text-sm text-slate-900">{note.note}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatDateTime(note.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 4: Mark Complete */}
        {!isCompleted && (
          <div ref={step4Ref}>
            <Card>
              <h2 className="text-xl font-semibold mb-4">
                Step 4: Mark Complete {canMarkComplete ? 'Ready ✅' : '❌'}
              </h2>
              {canMarkComplete ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                  <p className="text-green-800 font-medium mb-1">
                    All required steps are complete.
                  </p>
                  <p className="text-sm text-green-700">
                    You can mark this job as completed.
                  </p>
                </div>
              ) : (
                <div 
                  className="p-4 rounded-lg mb-4"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--brand-secondary) 10%, white)',
                    borderColor: 'color-mix(in srgb, var(--brand-secondary) 35%, white)',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <p className="font-semibold mb-2" style={{ color: 'var(--brand-secondary, var(--brand-primary))' }}>
                    To complete this job, you still need:
                  </p>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                    {!hasBefore && <li>Before photos</li>}
                    {!hasAfter && <li>After photos</li>}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Sticky Action Bar */}
      {stickyAction.primary && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 p-4">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex-1 text-sm text-slate-600">
              {!hasBefore && 'Upload before photos to continue'}
              {hasBefore && !hasAfter && 'Upload after photos to continue'}
              {hasBefore && hasAfter && !isCompleted && 'Ready to mark complete'}
              {isCompleted && remainingBalance > 0 && 'Record payment to complete'}
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              {stickyAction.secondary && (
                <Button
                  onClick={stickyAction.secondaryAction}
                  variant="secondary"
                  disabled={stickyAction.secondaryDisabled}
                  className="flex-1 sm:flex-none"
                >
                  {stickyAction.secondary}
                </Button>
              )}
              <Button
                onClick={stickyAction.primaryAction}
                variant="primary"
                disabled={stickyAction.primaryDisabled}
                className="flex-1 sm:flex-none min-w-[140px]"
              >
                {stickyAction.primary}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
