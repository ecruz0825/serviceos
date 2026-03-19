import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useUser } from '../../context/UserContext'
import handlePlanLimitError from '../../utils/handlePlanLimitError'
import { generateInvoice } from "../../utils/invoiceGenerator";
import { downloadIcsForJob } from "../../utils/ics";
import useCompanySettings from "../../hooks/useCompanySettings";
import { useBrand } from "../../context/BrandContext";
import { openGCalForJob } from "../../utils/gcal";
import { uploadInvoicePdf } from "../../utils/uploadInvoice";
import { getSignedInvoiceUrl } from "../../utils/signedInvoiceUrl";
import { calculateInvoiceTotals } from "../../lib/invoiceCalculations";
import toast from 'react-hot-toast';
import InvoiceActions from "../../components/InvoiceActions";
import { warnIfMissingColumns, parseSelectString } from '../../utils/schemaGuards';
import { JOB_SELECT_JOBS_ADMIN, INVOICE_SELECT_JOBS_ADMIN } from '../../lib/dbSelects';
import { triggerEmailProcessing } from '../../utils/emailQueue';
import Button from "../../components/ui/Button";
import useConfirm from "../../hooks/useConfirm";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import JobCard from "../../components/jobs/JobCard";
import Drawer from "../../components/ui/Drawer";
import { ClipboardList, Calendar, DollarSign, Image as ImageIcon, StickyNote, FileText, Briefcase } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import PaymentHistory from '../../components/financial/PaymentHistory';
import { formatDate } from '../../utils/dateFormatting';
import { formatCurrencyFixed, formatAmount } from '../../utils/currencyFormatting';
import { logProductEvent } from '../../lib/productEvents';
import usePlanLimits from '../../hooks/usePlanLimits';
import UpgradeLimitModal from '../../components/ui/UpgradeLimitModal';
import { useBillingGuard } from '../../components/ui/BillingGuard';
import BillingGuard from '../../components/ui/BillingGuard';
import LimitCard from '../../components/ui/LimitCard';
import LimitWarningBanner from '../../components/ui/LimitWarningBanner';




export default function JobsAdmin() {
  const { confirm, ConfirmDialog } = useConfirm();
  const { brand } = useBrand();
  const { effectiveCompanyId, supportMode } = useUser();
  const { plan, limits, usage, isLoading: limitsLoading, canCreateJob } = usePlanLimits();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([])
  const [allJobs, setAllJobs] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [feedback, setFeedback] = useState([]);
  const [searchTerm, setSearchTerm] = useState('')
  const [companyId, setCompanyId] = useState(null);
  const [customers, setCustomers] = useState([])
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedCrew, setSelectedCrew] = useState("");
  
  // Helper: Get team display name (always shows team name)
  const getTeamDisplayName = useMemo(() => {
    return (teamId) => {
      if (!teamId) return 'Unassigned';
      const team = teams.find(t => t.id === teamId);
      if (!team) return 'Unknown Team';
      return team.name || 'Unnamed Team';
    };
  }, [teams]);
  
  // Helper: Resolve assignee for a job (team-based only)
  const resolveAssignee = useMemo(() => {
    return (job) => {
      // If assigned_team_id exists, use it
      if (job.assigned_team_id) {
        return getTeamDisplayName(job.assigned_team_id);
      }
      
      // Unassigned
      return 'Unassigned';
    };
  }, [getTeamDisplayName]);
  
  const [loading, setLoading] = useState(false)
  const [paymentsByJob, setPaymentsByJob] = useState({})
  const [scheduleRequests, setScheduleRequests] = useState([])
  const [invoicesByJob, setInvoicesByJob] = useState({})
  const [jobFlags, setJobFlags] = useState([])
  
  // Refs for auto-scrolling to sections
  const schedulingSectionRef = useRef(null)
  const invoiceSectionRef = useRef(null)
  const paymentSectionRef = useRef(null)
  
  // View controls state
  const [density, setDensity] = useState('comfortable') // 'comfortable' | 'compact'
  const [layout, setLayout] = useState('list') // 'list' | 'two-column' | 'three-column'
  const [quickFilter, setQuickFilter] = useState('all') // 'all' | 'pending' | 'completed' | 'upcoming' | 'unassigned'
  const [overdueFilter, setOverdueFilter] = useState(false) // true when filter=overdue is active
  const [hasSyncedUrlFilters, setHasSyncedUrlFilters] = useState(false); // Track if URL filters have been applied
  const { settings } = useCompanySettings();
// Helper with sensible fallbacks
const brandName = settings?.display_name || "Your Company";
const brandAddress = settings?.business_address || "";
const brandFooter = settings?.email_footer || "";
const brandTz = settings?.timezone || "UTC";

const customerLabel = settings?.customer_label || "Customer";
const crewLabel = settings?.crew_label || "Crew";


  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    customer_id: '',
    assigned_team_id: '',
    price: '',
    crew_pay: '',
    status: 'Pending',
    details: '',
    service_date: '',
    scheduled_end_date: '',
    services_performed: '',
    beforeFile: null,
    afterFile: null,
    before_image: null,
    after_image: null,
  })

  // Image preview URLs (for locally selected files)
  const beforePreviewUrl = useMemo(() => {
    if (formData.beforeFile) {
      return URL.createObjectURL(formData.beforeFile);
    }
    return null;
  }, [formData.beforeFile]);
  
  const afterPreviewUrl = useMemo(() => {
    if (formData.afterFile) {
      return URL.createObjectURL(formData.afterFile);
    }
    return null;
  }, [formData.afterFile]);
  
  // Cleanup object URLs on unmount or file change
  useEffect(() => {
    return () => {
      if (beforePreviewUrl) URL.revokeObjectURL(beforePreviewUrl);
      if (afterPreviewUrl) URL.revokeObjectURL(afterPreviewUrl);
    };
  }, [beforePreviewUrl, afterPreviewUrl]);

  // File input refs for custom upload controls
  const beforeFileRef = useRef(null);
  const afterFileRef = useRef(null);

// Initialize company ID from UserContext (supports support mode)
useEffect(() => {
  if (effectiveCompanyId) {
    setCompanyId(effectiveCompanyId);
  }
}, [effectiveCompanyId]);

useEffect(() => {
  const fetchCrewAndTeams = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.company_id) return;

    // Fetch teams (company-scoped)
    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("company_id", profile.company_id)
      .order("name");

    if (teamsError) console.error("Error fetching teams:", teamsError);
    else setTeams(teamsData || []);

    // Fetch team_members (for display purposes, if needed elsewhere)
    if (teamsData && teamsData.length > 0) {
      const teamIds = teamsData.map(t => t.id);
      const { data: teamMembersData, error: teamMembersError } = await supabase
        .from("team_members")
        .select("*, crew_members(id, full_name)")
        .in("team_id", teamIds);

      if (teamMembersError) console.error("Error fetching team members:", teamMembersError);
      else setTeamMembers(teamMembersData || []);
    }
  };

  fetchCrewAndTeams();
}, []);

// Load company name for email/ICS
// Load company name for email/ICS

  useEffect(() => {
    // Only fetch if companyId is available
    if (!companyId) return;

    fetchAllData()

    const channel = supabase
      .channel('jobs-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        () => {
          fetchAllData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_flags' },
        () => {
          fetchAllData() // Refresh to get updated flags
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId])

  // Handle openJobId and job_id query params
  useEffect(() => {
    const openJobId = searchParams.get('openJobId') || searchParams.get('job_id');
    const action = searchParams.get('action'); // schedule, invoice, collect_payment
    if (!openJobId) return;
    
    // Redirect collect_payment actions to PaymentsAdmin
    if (action === 'collect_payment') {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('openJobId');
      newParams.delete('job_id');
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
      navigate(`/admin/payments?jobId=${openJobId}`);
      return;
    }
    
    const openJob = async () => {
      // First, try to find job in loaded list
      let job = allJobs.find(j => j.id === openJobId);
      
      // If not found and we have companyId, fetch it directly
      if (!job && companyId) {
        try {
          const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', openJobId)
            .eq('company_id', companyId)
            .single();
          
          if (error) {
            console.warn('Job not found:', error);
            if (error.code === 'PGRST116') {
              toast.error('Job not found. It may have been deleted.');
            } else {
              toast.error(error.message || 'Job not found');
            }
            // Clear param if job doesn't exist
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('openJobId');
            newParams.delete('job_id');
            newParams.delete('action');
            setSearchParams(newParams, { replace: true });
            return;
          }
          
          // Validate job belongs to company (defense in depth)
          if (data && data.company_id !== companyId) {
            toast.error('Job not found or access denied');
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('openJobId');
            newParams.delete('job_id');
            newParams.delete('action');
            setSearchParams(newParams, { replace: true });
            return;
          }
          
          job = data;
        } catch (err) {
          console.warn('Error fetching job:', err);
          return;
        }
      }
      
      if (job) {
        // Use assigned_team_id if it exists, otherwise leave blank
        const defaultTeamId = job.assigned_team_id || '';
        
        setEditingJob(job)
        setFormData({
          title: job.services_performed || '',
          customer_id: job.customer_id || '',
          assigned_team_id: defaultTeamId,
          price: job.job_cost || '',
          crew_pay: job.crew_pay || '',
          status: job.status || 'Pending',
          details: job.notes || '',
          service_date: job.service_date ? job.service_date.split('T')[0] : '',
          scheduled_end_date: job.scheduled_end_date ? job.scheduled_end_date.split('T')[0] : '',
          services_performed: job.services_performed || '',
          beforeFile: null,
          afterFile: null,
          before_image: job.before_image || null,
          after_image: job.after_image || null,
        })
        setIsFormOpen(true)
        
        // Auto-scroll to relevant section after drawer opens
        if (action) {
          setTimeout(() => {
            let refToScroll = null
            if (action === 'schedule') {
              refToScroll = schedulingSectionRef.current
            } else if (action === 'invoice') {
              refToScroll = invoiceSectionRef.current
            }
            
            if (refToScroll) {
              refToScroll.scrollIntoView({ behavior: 'smooth', block: 'start' })
              // Also focus the first input in that section if it exists
              const firstInput = refToScroll.querySelector('input, select, textarea, button')
              if (firstInput) {
                setTimeout(() => firstInput.focus(), 300)
              }
            }
          }, 100) // Small delay to ensure drawer is rendered
        }
        
        // Clear the query params
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('openJobId');
        newParams.delete('job_id');
        newParams.delete('action');
        setSearchParams(newParams, { replace: true });
      }
    };
    
    // Wait for jobs to load, or proceed if we have companyId to fetch directly
    if (allJobs.length > 0 || companyId) {
      openJob();
    }
  }, [allJobs, companyId, searchParams, setSearchParams])

  // Filter function - must be declared before useEffects that use it
  const applyFilters = useCallback((status, crew, term, sourceJobs = allJobs, quickFilterValue = quickFilter, applyOverdue = overdueFilter) => {
    let filtered = [...sourceJobs];

    // Apply overdue filter first (if active)
    if (applyOverdue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter(job => {
        if (!job.service_date) return false;
        try {
          const serviceDate = new Date(job.service_date);
          if (isNaN(serviceDate.getTime())) {
            console.warn('Invalid service_date for job:', job.id, job.service_date);
            return false;
          }
          serviceDate.setHours(0, 0, 0, 0);
          // Overdue: service_date < today AND status NOT IN ("Completed", "Canceled")
          const statusLower = (job.status || '').toLowerCase();
          return serviceDate < today && 
                 statusLower !== 'completed' && 
                 statusLower !== 'canceled';
        } catch (e) {
          console.error('Error parsing service_date:', e);
          return false;
        }
      });
    }

    // Apply quick filter
    if (quickFilterValue && quickFilterValue !== 'all') {
      if (quickFilterValue === 'pending') {
        filtered = filtered.filter(job => (job.status || '').toLowerCase() === 'pending');
      } else if (quickFilterValue === 'completed') {
        filtered = filtered.filter(job => (job.status || '').toLowerCase() === 'completed');
      } else if (quickFilterValue === 'upcoming') {
        // Upcoming: jobs with service_date in the future
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filtered = filtered.filter(job => {
          if (!job.service_date) return false;
          const serviceDate = new Date(job.service_date);
          serviceDate.setHours(0, 0, 0, 0);
          return serviceDate >= today && (job.status || '').toLowerCase() !== 'completed';
        });
      } else if (quickFilterValue === 'unassigned') {
        // Unassigned: assigned_team_id IS NULL
        filtered = filtered.filter(job => {
          return job.assigned_team_id === null;
        });
      }
    }

    // Apply status filter (from dropdown, overrides quick filter if set)
    if (status) {
      filtered = filtered.filter(
        job => (job.status || '').toLowerCase() === status.toLowerCase()
      );
    }

    // Apply team filter (filters by assigned_team_id)
    if (crew === "unassigned") {
      // Unassigned: assigned_team_id IS NULL
      filtered = filtered.filter(job => job.assigned_team_id === null);
    } else if (crew) {
      filtered = filtered.filter(job => job.assigned_team_id === crew);
    }

    // Apply search filter
    if (term) {
      const lower = term.toLowerCase();
      filtered = filtered.filter(job => {
        const customer = customers.find(c => c.id === job.customer_id);
        const customerName = (customer?.full_name || '—').toLowerCase();
        return (
          (job.services_performed || '').toLowerCase().includes(lower) ||
          customerName.includes(lower)
        );
      });
    }

    setJobs(filtered);
  }, [allJobs, quickFilter, overdueFilter, customers, setJobs]);

  // Handle query params: quickFilter and filter (for dashboard navigation)
  // This is the SINGLE source of truth for URL-based filters
  useEffect(() => {
    if (allJobs.length === 0) return; // Wait for jobs to load
    
    // Parse URL params into local variables (single source of truth)
    const urlQuickFilter = searchParams.get('quickFilter');
    const urlFilter = searchParams.get('filter');
    
    // Determine filter values from URL
    const resolvedQuickFilter = (urlQuickFilter && ['all', 'pending', 'completed', 'upcoming', 'unassigned'].includes(urlQuickFilter))
      ? urlQuickFilter
      : 'all';
    const resolvedOverdue = urlFilter === 'overdue';
    
    // Update state to match URL
    if (quickFilter !== resolvedQuickFilter) {
      setQuickFilter(resolvedQuickFilter);
    }
    if (overdueFilter !== resolvedOverdue) {
      setOverdueFilter(resolvedOverdue);
    }
    
    // Apply filters immediately using URL-derived values (NOT state, which may be stale)
    // Use current values of statusFilter, selectedCrew, searchTerm (user-controlled filters)
    applyFilters(statusFilter, selectedCrew, searchTerm, allJobs, resolvedQuickFilter, resolvedOverdue);
    
    // Mark URL sync as complete
    setHasSyncedUrlFilters(true);
  }, [searchParams, allJobs, statusFilter, selectedCrew, searchTerm, applyFilters, quickFilter, overdueFilter]); // Include all filter values to use current ones

  // Apply filters when quickFilter, overdueFilter, or allJobs changes
  // BUT only after URL sync is complete to avoid overriding URL filters
  useEffect(() => {
    if (allJobs.length === 0) return;
    if (!hasSyncedUrlFilters) return; // Wait for URL sync to complete
    applyFilters(statusFilter, selectedCrew, searchTerm, allJobs, quickFilter, overdueFilter);
  }, [quickFilter, overdueFilter, allJobs, statusFilter, selectedCrew, searchTerm, hasSyncedUrlFilters, applyFilters]);

  // Handle prefillDate and prefillCrewId query params (for quick create from schedule)
  useEffect(() => {
    const prefillDate = searchParams.get('prefillDate');
    const prefillCrewId = searchParams.get('prefillCrewId');
    const openJobId = searchParams.get('openJobId');
    
    // Only handle prefill if no openJobId (don't override manual job opening) and form is not already open
    if (prefillDate && !openJobId && !isFormOpen) {
      setEditingJob(null);
      setFormData({
        title: '',
        customer_id: '',
        assigned_team_id: prefillCrewId || '', // prefillCrewId is now a team_id
        price: '',
        crew_pay: '',
        status: 'Pending',
        details: '',
        service_date: prefillDate,
        scheduled_end_date: prefillDate, // Default to same as start date
        services_performed: '',
        beforeFile: null,
        afterFile: null,
        before_image: null,
        after_image: null,
      });
      setIsFormOpen(true);
      // Clear the query params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('prefillDate');
      newParams.delete('prefillCrewId');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isFormOpen])

  // Helper function to get signed URL for a job's invoice
  async function getInvoiceUrlForJob(job) {
    if (!job?.invoice_path) {
      return null;
    }
    try {
      return await getSignedInvoiceUrl({ invoice_path: job.invoice_path });
    } catch (error) {
      console.error(`Failed to get signed URL for job ${job.id}`, {
        jobId: job.id,
        invoice_path: job.invoice_path,
        error: error.message
      });
      throw error;
    }
  }

  async function fetchAllData() {
  setLoading(true);

  if (!companyId) {
    setLoading(false);
    return;
  }

  const { data: jobsData, error: jobsError } = await supabase
  .from('jobs')
  .select(`
    id,
    services_performed,
    status,
    job_cost,
    crew_pay,
    notes,
    customer_id,
    assigned_team_id,
    service_date,
    scheduled_end_date,
    before_image,
    after_image,
    invoice_path,
    invoice_uploaded_at
  `)
  .eq('company_id', companyId);


  if (jobsError) console.error('Error fetching jobs:', jobsError);
  
  // Schema guardrail: warn if expected columns are missing
  const jobsArray = jobsData || [];
  if (jobsArray.length > 0) {
    const requiredJobColumns = parseSelectString(JOB_SELECT_JOBS_ADMIN);
    warnIfMissingColumns('JobsAdmin.jobs', jobsArray, requiredJobColumns);
  }

  // customers: include address so ICS has a location
const { data: customersData, error: customersError } = await supabase
  .from('customers')
  .select('id, full_name, email, address')
  .eq('company_id', companyId);

  if (customersError) console.error('Error fetching customers:', customersError);


  // 👇 Fetch customer feedback for completed jobs (scoped via job_ids from company-scoped jobs)
  // Only fetch feedback for jobs we already have (which are company-scoped)
  const jobIds = (jobsData || []).map(j => j.id);
  let feedbackData = [];
  if (jobIds.length > 0) {
    const { data: feedbackDataResult, error: feedbackError } = await supabase
      .from('customer_feedback')
      .select('job_id, rating, comment')
      .in('job_id', jobIds);

    if (feedbackError) {
      console.error('Error fetching feedback:', feedbackError);
    } else {
      feedbackData = feedbackDataResult || [];
      setFeedback(feedbackData);
      console.log("🧪 All feedback loaded:", feedbackData);
      console.log("📦 Feedback loaded from Supabase:", feedbackData);
      console.log("🔍 Jobs loaded:", (jobsData || []).map(j => ({
        id: j.id,
        title: j.services_performed
      })));
    }
  } else {
    setFeedback([]);
  }

  // Fetch posted payments for ledger-correct calculations and payment history
  // jobIds are already company-scoped from the jobs query above
  const paymentJobIds = (jobsData || []).map(j => j.id);
  let paymentsData = [];
  if (paymentJobIds.length > 0) {
    const { data: paymentsDataResult } = await supabase
      .from('payments')
      .select('job_id, invoice_id, amount, payment_method, date_paid, paid_at, receipt_number, external_ref, status, received_by, voided_at')
      .in('job_id', paymentJobIds)
      .eq('status', 'posted')
      .eq('company_id', companyId) // Defense-in-depth: explicit company scoping
      .order('paid_at', { ascending: false, nullsFirst: false });
    paymentsData = paymentsDataResult || [];
  }

  // Fetch schedule requests for jobs (open requests only)
  if (paymentJobIds.length > 0) {
    const { data: scheduleRequestsData } = await supabase
      .from('job_schedule_requests')
      .select('id, job_id, requested_date, status')
      .in('job_id', paymentJobIds)
      .eq('status', 'requested');
    
    setScheduleRequests(scheduleRequestsData || []);
  } else {
    setScheduleRequests([]);
  }

  // Fetch job flags (open only) - scoped to company jobs
  if (paymentJobIds.length > 0) {
    const { data: flagsData, error: flagsError } = await supabase
      .from('job_flags')
      .select('id, job_id, status, severity, category, message, created_at')
      .in('job_id', paymentJobIds)
      .eq('company_id', companyId) // Defense-in-depth: explicit company scoping
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    
    if (flagsError) {
      console.error('Error fetching job flags:', flagsError);
      setJobFlags([]);
    } else {
      setJobFlags(flagsData || []);
    }
  } else {
    setJobFlags([]);
  }

  // Fetch invoices for jobs
  if (paymentJobIds.length > 0) {
    const { data: invoicesData, error: invoicesError } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT_JOBS_ADMIN)
      .in('job_id', paymentJobIds);

    if (invoicesError) {
      // If invoices table doesn't exist yet, that's ok (backwards-compatible)
      if (invoicesError.code !== '42P01' && !invoicesError.message.includes('does not exist')) {
        console.error('Error fetching invoices:', invoicesError);
      }
      setInvoicesByJob({});
    } else {
      // Schema guardrail: warn if expected columns are missing
      const invoicesArray = invoicesData || [];
      if (invoicesArray.length > 0) {
        const requiredInvoiceColumns = parseSelectString(INVOICE_SELECT_JOBS_ADMIN);
        warnIfMissingColumns('JobsAdmin.invoices', invoicesArray, requiredInvoiceColumns);
      }
      
      // Build invoicesByJob map
      const invoicesMap = {};
      invoicesArray.forEach(invoice => {
        invoicesMap[invoice.job_id] = invoice;
      });
      setInvoicesByJob(invoicesMap);
    }
  } else {
    setInvoicesByJob({});
  }

  // Build paymentsByJob map with both total and records
  const paymentsMap = {};
  (paymentsData || []).forEach(payment => {
    if (!paymentsMap[payment.job_id]) {
      paymentsMap[payment.job_id] = { total: 0, records: [] };
    }
    paymentsMap[payment.job_id].total += parseFloat(payment.amount || 0);
    paymentsMap[payment.job_id].records.push(payment);
  });
  
  // Collect unique received_by UUIDs across all payment records
  const receivedByIds = [...new Set(
    (paymentsData || [])
      .map(p => {
        // Handle both direct UUID and nested object cases
        const id = typeof p.received_by === 'object' ? p.received_by?.id : p.received_by;
        // Convert to string if not already
        return id ? String(id) : null;
      })
      .filter(id => id !== null && id !== undefined && id !== '' && typeof id === 'string')
  )];

  // Fetch profiles for received_by IDs and build lookup map
  let profilesById = {};
  if (receivedByIds.length > 0) {
    try {
      console.log('[JobsAdmin] Fetching profiles for received_by UUIDs:', receivedByIds.length, receivedByIds);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', receivedByIds);

      if (profilesError) {
        console.error('Error fetching profiles for received_by:', profilesError.message);
        console.error('Profile error details:', profilesError);
      } else {
        console.log('[JobsAdmin] Fetched profiles:', profilesData?.length || 0, profilesData);
        (profilesData || []).forEach(profile => {
          if (profile.id && profile.full_name) {
            // Ensure key is a string for consistent lookup
            profilesById[String(profile.id)] = profile.full_name;
          }
        });
        console.log('[JobsAdmin] Built profilesById map with', Object.keys(profilesById).length, 'entries:', profilesById);
      }
    } catch (profilesErr) {
      console.error('Error fetching profiles:', profilesErr.message);
    }
  } else {
    console.log('[JobsAdmin] No received_by UUIDs found in payments');
  }

  // Decorate each payment record with received_by_name
  Object.keys(paymentsMap).forEach(jobId => {
    paymentsMap[jobId].records = paymentsMap[jobId].records.map(payment => {
      const receivedById = typeof payment.received_by === 'object' ? payment.received_by?.id : payment.received_by;
      const receivedByIdStr = receivedById ? String(receivedById) : null;
      const name = receivedByIdStr ? (profilesById[receivedByIdStr] || null) : null;
      if (receivedByIdStr && !profilesById[receivedByIdStr]) {
        console.log('[JobsAdmin] Missing profile for received_by:', receivedByIdStr, 'Available keys:', Object.keys(profilesById));
      }
      return {
        ...payment,
        received_by_name: name
      };
    });
  });
  
  // Sort each job's payment records by date (paid_at preferred, fallback date_paid), descending
  Object.keys(paymentsMap).forEach(jobId => {
    paymentsMap[jobId].records.sort((a, b) => {
      const dateA = a.paid_at ? new Date(a.paid_at) : (a.date_paid ? new Date(a.date_paid) : new Date(0));
      const dateB = b.paid_at ? new Date(b.paid_at) : (b.date_paid ? new Date(b.date_paid) : new Date(0));
      return dateB - dateA; // descending order
    });
  });
  
  setPaymentsByJob(paymentsMap);

// Get current user's company name (used for ICS/email)

  setAllJobs(jobsData || []);
  setCustomers(customersData || []);
  // Don't apply filters here - let the URL sync effect handle it after allJobs is set
  // This prevents overriding URL-based filters with stale state values
  setLoading(false);
}

  function openNewJobForm() {
    setEditingJob(null)
    setFormData({
      title: '',
      customer_id: '',
      assigned_team_id: '',
      price: '',
      crew_pay: '',
      status: 'Pending',
      details: '',
      service_date: '',
      scheduled_end_date: '',
      services_performed: '',
      beforeFile: null,
      afterFile: null,
      before_image: null,
      after_image: null,
    })
    setIsFormOpen(true)
  }

  function openEditForm(job) {
    setEditingJob(job)
    
    // Use assigned_team_id if it exists, otherwise leave blank
    const defaultTeamId = job.assigned_team_id || '';
    setFormData({
      title: job.services_performed || '',
      customer_id: job.customer_id || '',
      assigned_team_id: defaultTeamId,
      price: job.job_cost || '',
      crew_pay: job.crew_pay || '',
      status: job.status || 'Pending',
      details: job.notes || '',
      service_date: job.service_date ? job.service_date.split('T')[0] : '',
      scheduled_end_date: job.scheduled_end_date ? job.scheduled_end_date.split('T')[0] : '',
      services_performed: job.services_performed || '',
      beforeFile: null,
      afterFile: null,
      before_image: job.before_image || null,
      after_image: job.after_image || null,
    })
    setIsFormOpen(true)
  }
   async function handleInvoiceDownload(job, action = "download") {
  try {
    // Check if invoice_path exists, use signed URL
    if (job.invoice_path) {
      const signedUrl = await getInvoiceUrlForJob(job);
      if (signedUrl) {
        if (action === "view") {
          window.open(signedUrl, "_blank", "noopener");
        } else {
          // Download: fetch and create blob URL for download
          const response = await fetch(signedUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `invoice-${job.id}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        return;
      }
    }

    // No invoice_path: show toast
    toast.error("Generate the invoice first.");
    return;
  } catch (e) {
    console.error("Invoice download/view failed", {
      jobId: job.id,
      invoice_path: job.invoice_path,
      error: e.message,
      stack: e.stack
    });
    toast.error("Could not access invoice. Check console for details.");
  }
}

    async function saveJob(e) {
    e.preventDefault()
    
    if (supportMode) {
      toast.error("Job mutations are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Job mutations are disabled due to billing status.");
      return;
    }
    
    setIsSaving(true)

    try {
      // Proactive limit check (only for new jobs, not edits)
      if (!editingJob && !limitsLoading) {
        if (!canCreateJob) {
          setShowUpgradeModal(true);
          setIsSaving(false);
          return;
        }
      }

      let beforeImageUrl = editingJob?.before_image || null
      let afterImageUrl = editingJob?.after_image || null

      // --- Handle before image upload ---
      if (formData.beforeFile) {
        // Delete old before image if exists
        if (editingJob?.before_image) {
          const oldBeforePath = editingJob.before_image.split('/storage/v1/object/public/job-images/')[1]
          if (oldBeforePath) {
            await supabase.storage.from('job-images').remove([oldBeforePath])
          }
        }

        // Upload new before image
        const { data: beforeUpload, error: beforeError } = await supabase.storage
          .from('job-images')
          .upload(`before/${Date.now()}-${formData.beforeFile.name}`, formData.beforeFile)

        if (beforeError) {
          console.error('Before image upload failed:', beforeError)
          toast.error('Could not upload before image.')
        } else {
          beforeImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-images/${beforeUpload.path}`
        }
      }

      // --- Handle after image upload ---
      if (formData.afterFile) {
        // Delete old after image if exists
        if (editingJob?.after_image) {
          const oldAfterPath = editingJob.after_image.split('/storage/v1/object/public/job-images/')[1]
          if (oldAfterPath) {
            await supabase.storage.from('job-images').remove([oldAfterPath])
          }
        }

        // Upload new after image
        const { data: afterUpload, error: afterError } = await supabase.storage
          .from('job-images')
          .upload(`after/${Date.now()}-${formData.afterFile.name}`, formData.afterFile)

        if (afterError) {
          console.error('After image upload failed:', afterError)
          toast.error('Could not upload after image.')
        } else {
          afterImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/job-images/${afterUpload.path}`
        }
      }

      // Prepare payload
      // Default scheduled_end_date to service_date if not provided
      const endDate = formData.scheduled_end_date || formData.service_date || null;
      
      console.log("Saving job:", formData.assigned_team_id);
      
      const payload = {
        services_performed: formData.services_performed || formData.title,
        service_date: formData.service_date || null,
        scheduled_end_date: endDate,
        customer_id: formData.customer_id || null,
        assigned_team_id: formData.assigned_team_id || null,
        job_cost: parseFloat(formData.price) || 0,
        crew_pay: parseFloat(formData.crew_pay) || 0,
        status: formData.status,
        notes: formData.details,
        before_image: beforeImageUrl,
        after_image: afterImageUrl
      }

      // Update or insert job
      let savedJob;
      if (editingJob) {
        const { data, error } = await supabase.from('jobs').update(payload).eq('id', editingJob.id).select().single();
        if (error) throw error;
        savedJob = data;
        
        // Log job updated
        if (savedJob?.customer_id) {
          try {
            const oldStatus = editingJob.status;
            const newStatus = payload.status;
            const eventType = newStatus === 'Completed' ? 'job.completed' : 
                            newStatus === 'Canceled' ? 'job.canceled' : 'job.updated';
            const severity = newStatus === 'Completed' ? 'success' : 
                           newStatus === 'Canceled' ? 'warning' : 'info';
            
            await supabase.rpc('log_customer_activity', {
              p_customer_id: savedJob.customer_id,
              p_event_type: eventType,
              p_event_title: newStatus === 'Completed' ? 'Job completed' : 
                           newStatus === 'Canceled' ? 'Job canceled' : 'Job updated',
              p_event_description: savedJob.services_performed || 'Job updated',
              p_related_id: savedJob.id,
              p_event_data: { 
                job_id: savedJob.id, 
                status: newStatus,
                old_status: oldStatus,
                job_cost: savedJob.job_cost 
              },
              p_event_category: 'jobs',
              p_related_type: 'job',
              p_severity: severity
            });
          } catch (logError) {
            console.warn('Failed to log job updated activity:', logError);
          }

          // Queue job completed email if status changed to 'Completed'
          if (oldStatus !== 'Completed' && newStatus === 'Completed') {
            try {
              // Get customer email from customers state
              const customer = customers.find(c => c.id === savedJob.customer_id);
              const customerEmail = customer?.email;

              if (customerEmail && companyId) {
                const customerName = customer?.full_name || 'Valued Customer';
                const servicePerformed = savedJob.services_performed || 'Service';
                const completionDate = new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });
                const jobCost = savedJob.job_cost ?? 0;

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
                  p_company_id: companyId,
                  p_message_type: 'job_completed',
                  p_to_email: customerEmail,
                  p_subject: subject,
                  p_payload: {
                    job_id: savedJob.id,
                    customer_id: savedJob.customer_id,
                    customer_name: customerName,
                    service_performed: servicePerformed,
                    completion_date: completionDate,
                    job_cost: jobCost,
                    brand_name: brandName,
                  },
                  p_html_content: htmlContent,
                  p_text_content: textContent,
                  p_job_id: savedJob.id,
                  p_customer_id: savedJob.customer_id,
                });
                triggerEmailProcessing();
              }
            } catch (emailError) {
              console.warn('Failed to queue job completed email (non-fatal):', emailError);
            }
          }

          // Queue crew assignment notification if team changed during edit
          const oldTeamId = editingJob.assigned_team_id || null;
          const newTeamId = savedJob.assigned_team_id || null;
          if (oldTeamId !== newTeamId && newTeamId) {
            try {
              const { data: teamMembersData, error: tmError } = await supabase
                .from('team_members')
                .select('crew_member_id, crew_members(id, full_name, email)')
                .eq('team_id', newTeamId);

              if (!tmError && teamMembersData && teamMembersData.length > 0) {
                const customer = customers.find(c => c.id === savedJob.customer_id);
                const teamName = getTeamDisplayName(newTeamId);
                const serviceDate = savedJob.service_date 
                  ? new Date(savedJob.service_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'Not scheduled';

                for (const tm of teamMembersData) {
                  const crewMember = tm.crew_members;
                  if (!crewMember?.email) continue;

                  const crewMemberName = crewMember.full_name || 'Team Member';
                  const customerName = customer?.full_name || 'Customer';
                  const customerAddress = customer?.address || 'Address not provided';
                  const serviceDescription = savedJob.services_performed || 'Service';

                  const subject = `${brandName}: New job assignment`;
                  
                  const textContent = `Hi ${crewMemberName},

You have been assigned a new job.

Customer: ${customerName}
Service: ${serviceDescription}
Date: ${serviceDate}
Location: ${customerAddress}

Please review the job details in your crew portal.

${brandName}`;

                  const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  <p>Hi ${crewMemberName},</p>
  <p>You have been assigned a new job.</p>
  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Customer:</strong> ${customerName}</p>
    <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${serviceDescription}</p>
    <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${serviceDate}</p>
    <p style="margin: 0;"><strong>Location:</strong> ${customerAddress}</p>
  </div>
  <p>Please review the job details in your crew portal.</p>
  <p>${brandName}</p>
</div>
                  `.trim();

                  try {
                    await supabase.rpc('enqueue_email', {
                      p_company_id: companyId,
                      p_message_type: 'crew_assignment',
                      p_to_email: crewMember.email,
                      p_subject: subject,
                      p_payload: {
                        job_id: savedJob.id,
                        team_id: newTeamId,
                        team_name: teamName,
                        crew_member_id: crewMember.id,
                        crew_member_name: crewMemberName,
                        customer_name: customerName,
                        customer_address: customerAddress,
                        service_description: serviceDescription,
                        service_date: serviceDate,
                        brand_name: brandName,
                      },
                      p_html_content: htmlContent,
                      p_text_content: textContent,
                      p_job_id: savedJob.id,
                      p_crew_member_id: crewMember.id,
                    });
                  } catch (crewEmailError) {
                    console.warn(`Failed to queue crew assignment email for ${crewMember.email}:`, crewEmailError);
                  }
                }
                triggerEmailProcessing();
              }
            } catch (notifyError) {
              console.warn('Failed to send crew assignment notifications (non-fatal):', notifyError);
            }
          }
        }
      } else {
        const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
        if (error) throw error;
        savedJob = data;
        
        // Log product event: job_created
        logProductEvent('job_created', {
          job_id: savedJob.id,
          customer_id: savedJob.customer_id,
          status: savedJob.status,
          job_cost: savedJob.job_cost,
          assigned_team_id: savedJob.assigned_team_id,
          recurring_job_id: savedJob.recurring_job_id || null
        });
        
        // Log job created
        if (savedJob?.customer_id) {
          try {
            await supabase.rpc('log_customer_activity', {
              p_customer_id: savedJob.customer_id,
              p_event_type: 'job.created',
              p_event_title: 'Job created',
              p_event_description: savedJob.services_performed || 'New job created',
              p_related_id: savedJob.id,
              p_event_data: { 
                job_id: savedJob.id, 
                status: savedJob.status,
                job_cost: savedJob.job_cost 
              },
              p_event_category: 'jobs',
              p_related_type: 'job',
              p_severity: 'success'
            });
          } catch (logError) {
            console.warn('Failed to log job created activity:', logError);
          }
        }

        // Queue crew assignment notification for new job if team is assigned
        if (savedJob.assigned_team_id) {
          try {
            const { data: teamMembersData, error: tmError } = await supabase
              .from('team_members')
              .select('crew_member_id, crew_members(id, full_name, email)')
              .eq('team_id', savedJob.assigned_team_id);

            if (!tmError && teamMembersData && teamMembersData.length > 0) {
              const customer = customers.find(c => c.id === savedJob.customer_id);
              const teamName = getTeamDisplayName(savedJob.assigned_team_id);
              const serviceDate = savedJob.service_date 
                ? new Date(savedJob.service_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                : 'Not scheduled';

              for (const tm of teamMembersData) {
                const crewMember = tm.crew_members;
                if (!crewMember?.email) continue;

                const crewMemberName = crewMember.full_name || 'Team Member';
                const customerName = customer?.full_name || 'Customer';
                const customerAddress = customer?.address || 'Address not provided';
                const serviceDescription = savedJob.services_performed || 'Service';

                const subject = `${brandName}: New job assignment`;
                
                const textContent = `Hi ${crewMemberName},

You have been assigned a new job.

Customer: ${customerName}
Service: ${serviceDescription}
Date: ${serviceDate}
Location: ${customerAddress}

Please review the job details in your crew portal.

${brandName}`;

                const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  <p>Hi ${crewMemberName},</p>
  <p>You have been assigned a new job.</p>
  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Customer:</strong> ${customerName}</p>
    <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${serviceDescription}</p>
    <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${serviceDate}</p>
    <p style="margin: 0;"><strong>Location:</strong> ${customerAddress}</p>
  </div>
  <p>Please review the job details in your crew portal.</p>
  <p>${brandName}</p>
</div>
                `.trim();

                try {
                  await supabase.rpc('enqueue_email', {
                    p_company_id: companyId,
                    p_message_type: 'crew_assignment',
                    p_to_email: crewMember.email,
                    p_subject: subject,
                    p_payload: {
                      job_id: savedJob.id,
                      team_id: savedJob.assigned_team_id,
                      team_name: teamName,
                      crew_member_id: crewMember.id,
                      crew_member_name: crewMemberName,
                      customer_name: customerName,
                      customer_address: customerAddress,
                      service_description: serviceDescription,
                      service_date: serviceDate,
                      brand_name: brandName,
                    },
                    p_html_content: htmlContent,
                    p_text_content: textContent,
                    p_job_id: savedJob.id,
                    p_crew_member_id: crewMember.id,
                  });
                } catch (crewEmailError) {
                  console.warn(`Failed to queue crew assignment email for ${crewMember.email}:`, crewEmailError);
                }
              }
              triggerEmailProcessing();
            }
          } catch (notifyError) {
            console.warn('Failed to send crew assignment notifications (non-fatal):', notifyError);
          }
        }
      }

      setIsFormOpen(false)
      await fetchAllData()
    } catch (error) {
      if (!handlePlanLimitError(error, navigate)) {
        toast.error(error.message || 'Failed to save job');
      }
    } finally {
      setIsSaving(false)
    }
  }
  async function handleGenerateInvoice(job) {
    if (supportMode) {
      toast.error("Invoice generation is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Invoice generation is disabled due to billing status.");
      return;
    }
    try {
      const customer = customers.find(c => c.id === job.customer_id) || null;
      
      // Handle missing customer gracefully
      if (!customer) {
        toast.error('Customer not found for this job. Please update the job.');
        return;
      }

      // Brand from Settings (the values you already surfaced as brandName, brandAddress, etc.)
      const brandData = {
        name: brandName,
        address: brandAddress,
        phone: settings?.support_phone || "",
        email: settings?.support_email || "",
        logo: brand?.logoUrl || null,
        website: "",
      };

      // Get paid info from posted payments
      const paidInfo = paymentsByJob[job.id] || { total: 0, records: [] };

      // 1) Generate PDF in-memory
      const { blob, filename } = await generateInvoice({
        id: job.id,
        customer_name: customer?.full_name,
        customer_email: customer?.email,
        description: job.services_performed,
        completed_at: job.completed_at,
        amount: job.job_cost,
        status: job.status,
        notes: job.notes,
        before_image_url: job.before_image,
        after_image_url: job.after_image,
        company: brandData,
        paid_amount: paidInfo.total, // backward compatibility
        paidInfo: {
          totalPaid: paidInfo.total,
          payments: paidInfo.records
        }
      }, { mode: "blob" });

      // 2) Upload to Supabase Storage (private bucket)
      const { path } = await uploadInvoicePdf({
        companyId,
        jobId: job.id,
        filename,
        blob,
      });

      // 3) Calculate invoice totals
      const { subtotal, tax, total } = calculateInvoiceTotals(job);

      // 4) Create/update invoice row via canonical RPC (idempotent)
      // First, create or get the invoice (this ensures invoice exists before we set pdf_path)
      const { data: invoiceData, error: createInvoiceError } = await supabase.rpc(
        'create_or_get_invoice_for_job',
        {
          p_job_id: job.id,
          p_due_date: null // Can be set later via invoice management
        }
      );

      let invoiceId = null;
      if (createInvoiceError) {
        console.error("Failed to create/get invoice row", {
          jobId: job.id,
          error: createInvoiceError.message
        });
        // Continue - PDF was uploaded successfully, invoice row creation is non-fatal
        // but log it for debugging
      } else {
        invoiceId = invoiceData?.[0]?.id;
        console.log("Invoice row created/retrieved", {
          jobId: job.id,
          invoiceId: invoiceId
        });

        // 4b) Update invoice with PDF path and totals via legacy RPC (for backward compatibility)
        // This updates the existing invoice created above
        if (invoiceId) {
          const { error: updateInvoiceError } = await supabase.rpc(
            'admin_upsert_invoice_for_job',
            {
              p_job_id: job.id,
              p_pdf_path: path,
              p_subtotal: subtotal,
              p_tax: tax,
              p_total: total
            }
          );

          if (updateInvoiceError) {
            console.warn("Failed to update invoice with PDF path (non-fatal)", {
              jobId: job.id,
              invoiceId: invoiceId,
              error: updateInvoiceError.message
            });
          } else {
            // 4c) Send invoice (mark as sent) using lifecycle RPC
            const { error: sendInvoiceError } = await supabase.rpc('send_invoice', {
              p_invoice_id: invoiceId,
              p_pdf_path: path,
              p_due_date: null // Can be set later via invoice management
            });

            if (sendInvoiceError) {
              console.warn("Failed to send invoice (non-fatal)", {
                jobId: job.id,
                invoiceId: invoiceId,
                error: sendInvoiceError.message
              });
            }
          }
        }
      }

      // 5) Update job with invoice_path and invoice_uploaded_at (backward compatibility)
      // Keep this for now to maintain compatibility with existing code that checks job.invoice_path
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          invoice_path: path,
          invoice_uploaded_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (updateError) {
        console.warn("Failed to update job with invoice_path (non-fatal)", {
          jobId: job.id,
          invoice_path: path,
          error: updateError.message
        });
        // Don't throw - invoice row was created successfully
      }

      // Refresh data to get updated invoice_path and invoice row
      await fetchAllData();
      
      // If invoice was created/updated, refetch it to show updated status
      if (invoiceId) {
        try {
          const { data: updatedInvoice } = await supabase
            .from('invoices')
            .select(INVOICE_SELECT_JOBS_ADMIN)
            .eq('id', invoiceId)
            .single();
          
          if (updatedInvoice) {
            // Schema guardrail: warn if expected columns are missing
            const requiredInvoiceColumns = parseSelectString(INVOICE_SELECT_JOBS_ADMIN);
            warnIfMissingColumns('JobsAdmin.invoice.after_generation', [updatedInvoice], requiredInvoiceColumns);
            
            // Update invoicesByJob map
            setInvoicesByJob(prev => ({
              ...prev,
              [job.id]: updatedInvoice
            }));
          }
        } catch (invoiceError) {
          console.warn('Error refetching invoice after generation:', invoiceError);
        }
      }

      // Get signed URL for the newly generated invoice (use the path from upload, not stale job.invoice_path)
      let signedUrl = null;
      try {
        signedUrl = await getSignedInvoiceUrl({ invoice_path: path });
      } catch (urlError) {
        console.error("Failed to get signed URL after invoice generation", {
          jobId: job.id,
          invoice_path: path,
          error: urlError.message
        });
        // Continue - still show success toast without copy action
      }

      // Show toast with optional copy action
      if (signedUrl) {
        toast.custom((t) => (
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
            <span className="text-gray-800 flex-1">Invoice generated.</span>
            <Button
              className="btn-accent"
              onClick={async () => {
                try {
                  // Try modern clipboard API first
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(signedUrl);
                  } else {
                    // Fallback for browsers without clipboard API
                    const textarea = document.createElement("textarea");
                    textarea.value = signedUrl;
                    textarea.style.position = "fixed";
                    textarea.style.opacity = "0";
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                  }
                  toast.success("Invoice link copied.");
                  toast.dismiss(t.id);
                } catch (copyError) {
                  console.error("Failed to copy to clipboard", copyError);
                  toast.error("Could not copy link.");
                }
              }}
            >
              Copy link
            </Button>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        ), {
          duration: 5000,
        });
      } else {
        // Fallback: simple success toast if signed URL failed
        toast.success("Invoice generated.");
      }
    } catch (e) {
      console.error("Invoice generation failed", {
        jobId: job.id,
        invoice_path: job.invoice_path,
        error: e.message,
        stack: e.stack,
        customerId: job.customer_id,
        companyId: companyId
      });
      toast.error("Could not generate/upload invoice. Check console for details.");
    }
  }

  async function handleEmailInvoice(job) {
    try {
      // Check if invoice exists
      if (!job.invoice_path) {
        toast.error("Generate the invoice first.");
        return;
      }

      const customer = customers.find(c => c.id === job.customer_id) || null;
      
      // Handle missing customer gracefully
      if (!customer) {
        toast.error('Customer not found for this job. Please update the job.');
        return;
      }

      // Check if customer has email
      if (!customer.email) {
        toast.error('Customer has no email address. Please update customer details.');
        return;
      }

      // Get invoice record if available
      const invoice = invoicesByJob[job.id] || null;
      const invoiceId = invoice?.id || null;

      // Get signed URL for the invoice PDF
      let pdfUrl = null;
      try {
        pdfUrl = await getInvoiceUrlForJob(job);
      } catch (urlErr) {
        console.warn("Could not get signed invoice URL:", urlErr);
      }

      // Build invoice number (prefer actual invoice_number if available)
      const shortId = job.id ? String(job.id).substring(0, 6).toUpperCase() : "000000";
      const invoiceNumber = invoice?.invoice_number || `INV-${new Date().getFullYear()}-${shortId}`;

      // Build email subject
      const subject = `${brandName} – Invoice ${invoiceNumber}`;

      // Build email content
      const invoiceTotal = invoice?.total ? Number(invoice.total).toFixed(2) : null;
      const balanceDue = invoice?.balance_due ? Number(invoice.balance_due).toFixed(2) : invoiceTotal;
      const dueDate = invoice?.due_date 
        ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;
      const serviceDescription = job.services_performed || 'Services rendered';

      // Build plain text version
      const textLines = [
        `Hi ${customer.full_name || 'there'},`,
        '',
        'Your invoice is ready.',
        '',
        `Invoice: ${invoiceNumber}`,
        `Service: ${serviceDescription}`,
      ];
      if (invoiceTotal) textLines.push(`Amount: $${invoiceTotal}`);
      if (balanceDue && balanceDue !== invoiceTotal) textLines.push(`Balance Due: $${balanceDue}`);
      if (dueDate) textLines.push(`Due Date: ${dueDate}`);
      if (pdfUrl) {
        textLines.push('');
        textLines.push(`View your invoice: ${pdfUrl}`);
      }
      textLines.push('');
      textLines.push('Thank you for your business!');
      textLines.push(brandName);

      const textContent = textLines.join('\n');

      // Build HTML version
      const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  <p>Hi ${customer.full_name || 'there'},</p>
  <p>Your invoice is ready.</p>
  <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #2563eb;">
    <p style="margin: 5px 0;"><strong>Invoice:</strong> ${invoiceNumber}</p>
    <p style="margin: 5px 0;"><strong>Service:</strong> ${serviceDescription}</p>
    ${invoiceTotal ? `<p style="margin: 5px 0;"><strong>Amount:</strong> $${invoiceTotal}</p>` : ''}
    ${balanceDue && balanceDue !== invoiceTotal ? `<p style="margin: 5px 0;"><strong>Balance Due:</strong> $${balanceDue}</p>` : ''}
    ${dueDate ? `<p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>` : ''}
  </div>
  ${pdfUrl ? `
  <p style="margin: 20px 0;">
    <a href="${pdfUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Invoice</a>
  </p>
  ` : ''}
  <p>Thank you for your business!</p>
  <p>${brandName}</p>
</div>
      `.trim();

      // Enqueue the email using the universal email queue
      const { data: messageId, error: enqueueError } = await supabase.rpc('enqueue_email', {
        p_company_id: companyId,
        p_message_type: 'invoice_delivery',
        p_to_email: customer.email,
        p_subject: subject,
        p_payload: {
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          invoice_total: invoiceTotal,
          balance_due: balanceDue,
          due_date: dueDate,
          pdf_url: pdfUrl,
          customer_name: customer.full_name,
          service_description: serviceDescription,
          brand_name: brandName,
        },
        p_html_content: htmlContent,
        p_text_content: textContent,
        p_job_id: job.id,
        p_invoice_id: invoiceId,
        p_customer_id: customer.id,
      });

      if (enqueueError) {
        console.error("Failed to queue invoice email:", enqueueError);
        toast.error(enqueueError.message || "Failed to queue invoice email");
        return;
      }

      triggerEmailProcessing();
      toast.success(`Invoice email queued for ${customer.email}`);
      
    } catch (e) {
      console.error("Email invoice failed", {
        jobId: job.id,
        invoice_path: job.invoice_path,
        error: e.message,
        stack: e.stack,
        customerId: job.customer_id
      });
      toast.error("Could not queue invoice email. See console for details.");
    }
  }

    async function deleteJob(id) {
    if (supportMode) {
      toast.error("Job deletions are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Job deletions are disabled due to billing status.");
      return;
    }
    const confirmed = await confirm({
      title: 'Delete job?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    // 1. Fetch job record to get image paths
    const { data: jobData, error: jobFetchError } = await supabase
      .from('jobs')
      .select('before_image, after_image')
      .eq('id', id)
      .single()

    if (jobFetchError) {
      console.error('Error fetching job for deletion:', jobFetchError)
    } else {
      // 2. Delete images from storage if they exist
      const filesToDelete = []
      if (jobData?.before_image) {
        const beforePath = jobData.before_image.split('/storage/v1/object/public/job-images/')[1]
        if (beforePath) filesToDelete.push(beforePath)
      }
      if (jobData?.after_image) {
        const afterPath = jobData.after_image.split('/storage/v1/object/public/job-images/')[1]
        if (afterPath) filesToDelete.push(afterPath)
      }

      if (filesToDelete.length > 0) {
        const { error: removeError } = await supabase.storage.from('job-images').remove(filesToDelete)
        if (removeError) {
          console.error('Error deleting associated images:', removeError)
        }
      }
    }

    // 3. Delete the job record
    await supabase.from('jobs').delete().eq('id', id)

    // 4. Refresh list
    await fetchAllData()
  }

  async function assignJob(jobId, teamId) {
    if (supportMode) {
      toast.error("Job assignment is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Job assignment is disabled due to billing status.");
      return;
    }
    
    // Get old team from current state to detect actual change
    const existingJob = allJobs.find(j => j.id === jobId);
    const oldTeamId = existingJob?.assigned_team_id || null;
    const isActualChange = oldTeamId !== (teamId || null);
    
    // Team-based assignment: write only assigned_team_id
    const { error } = await supabase
      .from('jobs')
      .update({ 
        assigned_team_id: teamId || null
      })
      .eq('id', jobId)

    if (error) {
      console.error('Error assigning job:', error);
      if (error.code === 'PGRST116') {
        toast.error('Job not found. It may have been deleted.');
      } else if (error.code === '23503') {
        toast.error('Team not found. Please select a valid team.');
      } else {
        toast.error(error.message || 'Could not assign job.');
      }
      return;
    }

    // Queue crew assignment notification emails if team actually changed to a new team
    if (isActualChange && teamId && existingJob && companyId) {
      try {
        // Fetch team members with their emails
        const { data: teamMembersData, error: tmError } = await supabase
          .from('team_members')
          .select('crew_member_id, crew_members(id, full_name, email)')
          .eq('team_id', teamId);

        if (tmError) {
          console.warn('Failed to fetch team members for notification:', tmError);
        } else if (teamMembersData && teamMembersData.length > 0) {
          const customer = customers.find(c => c.id === existingJob.customer_id);
          const teamName = getTeamDisplayName(teamId);
          const serviceDate = existingJob.service_date 
            ? new Date(existingJob.service_date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : 'Not scheduled';

          // Queue email for each team member with an email address
          for (const tm of teamMembersData) {
            const crewMember = tm.crew_members;
            if (!crewMember?.email) continue;

            const crewMemberName = crewMember.full_name || 'Team Member';
            const customerName = customer?.full_name || 'Customer';
            const customerAddress = customer?.address || 'Address not provided';
            const serviceDescription = existingJob.services_performed || 'Service';

            const subject = `${brandName}: New job assignment`;
            
            const textContent = `Hi ${crewMemberName},

You have been assigned a new job.

Customer: ${customerName}
Service: ${serviceDescription}
Date: ${serviceDate}
Location: ${customerAddress}

Please review the job details in your crew portal.

${brandName}`;

            const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  <p>Hi ${crewMemberName},</p>
  <p>You have been assigned a new job.</p>
  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Customer:</strong> ${customerName}</p>
    <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${serviceDescription}</p>
    <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${serviceDate}</p>
    <p style="margin: 0;"><strong>Location:</strong> ${customerAddress}</p>
  </div>
  <p>Please review the job details in your crew portal.</p>
  <p>${brandName}</p>
</div>
            `.trim();

            try {
              await supabase.rpc('enqueue_email', {
                p_company_id: companyId,
                p_message_type: 'crew_assignment',
                p_to_email: crewMember.email,
                p_subject: subject,
                p_payload: {
                  job_id: jobId,
                  team_id: teamId,
                  team_name: teamName,
                  crew_member_id: crewMember.id,
                  crew_member_name: crewMemberName,
                  customer_name: customerName,
                  customer_address: customerAddress,
                  service_description: serviceDescription,
                  service_date: serviceDate,
                  brand_name: brandName,
                },
                p_html_content: htmlContent,
                p_text_content: textContent,
                p_job_id: jobId,
                p_crew_member_id: crewMember.id,
              });
            } catch (emailError) {
              console.warn(`Failed to queue crew assignment email for ${crewMember.email}:`, emailError);
            }
          }
          triggerEmailProcessing();
        }
      } catch (notifyError) {
        console.warn('Failed to send crew assignment notifications (non-fatal):', notifyError);
      }
    }

    await fetchAllData()
  }

  function sortByPrice() {
    const sorted = [...jobs].sort((a, b) => b.job_cost - a.job_cost)
    setJobs(sorted)
  }


  // Build lookup maps for performance
  const customersById = {};
  customers.forEach(c => { customersById[c.id] = c; });

  const feedbackByJobId = {};
  feedback.forEach(f => { feedbackByJobId[f.job_id] = f; });

  // Build flags map by job_id (group flags by job)
  const flagsByJobId = useMemo(() => {
    const map = {}
    jobFlags.forEach(flag => {
      if (!map[flag.job_id]) {
        map[flag.job_id] = []
      }
      map[flag.job_id].push(flag)
    })
    return map
  }, [jobFlags])

  // Build schedule request map by job_id
  const scheduleRequestByJobId = useMemo(() => {
    const map = {}
    scheduleRequests.forEach(sr => {
      if (sr.job_id) {
        map[sr.job_id] = sr
      }
    })
    return map
  }, [scheduleRequests])


  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle="Manage, assign, invoice, and track jobs."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => navigate('/admin/schedule?tab=needs-scheduling')}
              className="btn-secondary px-4 py-2"
            >
              Needs Scheduling
            </Button>
            <BillingGuard>
              <Button
                onClick={openNewJobForm}
                className="btn-accent px-4 py-2"
                disabled={supportMode || billingDisabled}
                title={supportMode ? "Job creation is disabled in support mode" : billingDisabled ? billingReason : undefined}
              >
                + New Job
              </Button>
            </BillingGuard>
          </div>
        }
      />

      {/* Plan Usage */}
      <LimitCard
        label="Jobs This Month"
        current={usage.current_jobs_this_month}
        limit={limits.max_jobs_per_month}
        isLoading={limitsLoading}
      />

      {/* Approaching Limit Warning */}
      <LimitWarningBanner
        label="Jobs This Month"
        current={usage.current_jobs_this_month}
        limit={limits.max_jobs_per_month}
        isLoading={limitsLoading}
      />

      {/* View Controls */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {/* Density Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Density:</span>
            <div className="flex border border-slate-300 rounded">
              <button
                onClick={() => setDensity('comfortable')}
                className={`px-3 py-1 text-sm ${
                  density === 'comfortable'
                    ? 'bg-slate-200 font-medium text-slate-900'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Comfortable
              </button>
              <button
                onClick={() => setDensity('compact')}
                className={`px-3 py-1 text-sm border-l border-slate-300 ${
                  density === 'compact'
                    ? 'bg-slate-200 font-medium text-slate-900'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Compact
              </button>
            </div>
          </div>

          {/* Layout Toggle (Desktop only) */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Layout:</span>
            <div className="flex border border-slate-300 rounded">
              <button
                onClick={() => setLayout('list')}
                className={`px-3 py-1 text-sm ${
                  layout === 'list'
                    ? 'bg-slate-200 font-medium text-slate-900'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setLayout('two-column')}
                className={`px-3 py-1 text-sm border-l border-slate-300 ${
                  layout === 'two-column'
                    ? 'bg-slate-200 font-medium text-slate-900'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Two-column
              </button>
              <button
                onClick={() => setLayout('three-column')}
                className={`px-3 py-1 text-sm border-l border-slate-300 ${
                  layout === 'three-column'
                    ? 'bg-slate-200 font-medium text-slate-900'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Three-column
              </button>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-700">Quick Filters:</span>
            <div className="flex flex-wrap gap-2">
              {['all', 'pending', 'completed', 'upcoming', 'unassigned'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => {
                    setQuickFilter(filter);
                    // Update URL param
                    const newParams = new URLSearchParams(searchParams);
                    if (filter === 'all') {
                      newParams.delete('quickFilter');
                    } else {
                      newParams.set('quickFilter', filter);
                    }
                    setSearchParams(newParams, { replace: true });
                    applyFilters(statusFilter, selectedCrew, searchTerm, allJobs, filter, overdueFilter);
                  }}
                  className={`px-3 py-1 rounded-full text-sm border transition ${
                    quickFilter === filter
                      ? 'bg-slate-200 font-medium border-slate-400'
                      : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Active Filters Row */}
      {(overdueFilter || (quickFilter === 'unassigned' && quickFilter !== 'all')) && (
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-700">Active Filters:</span>
            <div className="flex flex-wrap gap-2">
              {overdueFilter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-red-50 text-red-700 border border-red-200">
                  Overdue
                  <button
                    onClick={() => {
                      setOverdueFilter(false);
                      const newParams = new URLSearchParams(searchParams);
                      newParams.delete('filter');
                      setSearchParams(newParams, { replace: true });
                      applyFilters(statusFilter, selectedCrew, searchTerm, allJobs, quickFilter, false);
                    }}
                    className="hover:text-red-900 focus:outline-none"
                    aria-label="Remove overdue filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {quickFilter === 'unassigned' && quickFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-amber-50 text-amber-700 border border-amber-200">
                  Unassigned
                  <button
                    onClick={() => {
                      setQuickFilter('all');
                      const newParams = new URLSearchParams(searchParams);
                      newParams.delete('quickFilter');
                      setSearchParams(newParams, { replace: true });
                      applyFilters(statusFilter, selectedCrew, searchTerm, allJobs, 'all', overdueFilter);
                    }}
                    className="hover:text-amber-900 focus:outline-none"
                    aria-label="Remove unassigned filter"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-4">
        <select
          value={statusFilter}
          onChange={e => {
            const value = e.target.value;
            setStatusFilter(value);
            setQuickFilter('all'); // Reset quick filter when using status dropdown
            applyFilters(value, selectedCrew, searchTerm, allJobs, 'all', overdueFilter);
          }}
          className="border p-2 rounded"
        >
          <option value="">Filter by Status</option>
          <option value="Pending">Pending</option>
          <option value="Scheduled">Scheduled</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Canceled">Canceled</option>
        </select>

        <select
          value={selectedCrew}
          onChange={e => {
            const newCrew = e.target.value;
            setSelectedCrew(newCrew);
            applyFilters(statusFilter, newCrew, searchTerm, allJobs, quickFilter, overdueFilter);
          }}
          className="border p-2 rounded"
        >
          <option value="">Assigned Team: All</option>
          <option value="unassigned">Unassigned</option>
          {teams.map(team => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder={`Search by title or ${customerLabel.toLowerCase()}...`}
          value={searchTerm}
          onChange={e => {
            const value = e.target.value;
            setSearchTerm(value);
            applyFilters(statusFilter, selectedCrew, value, allJobs, quickFilter, overdueFilter);
          }}
          className="border p-2 rounded flex-1"
        />

        <button
  onClick={sortByPrice}
  className="btn-accent px-4 py-2 rounded"
>
  Sort by Price
</button>

        <Button
          onClick={() => {
            setStatusFilter('');
            setSearchTerm('');
            setSelectedCrew('');
            setQuickFilter('all');
            setOverdueFilter(false);
            // Clear query params
            const newParams = new URLSearchParams();
            setSearchParams(newParams, { replace: true });
            setJobs(allJobs);
          }}
          className="btn-secondary px-4 py-2"
        >
          Reset
        </Button>
        </div>
      </Card>

      {loading ? (
        <Card>
          <LoadingSpinner size="md" text="Loading jobs..." className="py-6" />
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title={allJobs.length === 0 ? "No jobs yet" : "No jobs match your filters"}
            description={
              allJobs.length === 0
                ? "Create your first job to get started. Jobs help you track services, schedule work, and generate invoices."
                : `You have ${allJobs.length} job${allJobs.length === 1 ? '' : 's'}, but none match your current filters. Try adjusting your filters or search terms.`
            }
            actionLabel={allJobs.length === 0 ? "Create Your First Job" : "Clear Filters"}
            onAction={allJobs.length === 0 ? openNewJobForm : () => {
              setStatusFilter('');
              setSearchTerm('');
              setSelectedCrew('');
              setQuickFilter('all');
              setOverdueFilter(false);
              const newParams = new URLSearchParams();
              setSearchParams(newParams, { replace: true });
              setJobs(allJobs);
            }}
          />
        </Card>
      ) : (
        <Card>
          <div className={
            layout === 'list' 
              ? 'space-y-4' 
              : layout === 'two-column' 
                ? 'grid sm:grid-cols-2 gap-4' 
                : 'grid xl:grid-cols-3 gap-4'
          }>
            {jobs.map((job) => {
              // Handle missing customer gracefully
              const customer = customersById[job.customer_id] || null;
              const feedbackItem = feedbackByJobId[job.id];
              const jobFlagsList = flagsByJobId[job.id] || [];
              
              // Calculate balance due for next action engine
              const jobPayments = paymentsByJob[job.id] || { total: 0, records: [] };
              const totalPaid = jobPayments.total || 0;
              const jobCost = Number(job.job_cost || 0);
              const balanceDue = Math.max(0, jobCost - totalPaid);

              // Skip rendering if critical data is missing (defensive)
              if (!job || !job.id) {
                console.warn('Skipping job with missing ID:', job);
                return null;
              }

              return (
                <JobCard
                  key={job.id}
                  job={job}
                  customer={customer}
                  balanceDue={balanceDue}
                  teams={teams}
                  getTeamDisplayName={getTeamDisplayName}
                  getJobAssigneeName={resolveAssignee}
                  feedbackItem={feedbackItem}
                  jobFlags={jobFlagsList}
                  customerLabel={customerLabel}
                  crewLabel={crewLabel}
                  dense={density === 'compact'}
                  scheduleRequest={scheduleRequestByJobId[job.id]}
                  onEdit={openEditForm}
                  onDelete={deleteJob}
                  onAssignCrew={assignJob}
                  onGenerateInvoice={handleGenerateInvoice}
                  onEmailInvoice={handleEmailInvoice}
                  onViewInvoice={(j) => handleInvoiceDownload(j, "view")}
                  onDownloadInvoice={(j) => handleInvoiceDownload(j, "download")}
                  supportMode={supportMode}
                  billingDisabled={billingDisabled}
                  onAddToCalendar={(job, customer) => {
                    downloadIcsForJob({
                      job,
                      customer,
                      companyName: brandName,
                      timezone: brandTz,
                      location: brandAddress
                    });
                  }}
                  onGoogleCalendar={(job, customer) => {
                    openGCalForJob({ job, customer, companyName: brandName });
                  }}
                  onEmailCustomer={async (job, customer) => {
                    if (!customer?.email) {
                      toast.error(`This ${customerLabel.toLowerCase()} doesn't have an email on file.`);
                      return;
                    }

                    const date = (job.service_date || "").split("T")[0] || "";
                    const subject = `${brandName}: Service ${job.status === "Completed" ? "Completed" : "Details"} – ${customer.full_name}`;

                    let bodyLines = [
                      `Hi ${customer.full_name},`,
                      "",
                      job.status === "Completed"
                        ? `We completed your service on ${date}.`
                        : `Your service is scheduled for ${date}.`,
                      "",
                      `Service: ${job.services_performed || "Service"}`,
                      `Price: $${job.job_cost ?? 0}`,
                      brandAddress ? `Address: ${brandAddress}` : "",
                      "",
                    ];

                    // Add invoice link if invoice_path exists
                    if (job.invoice_path) {
                      try {
                        const signedUrl = await getInvoiceUrlForJob(job);
                        if (signedUrl) {
                          bodyLines.push("Your invoice:", signedUrl, "");
                        }
                      } catch (error) {
                        console.error("Failed to get signed URL for email", {
                          jobId: job.id,
                          invoice_path: job.invoice_path,
                          error: error.message
                        });
                        // Continue without invoice link if signed URL fails
                      }
                    }

                    bodyLines.push(
                      "Reply to this email if you have any questions.",
                      "",
                      brandFooter || `Thanks,\n${brandName}`
                    );

                    const body = bodyLines.filter(Boolean).join("\n");

                    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                      customer.email
                    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

                    const mailtoUrl = `mailto:${customer.email}?subject=${encodeURIComponent(
                      subject
                    )}&body=${encodeURIComponent(body)}`;

                    const w = window.open(gmailUrl, '_blank');
                    if (!w || w.closed || typeof w.closed === 'undefined') {
                      window.location.href = mailtoUrl;
                    }
                  }}
                />
              );
            })}
          </div>
        </Card>
      )}

      <Drawer
        open={isFormOpen}
        title={editingJob ? 'Edit Job' : 'New Job'}
        onClose={() => {
          setIsFormOpen(false)
          // Clean up URL params if they exist
          const newParams = new URLSearchParams(searchParams);
          if (newParams.has('openJobId') || newParams.has('job_id')) {
            newParams.delete('openJobId');
            newParams.delete('job_id');
            setSearchParams(newParams, { replace: true });
          }
        }}
        disableClose={isSaving}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={() => {
                setIsFormOpen(false)
                // Clean up URL params if they exist
                const newParams = new URLSearchParams(searchParams);
                if (newParams.has('openJobId') || newParams.has('job_id')) {
                  newParams.delete('openJobId');
                  newParams.delete('job_id');
                  setSearchParams(newParams, { replace: true });
                }
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <BillingGuard>
              <Button
                className="btn-accent"
                type="submit"
                form="job-form"
                disabled={isSaving || billingDisabled}
                title={billingDisabled ? billingReason : undefined}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </BillingGuard>
          </div>
        }
      >
        <form onSubmit={saveJob} id="job-form">
          {/* Uniform input styling */}
          {(() => {
            const inputClass = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300";
            const selectClass = inputClass;
            const textareaClass = inputClass + " resize-y";
            
            return (
              <div className="space-y-5">
                {/* Details Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Details</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">
                        Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={e =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        className={inputClass}
                        required
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Service Type</label>
                      <input
                        type="text"
                        value={formData.services_performed}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            services_performed: e.target.value
                          })
                        }
                        className={inputClass}
                        placeholder="Service Type, Service Type, etc."
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700">
                          {customerLabel} <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.customer_id}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              customer_id: e.target.value
                            })
                          }
                          className={selectClass}
                          disabled={billingDisabled}
                        >
                          <option value="">—</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.full_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700">Assigned Team</label>
                        <select
                          value={formData.assigned_team_id}
                          onChange={e => {
                            setFormData({
                              ...formData,
                              assigned_team_id: e.target.value
                            });
                          }}
                          className={selectClass}
                          disabled={billingDisabled}
                        >
                          <option value="">Unassigned</option>
                          {teams.map(team => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Scheduling Section */}
                <section ref={schedulingSectionRef} className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Scheduling</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">
                        Service Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.service_date}
                        onChange={e => {
                          const newStartDate = e.target.value;
                          let newEndDate = formData.scheduled_end_date;
                          
                          // If end date is before new start date, set end = start
                          if (newEndDate && newStartDate && newEndDate < newStartDate) {
                            newEndDate = newStartDate;
                          }
                          
                          setFormData({
                            ...formData,
                            service_date: newStartDate,
                            scheduled_end_date: newEndDate
                          });
                        }}
                        className={inputClass}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={formData.scheduled_end_date}
                        onChange={e => {
                          const newEndDate = e.target.value;
                          const startDate = formData.service_date;
                          
                          // If end date is before start date, set end = start
                          let finalEndDate = newEndDate;
                          if (startDate && newEndDate && newEndDate < startDate) {
                            finalEndDate = startDate;
                          }
                          
                          setFormData({
                            ...formData,
                            scheduled_end_date: finalEndDate
                          });
                        }}
                        min={formData.service_date || undefined}
                        className={inputClass}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                      <p className="text-xs text-slate-500">Job end date (multi-day span)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Status</label>
                      <select
                        value={formData.status}
                        onChange={e =>
                          setFormData({ ...formData, status: e.target.value })
                        }
                        className={selectClass}
                        disabled={billingDisabled}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Canceled">Canceled</option>
                      </select>
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Pricing Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Pricing</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={e =>
                          setFormData({ ...formData, price: e.target.value })
                        }
                        className={inputClass}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Labor Pay</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.crew_pay}
                        onChange={e =>
                          setFormData({ ...formData, crew_pay: e.target.value })
                        }
                        className={inputClass}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                      <p className="text-xs text-slate-500 mt-1">Internal payout estimate (optional)</p>
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Images Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Images</h3>
                  </div>
                  <div className="space-y-3">
                    {/* Show existing images if they exist */}
                    {formData.before_image && !formData.beforeFile && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-700">Existing Before Image:</p>
                        <a
                          href={formData.before_image}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={formData.before_image}
                            alt="Before"
                            className="w-32 h-32 object-cover rounded border mt-1"
                          />
                        </a>
                      </div>
                    )}

                    {formData.after_image && !formData.afterFile && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-700">Existing After Image:</p>
                        <a
                          href={formData.after_image}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={formData.after_image}
                            alt="After"
                            className="w-32 h-32 object-cover rounded border mt-1"
                          />
                        </a>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">Before Image</label>
                        <input
                          ref={beforeFileRef}
                          type="file"
                          accept="image/*"
                          onChange={e =>
                            setFormData({ ...formData, beforeFile: e.target.files[0] })
                          }
                          className="hidden"
                          disabled={billingDisabled}
                        />
                        <div className="flex items-center gap-3">
                          <BillingGuard>
                            <Button
                              type="button"
                              variant="tertiary"
                              onClick={() => beforeFileRef.current?.click()}
                              disabled={billingDisabled}
                            >
                              Upload
                            </Button>
                          </BillingGuard>
                          <div className="text-sm text-slate-600 truncate flex-1">
                            {formData.beforeFile ? formData.beforeFile.name : "No file selected"}
                          </div>
                        </div>
                        {beforePreviewUrl && (
                          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                            <img
                              src={beforePreviewUrl}
                              alt="Before preview"
                              className="w-full rounded-md object-cover max-h-40"
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">After Image</label>
                        <input
                          ref={afterFileRef}
                          type="file"
                          accept="image/*"
                          onChange={e =>
                            setFormData({ ...formData, afterFile: e.target.files[0] })
                          }
                          className="hidden"
                          disabled={billingDisabled}
                        />
                        <div className="flex items-center gap-3">
                          <BillingGuard>
                            <Button
                              type="button"
                              variant="tertiary"
                              onClick={() => afterFileRef.current?.click()}
                              disabled={billingDisabled}
                            >
                              Upload
                            </Button>
                          </BillingGuard>
                          <div className="text-sm text-slate-600 truncate flex-1">
                            {formData.afterFile ? formData.afterFile.name : "No file selected"}
                          </div>
                        </div>
                        {afterPreviewUrl && (
                          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                            <img
                              src={afterPreviewUrl}
                              alt="After preview"
                              className="w-full rounded-md object-cover max-h-40"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Financial Actions Section */}
                <section ref={invoiceSectionRef} className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Financial Actions</h3>
                  </div>
                  <div className="space-y-3">
                    {editingJob && (() => {
                      const customer = customers.find(c => c.id === editingJob.customer_id) || null;
                      const invoice = invoicesByJob[editingJob.id];
                      // Filter payments for this invoice (if invoice exists)
                      const invoicePayments = invoice && paymentsByJob[editingJob.id]
                        ? paymentsByJob[editingJob.id].records.filter(p => p.invoice_id === invoice.id)
                        : [];
                      
                      return (
                        <div className="space-y-3">
                          {/* Create Quote Button */}
                          <Button
                            variant="secondary"
                            onClick={() => {
                              if (editingJob.customer_id) {
                                navigate(`/admin/quotes/new?customer_id=${editingJob.customer_id}`);
                              } else {
                                toast.error('Customer not found for this job');
                              }
                            }}
                            className="w-full flex items-center justify-center gap-2"
                            disabled={!editingJob.customer_id}
                            title={editingJob.customer_id ? 'Create a quote for this customer' : 'Customer not found'}
                          >
                            <FileText className="h-4 w-4" />
                            Create Quote
                          </Button>
                          
                          {/* Invoice Actions */}
                          <div>
                            <p className="text-xs font-medium text-slate-600 mb-2">Invoice</p>
                            <InvoiceActions
                              job={editingJob}
                              invoice={invoice}
                              payments={invoicePayments}
                              onGenerateInvoice={handleGenerateInvoice}
                              onEmailInvoice={handleEmailInvoice}
                              onViewInvoice={handleInvoiceDownload}
                              onDownloadInvoice={handleInvoiceDownload}
                              supportMode={supportMode}
                              billingDisabled={billingDisabled}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {!editingJob && (
                      <p className="text-sm text-slate-500">Save the job first to access financial actions</p>
                    )}
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Payment Section */}
                <section ref={paymentSectionRef} className="pt-5 space-y-2">
                  {editingJob ? (
                    <PaymentHistory
                      paymentData={paymentsByJob[editingJob.id]}
                      jobCost={editingJob.job_cost || 0}
                      showHeader={true}
                      emptyMessage={editingJob.id ? "No payments recorded" : "Save the job first to view payment history"}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
                      </div>
                      <p className="text-sm text-slate-500">Save the job first to view payment history</p>
                    </div>
                  )}
                </section>

                <div className="border-t border-slate-200" />

                {/* Notes Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700">Details</label>
                    <textarea
                      value={formData.details}
                      onChange={e =>
                        setFormData({ ...formData, details: e.target.value })
                      }
                      className={textareaClass}
                      rows={4}
                      disabled={billingDisabled}
                      readOnly={billingDisabled}
                    />
                  </div>
                </section>
              </div>
            );
          })()}
        </form>
      </Drawer>
      <ConfirmDialog />
      <UpgradeLimitModal
        open={showUpgradeModal}
        limitType="jobs"
        currentUsage={usage.current_jobs_this_month}
        limit={limits.max_jobs_per_month}
        plan={plan || 'starter'}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigate('/admin/billing');
        }}
        onCancel={() => setShowUpgradeModal(false)}
      />
    </div>
  )
}
