import toast from 'react-hot-toast';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useUser } from '../../context/UserContext';
import handlePlanLimitError from '../../utils/handlePlanLimitError';
import usePlanLimits from '../../hooks/usePlanLimits';
import UpgradeLimitModal from '../../components/ui/UpgradeLimitModal';
import { generateCustomerJobHistoryPDF } from "../../utils/customerJobHistoryPDF";
import { getSignedInvoiceUrl } from '../../utils/signedInvoiceUrl';
import useCompanySettings from "../../hooks/useCompanySettings";
import Button from "../../components/ui/Button";
import useConfirm from "../../hooks/useConfirm";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Drawer from "../../components/ui/Drawer";
import { User, MapPin, StickyNote, Clock, Search, RefreshCw, Calendar, Briefcase, FileText, DollarSign, Receipt, CalendarCheck, X, File, Upload, Download, Eye, Trash2, Users } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import CustomerCard from "../../components/customers/CustomerCard";
import CustomerKPICard from "../../components/customers/CustomerKPICard";
import FinancialKPICards from "../../components/financial/FinancialKPICards";
import InvoiceList from "../../components/financial/InvoiceList";
import TimelineEmptyState from "../../components/customers/TimelineEmptyState";
import { formatDate } from '../../utils/dateFormatting';
import { formatCurrencyFixed } from '../../utils/currencyFormatting';
import { warnIfMissingColumns, parseSelectString } from '../../utils/schemaGuards';
import { INVOICE_SELECT_CUSTOMERS_ADMIN, JOB_SELECT_CUSTOMERS_ADMIN_INVOICES, JOB_SELECT_CUSTOMERS_ADMIN } from '../../lib/dbSelects';
import { getInvoiceNextStep } from '../../lib/nextStepHints';
import { useBillingGuard } from '../../components/ui/BillingGuard';
import BillingGuard from '../../components/ui/BillingGuard';
import LimitCard from '../../components/ui/LimitCard';
import LimitWarningBanner from '../../components/ui/LimitWarningBanner';

export default function CustomersAdmin() {
  const { confirm, ConfirmDialog } = useConfirm();
  const { settings } = useCompanySettings();
  const { effectiveCompanyId, supportMode } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerLabel = settings?.customer_label || "Customer";
  const customerLabelPlural = customerLabel.endsWith("s")
    ? customerLabel
    : `${customerLabel}s`;
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    full_name: '',
    address: '',
    phone: '',
    email: '',
    tags: '',
    notes: '',
  });
const [customerNotes, setCustomerNotes] = useState({});
const [newNote, setNewNote] = useState('');
const [selectedCustomers, setSelectedCustomers] = useState([]);

  // Customer Detail Drawer state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [passwordModalMode, setPasswordModalMode] = useState('set'); // 'set' or 'create'

const toggleCustomerSelection = (id) => {
  setSelectedCustomers(prev =>
    prev.includes(id)
      ? prev.filter(cId => cId !== id)
      : [...prev, id]
  );
};
  const [editingId, setEditingId] = useState(null);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { plan, limits, usage, isLoading: limitsLoading, canAddCustomer, canCreateJob } = usePlanLimits();
  const [companyId, setCompanyId] = useState(null);
  const [customerJobs, setCustomerJobs] = useState({});
  const [creatingJobFor, setCreatingJobFor] = useState(null);
  const [newJob, setNewJob] = useState({
    service_date: '',
    services_performed: '',
    job_cost: '',
    assigned_team_id: ''
  });
  const [teams, setTeams] = useState([]);
  const [crewMembers, setCrewMembers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Timeline state (now used within detail drawer)
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState({});
  const [timelineEvents, setTimelineEvents] = useState({});
  const [timelineFilters, setTimelineFilters] = useState({});
  const [timelineSearch, setTimelineSearch] = useState({});

  // KPI state
  const [kpiLoading, setKpiLoading] = useState({});
  const [kpiError, setKpiError] = useState({});
  const [kpiData, setKpiData] = useState({});

  // Files state
  const [filesLoading, setFilesLoading] = useState({});
  const [filesError, setFilesError] = useState({});
  const [customerFiles, setCustomerFiles] = useState({});
  const [uploadLoading, setUploadLoading] = useState({});
  const [previewModal, setPreviewModal] = useState({ open: false, file: null, url: null });

  // Invoices state
  const [invoiceLoading, setInvoiceLoading] = useState({});
  const [invoiceError, setInvoiceError] = useState({});
  const [invoiceRows, setInvoiceRows] = useState({});

  // Smart Labels state
  const [smartLabels, setSmartLabels] = useState({}); // customerId -> { labels: [], outstanding, outstandingCents, nextJobDate, lastActivityAt, overdueCount, upcomingCount, ... }
  const [smartFilter, setSmartFilter] = useState('all');
  // Always default to 'all' view on page entry (no localStorage persistence for v1)
  // This prevents stale filters causing hidden customer records
  const [savedView, setSavedView] = useState('all');
  const [sortBy, setSortBy] = useState(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('customers_sort_by');
    return saved || 'priority';
  });

  // Get forced sort for current view (helper function)
  const getForcedSort = (view) => {
    if (view === 'collections') return 'priority';
    if (view === 'scheduling') return 'nextJobDate';
    return null; // No forced sort for other views
  };

  // Initialize company ID from UserContext (supports support mode)
  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId);
      fetchCustomers(effectiveCompanyId);
      fetchCrew();
    }
  }, [effectiveCompanyId]);

  // Reset to safe defaults on page entry (when component mounts)
  // This ensures users always see "All" view when entering the page
  useEffect(() => {
    // Reset view to 'all' on mount
    setSavedView('all');
    // Reset smart filter to 'all' on mount
    setSmartFilter('all');
    // Clear any stale localStorage values for customers view
    localStorage.removeItem('customers_saved_view');
  }, []); // Empty deps: only run on mount

  // Apply view-specific sort when saved view changes or on initial load
  useEffect(() => {
    const forcedSort = getForcedSort(savedView);
    if (forcedSort && sortBy !== forcedSort) {
      setSortBy(forcedSort);
      localStorage.setItem('customers_sort_by', forcedSort);
    } else if (savedView === 'paidUp' || savedView === 'noJobs') {
      if (sortBy !== 'name') {
        setSortBy('name');
        localStorage.setItem('customers_sort_by', 'name');
      }
    } else if (savedView === 'all' && sortBy !== 'priority') {
      // Only set default if not already set
      const savedSort = localStorage.getItem('customers_sort_by');
      if (!savedSort) {
        setSortBy('priority');
        localStorage.setItem('customers_sort_by', 'priority');
      }
    }
  }, [savedView]); // Only run when savedView changes

  useEffect(() => {
    if (companyId) {
      fetchCustomers(companyId);
      fetchTeams();
      fetchCrewMembers();
    }
  }, [companyId]);

  // Handle deep linking: open customer drawer from query params
  useEffect(() => {
    const customerId = searchParams.get('customer_id');
    const tab = searchParams.get('tab') || 'overview';
    
    if (customerId && customers.length > 0 && companyId) {
      // Validate tab
      const validTabs = ['overview', 'jobs', 'notes', 'timeline', 'files', 'actions'];
      const validTab = validTabs.includes(tab) ? tab : 'overview';
      
      // Find customer in loaded list
      const customer = customers.find(c => c.id === customerId);
      
      if (customer) {
        // Open drawer with the specified tab
        handleOpenDetail(customerId, validTab);
        
        // Clean URL after opening (remove query params)
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('customer_id');
        newParams.delete('tab');
        if (newParams.toString() !== searchParams.toString()) {
          navigate(`/admin/customers${newParams.toString() ? `?${newParams.toString()}` : ''}`, { replace: true });
        }
      } else {
        // Try to fetch customer directly if not in loaded list
        const validateCustomerDeepLink = async () => {
          if (companyId) {
            try {
              const { data: fetchedCustomer, error: fetchError } = await supabase
                .from('customers')
                .select('id, full_name, company_id')
                .eq('id', customerId)
                .eq('company_id', companyId)
                .single();
              
              if (fetchError || !fetchedCustomer) {
                if (fetchError?.code === 'PGRST116') {
                  toast.error('Customer not found. It may have been deleted.');
                } else {
                  toast.error('Customer not found');
                }
              } else {
                // Customer exists but wasn't in loaded list - refresh and open
                await fetchCustomers(companyId);
                handleOpenDetail(customerId, validTab);
              }
            } catch (err) {
              console.error('Error fetching customer:', err);
              toast.error('Failed to load customer');
            }
          } else {
            toast.error('Customer not found');
          }
          
          // Clean URL even if not found
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('customer_id');
          newParams.delete('tab');
          if (newParams.toString() !== searchParams.toString()) {
            navigate(`/admin/customers${newParams.toString() ? `?${newParams.toString()}` : ''}`, { replace: true });
          }
        };
        
        validateCustomerDeepLink();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, companyId, searchParams, navigate]);
  const fetchCrew = async () => {
  const { data, error } = await supabase
    .from("crew_members")
    .select("id, full_name");

    // Crew list no longer needed - removed assigned_to dropdown
};

  const fetchTeams = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name');
    
    if (error) {
      console.error('Error fetching teams:', error);
      setTeams([]);
    } else {
      setTeams(data || []);
      
      // Fetch team_members for assignee resolution
      if (data && data.length > 0) {
        const teamIds = data.map(t => t.id);
        const { data: teamMembersData, error: teamMembersError } = await supabase
          .from('team_members')
          .select('*, crew_members(id, full_name)')
          .in('team_id', teamIds);
        
        if (teamMembersError) {
          console.error('Error fetching team members:', teamMembersError);
          setTeamMembers([]);
        } else {
          setTeamMembers(teamMembersData || []);
        }
      }
    }
  };

  const fetchCrewMembers = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('crew_members')
      .select('id, full_name')
      .eq('company_id', companyId);
    
    if (error) {
      console.error('Error fetching crew members:', error);
      setCrewMembers([]);
    } else {
      setCrewMembers(data || []);
    }
};
// ✅ FETCH CUSTOMER TIMELINE FUNCTION (v2 with filters)
const fetchCustomerTimeline = async (customerId, filters = {}) => {
  if (!customerId) return;
  
  setTimelineLoading(true);
  setTimelineError(prev => ({ ...prev, [customerId]: null }));
  
  try {
    let query = supabase
      .from('customer_activity_log')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(500); // Limit to prevent heavy UI
    
    // Apply category filter
    if (filters.category && filters.category !== 'all') {
      query = query.eq('event_category', filters.category);
    }
    
    // Apply type filter
    if (filters.type && filters.type !== 'all') {
      query = query.eq('event_type', filters.type);
    }
    
    // Apply date range filters
    if (filters.dateStart) {
      query = query.gte('created_at', filters.dateStart + 'T00:00:00');
    }
    if (filters.dateEnd) {
      query = query.lte('created_at', filters.dateEnd + 'T23:59:59');
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    setTimelineEvents(prev => ({ ...prev, [customerId]: data || [] }));
    setTimelineError(prev => ({ ...prev, [customerId]: null }));
  } catch (error) {
    console.error('Error fetching customer timeline:', error);
    setTimelineError(prev => ({ ...prev, [customerId]: 'Unable to load timeline. Please try again.' }));
    setTimelineEvents(prev => ({ ...prev, [customerId]: [] }));
  } finally {
    setTimelineLoading(false);
  }
};

// ✅ FETCH CUSTOMER KPIS FUNCTION
const fetchCustomerKpis = async (customerId) => {
  if (!customerId || !companyId) return;
  
  setKpiLoading(prev => ({ ...prev, [customerId]: true }));
  setKpiError(prev => ({ ...prev, [customerId]: null }));
  
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
      warnIfMissingColumns('CustomersAdmin.jobs.kpi', jobs, requiredJobColumns);
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
          // PGRST116 = no rows returned, which is fine
          lastActivity = activityData?.created_at || null;
        }
      } catch (activityErr) {
        // Ignore activity fetch errors for empty jobs case
        console.warn('Could not fetch last activity for customer with no jobs:', activityErr);
      }
      
      setKpiData(prev => ({
        ...prev,
        [customerId]: {
          totalPaid: 0,
          outstanding: 0,
          totalJobs: 0,
          completedJobs: 0,
          upcomingJobs: 0,
          lastActivity: lastActivity
        }
      }));
      setKpiError(prev => ({ ...prev, [customerId]: null }));
      setKpiLoading(prev => ({ ...prev, [customerId]: false }));
      return;
    }
    
    // Fetch posted payments for those jobs (only if jobIds.length > 0)
    let totalPaid = 0;
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount, job_id, status')
      .in('job_id', jobIds)
      .eq('status', 'posted');
    
    if (paymentsError) throw paymentsError;
    
    totalPaid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    
    // Fetch last activity
    const { data: lastActivity, error: activityError } = await supabase
      .from('customer_activity_log')
      .select('created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (activityError && activityError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw activityError;
    }
    
    // Compute totals client-side
    const totalJobs = jobsList.length;
    const completedJobs = jobsList.filter(j => j.status === 'Completed').length;
    
    // Upcoming jobs: service_date >= today AND status NOT IN ('Completed','Canceled')
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const upcomingJobs = jobsList.filter(j => {
      // Skip jobs with null service_date
      if (!j.service_date) return false;
      // Skip completed or canceled jobs
      if (j.status === 'Completed' || j.status === 'Canceled') return false;
      // Compare as strings (service_date is DATE type, YYYY-MM-DD format)
      return j.service_date >= todayStr;
    }).length;
    
    // Outstanding: sum(job_cost) - sum(posted payments) for all non-canceled jobs
    const nonCanceledJobs = jobsList.filter(j => j.status !== 'Canceled');
    const totalJobCost = nonCanceledJobs.reduce((sum, j) => sum + (Number(j.job_cost) || 0), 0);
    const outstanding = Math.max(0, totalJobCost - totalPaid);
    
    setKpiData(prev => ({
      ...prev,
      [customerId]: {
        totalPaid,
        outstanding,
        totalJobs,
        completedJobs,
        upcomingJobs,
        lastActivity: lastActivity?.created_at || null
      }
    }));
    setKpiError(prev => ({ ...prev, [customerId]: null }));
  } catch (error) {
    console.error('Error fetching customer KPIs:', { 
      message: error?.message, 
      details: error?.details, 
      hint: error?.hint, 
      err: error 
    });
    setKpiError(prev => ({ ...prev, [customerId]: 'Unable to load summary right now.' }));
    setKpiData(prev => ({ ...prev, [customerId]: null }));
  } finally {
    setKpiLoading(prev => ({ ...prev, [customerId]: false }));
  }
};

// ✅ FETCH CUSTOMER INVOICES FUNCTION
const fetchCustomerInvoices = async (customerId) => {
  if (!customerId || !companyId) return;
  
  setInvoiceLoading(prev => ({ ...prev, [customerId]: true }));
  setInvoiceError(prev => ({ ...prev, [customerId]: null }));
  
  try {
    // Try to load from invoices table first (preferred)
    let invoiceData = []
    try {
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select(INVOICE_SELECT_CUSTOMERS_ADMIN)
        .eq('customer_id', customerId)
        .eq('company_id', companyId)
        .not('pdf_path', 'is', null)
        .neq('pdf_path', '')
      
      if (!invoicesError && invoicesData) {
        // Schema guardrail: warn if expected columns are missing
        if (invoicesData.length > 0) {
          const requiredInvoiceColumns = parseSelectString(INVOICE_SELECT_CUSTOMERS_ADMIN);
          warnIfMissingColumns('CustomersAdmin.invoices', invoicesData, requiredInvoiceColumns);
        }
        
        // Get job details for these invoices
        const jobIds = invoicesData.map(inv => inv.job_id).filter(Boolean)
        if (jobIds.length > 0) {
          const { data: jobsData } = await supabase
            .from('jobs')
            .select('id, service_date, services_performed, status, job_cost, invoice_path')
            .in('id', jobIds)
            .eq('company_id', companyId)
          
          // Schema guardrail: warn if expected columns are missing
          if (jobsData && jobsData.length > 0) {
            const requiredJobColumns = parseSelectString(JOB_SELECT_CUSTOMERS_ADMIN_INVOICES);
            warnIfMissingColumns('CustomersAdmin.jobs.invoices', jobsData, requiredJobColumns);
          }
          
          // Merge invoice and job data
          const jobsById = {}
          jobsData?.forEach(job => { jobsById[job.id] = job })
          
          invoiceData = invoicesData.map(inv => {
            const job = jobsById[inv.job_id]
            if (!job) return null
            return {
              ...job,
              // Canonical path resolution: prefer invoices.pdf_path (trigger keeps invoice_pdf_path in sync)
              invoice_path: inv.pdf_path || job.invoice_path,
              invoice_id: inv.id,
            }
          }).filter(Boolean)
        }
      }
    } catch (err) {
      console.warn('Could not load from invoices table, falling back to jobs:', err)
    }
    
    // Fallback: Load from jobs with invoice_path (temporary legacy support)
    if (invoiceData.length === 0) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, service_date, services_performed, status, job_cost, invoice_path')
        .eq('customer_id', customerId)
        .eq('company_id', companyId)
        .not('invoice_path', 'is', null)
        .neq('invoice_path', '')
        .order('service_date', { ascending: false });
      
      if (error) throw error;
      
      // Schema guardrail: warn if expected columns are missing
      if (data && data.length > 0) {
        const requiredJobColumns = parseSelectString(JOB_SELECT_CUSTOMERS_ADMIN_INVOICES);
        warnIfMissingColumns('CustomersAdmin.jobs.fallback', data, requiredJobColumns);
      }
      invoiceData = data || []
    } else {
      // Sort by service_date descending
      invoiceData.sort((a, b) => {
        const dateA = new Date(a.service_date || 0)
        const dateB = new Date(b.service_date || 0)
        return dateB - dateA
      })
    }
    
    setInvoiceRows(prev => ({ ...prev, [customerId]: invoiceData }));
    setInvoiceError(prev => ({ ...prev, [customerId]: null }));
  } catch (error) {
    console.error('Error fetching customer invoices:', error);
    setInvoiceError(prev => ({ ...prev, [customerId]: 'Unable to load invoices. Please try again.' }));
    setInvoiceRows(prev => ({ ...prev, [customerId]: [] }));
  } finally {
    setInvoiceLoading(prev => ({ ...prev, [customerId]: false }));
  }
};

// ✅ FETCH CUSTOMER FILES FUNCTION
const fetchCustomerFiles = async (customerId) => {
  if (!customerId || !companyId) return;
  
  setFilesLoading(prev => ({ ...prev, [customerId]: true }));
  setFilesError(prev => ({ ...prev, [customerId]: null }));
  
  try {
    const { data, error } = await supabase
      .from('customer_files')
      .select('*')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    setCustomerFiles(prev => ({ ...prev, [customerId]: data || [] }));
    setFilesError(prev => ({ ...prev, [customerId]: null }));
  } catch (error) {
    console.error('Error fetching customer files:', error);
    setFilesError(prev => ({ ...prev, [customerId]: 'Unable to load files. Please try again.' }));
    setCustomerFiles(prev => ({ ...prev, [customerId]: [] }));
  } finally {
    setFilesLoading(prev => ({ ...prev, [customerId]: false }));
  }
};

// ✅ UPLOAD CUSTOMER FILES FUNCTION
const handleUploadCustomerFiles = async (customerId, fileList) => {
  if (supportMode) {
    toast.error("File uploads are disabled in support mode.");
    return;
  }
  
  if (billingDisabled) {
    toast.error(billingReason || "File uploads are disabled due to billing status.");
    return;
  }
  if (!customerId || !companyId || !fileList || fileList.length === 0) return;
  
  setUploadLoading(prev => ({ ...prev, [customerId]: true }));
  
  try {
    const files = Array.from(fileList);
    const uploadedFiles = [];
    
    for (const file of files) {
      // Sanitize filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = Date.now();
      const filePath = `${companyId}/customers/${customerId}/${timestamp}_${safeName}`;
      
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
      
      // Insert DB record
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
        // Try to clean up storage object
        await supabase.storage.from('customer-files').remove([filePath]);
        toast.error(`Failed to save record for ${file.name}`);
        continue;
      }
      
      uploadedFiles.push(fileRecord);
      
      // Log activity (don't break if it fails)
      try {
        await supabase.rpc('log_customer_activity', {
          p_customer_id: customerId,
          p_event_type: 'customer.file_uploaded',
          p_event_title: 'File uploaded',
          p_event_description: `Uploaded: ${file.name}`,
          p_event_category: 'files',
          p_related_type: 'customer_file',
          p_related_id: fileRecord.id,
          p_severity: 'info',
          p_event_data: {
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size || null
          }
        });
      } catch (logError) {
        console.warn('Failed to log file upload activity:', logError);
      }
    }
    
    if (uploadedFiles.length > 0) {
      toast.success(`Uploaded ${uploadedFiles.length} file(s)`);
      await fetchCustomerFiles(customerId);
    }
  } catch (error) {
    console.error('Error uploading files:', error);
    toast.error('Failed to upload files');
  } finally {
    setUploadLoading(prev => ({ ...prev, [customerId]: false }));
  }
};

// ✅ DELETE CUSTOMER FILE FUNCTION
const handleDeleteCustomerFile = async (fileRow, customerId) => {
  if (supportMode) {
    toast.error("File deletions are disabled in support mode.");
    return;
  }
  
  if (billingDisabled) {
    toast.error(billingReason || "File deletions are disabled due to billing status.");
    return;
  }
  const confirmed = await confirm({
    title: 'Delete file?',
    message: `Are you sure you want to delete "${fileRow.file_name}"? This action cannot be undone.`,
    confirmText: 'Delete',
    confirmVariant: 'danger'
  });
  
  if (!confirmed) return;
  
  try {
    // Delete storage object
    const { error: storageError } = await supabase.storage
      .from('customer-files')
      .remove([fileRow.file_path]);
    
    if (storageError) {
      console.error('Storage delete failed:', storageError);
      // Continue to delete DB record even if storage delete fails
    }
    
    // Delete DB record
    const { error: dbError } = await supabase
      .from('customer_files')
      .delete()
      .eq('id', fileRow.id);
    
    if (dbError) {
      throw dbError;
    }
    
    toast.success('File deleted');
    await fetchCustomerFiles(customerId);
    
    // Log activity (don't break if it fails)
    try {
      await supabase.rpc('log_customer_activity', {
        p_customer_id: customerId,
        p_event_type: 'customer.file_deleted',
        p_event_title: 'File deleted',
        p_event_description: `Deleted: ${fileRow.file_name}`,
        p_event_category: 'files',
        p_related_type: 'customer_file',
        p_related_id: fileRow.id,
        p_severity: 'warning',
        p_event_data: {
          file_name: fileRow.file_name,
          mime_type: fileRow.mime_type || null
        }
      });
    } catch (logError) {
      console.warn('Failed to log file delete activity:', logError);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    toast.error('Failed to delete file');
  }
};

// ✅ OPEN/PREVIEW CUSTOMER FILE FUNCTION
const handleOpenCustomerFile = async (fileRow) => {
  try {
    // Create signed URL
    const { data, error } = await supabase.storage
      .from('customer-files')
      .createSignedUrl(fileRow.file_path, 3600); // 1 hour expiry
    
    if (error || !data) {
      throw error || new Error('Failed to generate signed URL');
    }
    
    const signedUrl = data.signedUrl;
    
    // Check if it's an image or PDF
    const isImage = fileRow.mime_type?.startsWith('image/');
    const isPdf = fileRow.mime_type === 'application/pdf';
    
    if (isImage) {
      // Show in modal
      setPreviewModal({ open: true, file: fileRow, url: signedUrl });
    } else if (isPdf) {
      // Open PDF in new tab
      window.open(signedUrl, '_blank');
    } else {
      // Download other file types
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = fileRow.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (error) {
    console.error('Error opening file:', error);
    toast.error('Failed to open file');
  }
};

// ✅ DOWNLOAD CUSTOMER FILE FUNCTION
const handleDownloadCustomerFile = async (fileRow) => {
  try {
    const { data, error } = await supabase.storage
      .from('customer-files')
      .createSignedUrl(fileRow.file_path, 3600);
    
    if (error || !data) {
      throw error || new Error('Failed to generate signed URL');
    }
    
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = fileRow.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    console.error('Error downloading file:', error);
    toast.error('Failed to download file');
  }
};

// ✅ FETCH NOTES FUNCTION
const fetchNotesForCustomer = async (customerId) => {
  const { data, error } = await supabase
    .from('customer_notes')
    .select('id, customer_id, note, created_at, author')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (!error) {
    setCustomerNotes(prev => ({
      ...prev,
      [customerId]: data
    }));
  } else {
    console.error('Error fetching notes:', error.message);
  }
};

// ✅ ADD NOTE FUNCTION
const handleAddNote = async (customerId) => {
  if (supportMode) {
    toast.error("Note creation is disabled in support mode.");
    return;
  }
  
  if (billingDisabled) {
    toast.error(billingReason || "Note creation is disabled due to billing status.");
    return;
  }
  if (!newNote.trim()) return;

  const { data: { user } } = await supabase.auth.getUser();

  // 🔥 Fetch user profile
  const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('full_name')
  .eq('id', user.id)
  .single();

  const authorName = profile?.full_name || 'Unknown';

  const { data, error } = await supabase
    .from('customer_notes')
    .insert([{
      customer_id: customerId,
      note: newNote.trim(),
      author: authorName, // ✅ use full name here
    }])
    .select()
    .single();

  if (!error && data) {
    setNewNote('');
    await fetchNotesForCustomer(customerId);
    toast.success('Note added!');
    
    // Log customer note added activity
    try {
      const noteText = (data.note || '').trim();
      const preview = noteText.slice(0, 120);
      await supabase.rpc('log_customer_activity', {
        p_customer_id: customerId,
        p_event_type: 'customer.note_added',
        p_event_title: 'Note added',
        p_event_description: preview ? `"${preview}${preview.length === 120 ? '…' : ''}"` : 'Note added',
        p_related_id: null,
        p_event_data: { customer_id: customerId, note_id: data.id, note_preview: preview }
      });
    } catch (logError) {
      console.warn('Failed to log customer note added activity:', logError);
    }
  } else {
    console.error('Failed to save note:', error?.message);
    toast.error('Failed to save note.');
  }
};
// ✅ DELETE NOTE FUNCTION
const handleDeleteNote = async (noteId, customerId) => {
  if (supportMode) {
    toast.error("Note deletions are disabled in support mode.");
    return;
  }
  
  if (billingDisabled) {
    toast.error(billingReason || "Note deletions are disabled due to billing status.");
    return;
  }
  const confirmed = await confirm({
    title: 'Delete note?',
    message: 'This action cannot be undone.',
    confirmText: 'Delete',
    confirmVariant: 'danger'
  });
  if (!confirmed) return;

  const { error } = await supabase
    .from('customer_notes')
    .delete()
    .eq('id', noteId);

  if (!error) {
    toast.success('Note deleted.');
    await fetchNotesForCustomer(customerId); // Refresh notes
  } else {
    toast.error('Could not delete note.');
    console.error(error.message);
  }
};

  const fetchCustomers = async (companyId) => {
  if (!companyId) return;

  // Fetch all customers for this company
  const { data: customersData, error: customersError } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId);

  if (customersError) {
    console.error('Error fetching customers:', customersError.message);
    return;
  }

  // Get job and payment data (with error handling)
  let jobsData = [];
  let paymentsByJob = {};
  
  try {
    const { data: jobsDataResult, error: jobsError } = await supabase
    .from('jobs')
    .select('id, customer_id, status, job_cost, service_date')
    .eq('company_id', companyId);

    if (jobsError) {
      console.warn('Error fetching jobs for smart labels:', jobsError);
      // Continue without smart labels
    } else {
      jobsData = jobsDataResult || [];
    }

  const jobIds = jobsData.map(j => j.id);

    // Group payments by job (only fetch if there are jobs)
    if (jobIds.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('job_id, amount, status')
    .in('job_id', jobIds)
    .eq('status', 'posted');

      if (paymentsError) {
        console.warn('Error fetching payments for smart labels:', paymentsError);
        // Continue without payment data
      } else if (paymentsData) {
  paymentsData.forEach(pmt => {
    if (!paymentsByJob[pmt.job_id]) paymentsByJob[pmt.job_id] = 0;
    paymentsByJob[pmt.job_id] += parseFloat(pmt.amount);
  });
      }
    }
  } catch (error) {
    console.warn('Error computing smart labels:', error);
    // Continue without smart labels - page should still work
  }

  // Compute smart labels for each customer
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const labelsMap = {};
  
  customersData.forEach(customer => {
    const theirJobs = jobsData.filter(j => j.customer_id === customer.id);
    
    // Calculate totals
    const nonCanceledJobs = theirJobs.filter(j => j.status !== 'Canceled');
    const totalJobCost = nonCanceledJobs.reduce((sum, j) => sum + (Number(j.job_cost) || 0), 0);
    const totalPaid = theirJobs.reduce((sum, j) => {
      const paid = paymentsByJob[j.id] || 0;
      return sum + paid;
    }, 0);
    const outstanding = Math.max(0, totalJobCost - totalPaid);
    
    // Determine labels
    const labels = [];
    const hasJobs = theirJobs.length > 0;
    
    if (outstanding > 0) {
      labels.push('Unpaid');
    }
    
    if (outstanding === 0 && hasJobs) {
      labels.push('Paid Up');
    }
    
    // Check for upcoming jobs
    const hasUpcoming = theirJobs.some(job => {
      if (!job.service_date) return false;
      if (job.status === 'Completed' || job.status === 'Canceled') return false;
      return job.service_date >= todayStr;
    });
    
    if (hasUpcoming) {
      labels.push('Upcoming');
    }
    
    // Check for overdue jobs
    const hasOverdue = theirJobs.some(job => {
      if (!job.service_date) return false;
      if (job.status === 'Completed' || job.status === 'Canceled') return false;
      return job.service_date < todayStr;
    });
    
    if (hasOverdue) {
      labels.push('Overdue');
    }
    
    if (!hasJobs) {
      labels.push('No Jobs');
    }
    
    // Compute additional fields for sorting
    const outstandingCents = Math.round(outstanding * 100); // Convert to cents for precise sorting
    
    // Find next job date (min future service_date for open jobs)
    const futureJobs = theirJobs.filter(job => {
      if (!job.service_date) return false;
      if (job.status === 'Completed' || job.status === 'Canceled') return false;
      return job.service_date >= todayStr;
    });
    const nextJobDate = futureJobs.length > 0 
      ? futureJobs.map(j => j.service_date).sort()[0] 
      : null;
    
    // Find last activity (use most recent job date as fallback)
    const allJobDates = theirJobs
      .filter(j => j.service_date)
      .map(j => j.service_date)
      .sort()
      .reverse();
    const lastActivityAt = allJobDates.length > 0 ? allJobDates[0] : null;
    
    // Count overdue and upcoming jobs
    const overdueCount = theirJobs.filter(job => {
      if (!job.service_date) return false;
      if (job.status === 'Completed' || job.status === 'Canceled') return false;
      return job.service_date < todayStr;
    }).length;
    
    const upcomingCount = futureJobs.length;
    
    labelsMap[customer.id] = {
      labels,
      outstanding,
      outstandingCents,
      totalPaid,
      hasUpcoming,
      hasOverdue,
      hasJobs,
      nextJobDate,
      lastActivityAt,
      overdueCount,
      upcomingCount
    };
  });
  
  setSmartLabels(labelsMap);

  // Enhance customer list (keep old props for backward compatibility, but add smartLabels)
  const enhancedCustomers = customersData.map(customer => {
    const smartLabelData = labelsMap[customer.id] || { labels: [], outstanding: 0, totalPaid: 0, hasUpcoming: false, hasOverdue: false, hasJobs: false };

    return {
      ...customer,
      hasUnpaidJobs: smartLabelData.labels.includes('Unpaid'),
      hasUpcomingJobs: smartLabelData.labels.includes('Upcoming'),
      smartLabels: smartLabelData.labels
    };
  });

  setCustomers(enhancedCustomers);
};

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  if (supportMode) {
    toast.error("Customer mutations are disabled in support mode.");
    return;
  }
  
  if (billingDisabled) {
    toast.error(billingReason || "Customer mutations are disabled due to billing status.");
    return;
  }
  const { full_name, email } = form;
  if (!full_name || !email) {
  toast.error('Name and email required');
  return;
}

  // Proactive limit check (only for new customers, not edits)
  if (!editingId && !limitsLoading) {
    if (!canAddCustomer) {
      setShowUpgradeModal(true);
      return;
    }
  }

  setIsSavingCustomer(true);

  try {
    const normalizedTags = Array.isArray(form.tags)
      ? form.tags
      : form.tags?.split(',').map(tag => tag.trim()).filter(Boolean);

    if (editingId) {
      const { error } = await supabase
        .from('customers')
        .update({
          full_name: form.full_name,
          address: form.address,
          phone: form.phone,
          email: form.email,
          tags: normalizedTags,
          notes: form.notes || ''
        })
        .eq('id', editingId)
        .select(); // helps with debugging

      if (!error) {
    setCustomers(prev =>
      prev.map(c =>
        c.id === editingId
          ? { ...c, ...form, tags: normalizedTags }
          : c
      )
    );
    toast.success('Customer updated!');
    setIsCustomerDrawerOpen(false);
    
    // Log customer updated activity
    try {
      await supabase.rpc('log_customer_activity', {
        p_customer_id: editingId,
        p_event_type: 'customer.updated',
        p_event_title: 'Customer updated',
        p_event_description: 'Customer record updated',
        p_related_id: null,
        p_event_data: { customer_id: editingId }
      });
    } catch (logError) {
      console.warn('Failed to log customer updated activity:', logError);
    }
  }
    } else {
      const { data: inserted, error } = await supabase
        .from('customers')
        .insert([{
          ...form,
          tags: normalizedTags,
          company_id: companyId,
          user_id: null,
        }])
        .select();

      if (error) {
        if (!handlePlanLimitError(error, navigate)) {
          toast.error(error.message);
        }
      } else if (inserted?.length) {
        const createdCustomer = inserted[0];
        setCustomers(prev => [...prev, createdCustomer]);
        toast.success('Customer added!');
        setIsCustomerDrawerOpen(false);
        
        // Log customer created activity
        try {
          await supabase.rpc('log_customer_activity', {
            p_customer_id: createdCustomer.id,
            p_event_type: 'customer.created',
            p_event_title: 'Customer created',
            p_event_description: `Customer record created: ${createdCustomer.full_name || 'Customer'}`,
            p_related_id: null,
            p_event_data: { customer_id: createdCustomer.id }
          });
        } catch (logError) {
          console.warn('Failed to log customer created activity:', logError);
        }
      }
    }

    setForm({
      full_name: '',
      address: '',
      phone: '',
      email: '',
      tags: '',
      notes: ''
    });
    setEditingId(null);

    // Optional: re-fetch in background just to be safe
    fetchCustomers();
  } finally {
    setIsSavingCustomer(false);
  }
};

  const handleNewCustomer = () => {
    setForm({
      full_name: '',
      address: '',
      phone: '',
      email: '',
      tags: '',
      notes: '',
    });
    setEditingId(null);
    setIsCustomerDrawerOpen(true);
  };

  const handleEdit = (customer) => {
  setForm({
    ...customer,
    tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : ''
  });
  setEditingId(customer.id);
  setIsCustomerDrawerOpen(true);
};

  // Open customer detail drawer
  const handleOpenDetail = async (customerId, tab = 'overview') => {
    setDetailCustomerId(customerId);
    setActiveTab(tab);
    setDetailOpen(true);
    
    // Load data for the active tab
    if (tab === 'overview') {
      await fetchCustomerKpis(customerId);
    } else if (tab === 'jobs') {
      await handleViewJobs(customerId);
    } else if (tab === 'notes') {
      await fetchNotesForCustomer(customerId);
    } else if (tab === 'timeline') {
      if (!timelineFilters[customerId]) {
        setTimelineFilters(prev => ({ ...prev, [customerId]: {} }));
      }
      await fetchCustomerTimeline(customerId, timelineFilters[customerId] || {});
    } else if (tab === 'files') {
      await fetchCustomerFiles(customerId);
    } else if (tab === 'invoices') {
      await fetchCustomerInvoices(customerId);
    }
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setDetailCustomerId(null);
    setActiveTab('overview');
  };

  const handleTimelineFilterChange = async (customerId, filterKey, filterValue) => {
    setTimelineFilters(prev => {
      const current = prev[customerId] || {};
      const updated = { ...current, [filterKey]: filterValue };
      return { ...prev, [customerId]: updated };
    });
    
    // Debounce: fetch after a brief delay if multiple filters change
    const currentFilters = timelineFilters[customerId] || {};
    const updatedFilters = { ...currentFilters, [filterKey]: filterValue };
    await fetchCustomerTimeline(customerId, updatedFilters);
  };

  const handleClearTimelineFilters = async (customerId) => {
    setTimelineFilters(prev => ({ ...prev, [customerId]: {} }));
    await fetchCustomerTimeline(customerId, {});
  };

  // Route old timeline action to detail drawer
  const handleOpenTimeline = async (customerId) => {
    await handleOpenDetail(customerId, 'timeline');
  };

  const handleDelete = async (id) => {
    if (supportMode) {
      toast.error("Customer deletions are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Customer deletions are disabled due to billing status.");
      return;
    }
    const confirmed = await confirm({
      title: 'Delete customer?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;
    
    const { error } = await supabase.from('customers').delete().eq('id', id);
if (!error) {
  toast.success('Customer deleted.');
  setCustomers(prev => prev.filter(c => c.id !== id)); // instantly remove from UI
} else {
  toast.error('Could not delete customer.');
}
  };

  // Password generator utility
  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let result = "";
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Handle set password
  function handleSetPassword(customer) {
    setSelectedCustomer(customer);
    setTempPassword('');
    setModalError('');
    setModalSuccess('');
    setPasswordModalMode('set');
    setShowPasswordModal(true);
  }

  // Handle create login
  function handleCreateLogin(customer) {
    if (supportMode) {
      toast.error("User account creation is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "User account creation is disabled due to billing status.");
      return;
    }
    setSelectedCustomer(customer);
    setTempPassword(generatePassword()); // Auto-generate password
    setModalError('');
    setModalSuccess('');
    setPasswordModalMode('create');
    setShowPasswordModal(true);
  }

  // Handle save password
  const handleSavePassword = async () => {
    if (supportMode) {
      toast.error("Password operations are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Password operations are disabled due to billing status.");
      return;
    }
    if (passwordModalMode === 'create') {
      // Create login flow
      if (!selectedCustomer?.email) {
        toast.error('Customer email is required to create login');
        setModalError('Customer email is required to create login');
        return;
      }

      if (selectedCustomer?.user_id) {
        toast.error('Customer already has a login account');
        setModalError('Customer already has a login account. Use "Set Password" to update it.');
        return;
      }

      if (!tempPassword || tempPassword.trim().length < 8) {
        setModalError('Password must be at least 8 characters long.');
        return;
      }

      setIsSavingPassword(true);
      setModalError('');
      setModalSuccess('');

      try {
        const passwordToSet = tempPassword.trim();
        
        console.log('[CustomersAdmin] create-customer-login', {
          customerId: selectedCustomer.id,
          customerEmail: selectedCustomer.email,
          passwordLength: passwordToSet.length,
        });

        const { data, error } = await supabase.functions.invoke('create-customer-login', {
          body: {
            customer_id: selectedCustomer.id,
            email: selectedCustomer.email,
            full_name: selectedCustomer.full_name || null,
            company_id: selectedCustomer.company_id || companyId,
            temp_password: passwordToSet,
          },
        });

        if (error) {
          console.error('[CustomersAdmin] Edge function error:', error);
          setModalError(error.message || 'Failed to create login. Please try again.');
          return;
        }

        // Handle non-ok responses
        if (!data?.ok) {
          console.error('[CustomersAdmin] Edge function returned error:', data);
          setModalError(data?.error || `Failed to create login: ${data?.message || 'Unknown error'}`);
          return;
        }

        // Handle success
        if (data.ok === true) {
          console.log('[CustomersAdmin] create-customer-login success', {
            userId: data.user_id,
            reused: data.reused,
          });
          
          setModalSuccess(
            `Login created successfully! Customer can now sign in at /customer/login with email: ${selectedCustomer.email}`
          );
          
          // Refresh customer data to update user_id
          await fetchCustomers();
          
          // Close modal after 1.5 seconds
          setTimeout(() => {
            setShowPasswordModal(false);
            setModalSuccess('');
            setTempPassword('');
            setSelectedCustomer(null);
            setPasswordModalMode('set');
          }, 1500);
        } else {
          console.error('[CustomersAdmin] Unexpected success response format:', data);
          setModalError('Login may have been created, but received unexpected response format.');
        }
      } catch (err) {
        console.error('Error creating login:', err);
        setModalError('Failed to create login. Please try again.');
      } finally {
        setIsSavingPassword(false);
      }
    } else {
      // Set password flow (existing logic)
      if (!selectedCustomer?.user_id) {
        setModalError('Customer does not have a user account. Please invite them to the portal first.');
        return;
      }

      if (!tempPassword || tempPassword.trim().length < 8) {
        setModalError('Password must be at least 8 characters long.');
        return;
      }

      setIsSavingPassword(true);
      setModalError('');
      setModalSuccess('');

      try {
        const user_id = selectedCustomer.user_id;
        const passwordToSet = tempPassword.trim();
        
        console.log('[CustomersAdmin] set-customer-password', {
          customerId: selectedCustomer.id,
          customerEmail: selectedCustomer.email,
          authUserId: selectedCustomer.user_id,
          passwordLength: passwordToSet.length,
        });

        const { data, error } = await supabase.functions.invoke('set-customer-password', {
          body: {
            user_id: user_id,
            customer_id: selectedCustomer.id,
            customer_email: selectedCustomer.email,
            new_password: passwordToSet,
          },
        });

        if (error) {
          console.error('[CustomersAdmin] Edge function error:', error);
          setModalError(error.message || 'Failed to set password. Please try again.');
          return;
        }

        // Handle non-ok responses
        if (!data?.ok) {
          if (data?.code === 'EMAIL_MISMATCH') {
            console.error('[CustomersAdmin] Email mismatch detected', {
              auth_email: data.auth_email,
              customer_email: data.customer_email,
            });
            setModalError(
              `This customer is linked to ${data.auth_email}, not ${data.customer_email}. Password was NOT changed. We'll fix this mapping next.`
            );
            // Do NOT close the modal on EMAIL_MISMATCH
            return;
          } else {
            console.error('[CustomersAdmin] Edge function returned error:', data);
            setModalError(`Failed to set password: ${data?.message || 'Unknown error'}`);
            return;
          }
        }

        // Handle success
        if (data.ok === true && data.code === 'PASSWORD_UPDATED') {
          console.log('[CustomersAdmin] set-customer-password success', {
            userId: data.user_id,
            userEmail: data.user_email,
          });
          
          setModalSuccess(
            data.user_email
              ? `Password set successfully for ${data.user_email}. Customer can now log in at /customer/login`
              : 'Password set successfully. Customer can now log in at /customer/login'
          );
        } else {
          console.error('[CustomersAdmin] Unexpected success response format:', data);
          setModalError('Password may have been set, but received unexpected response format.');
        }
        
        // Close modal after 1.5 seconds
        setTimeout(() => {
          setShowPasswordModal(false);
          setModalSuccess('');
          setTempPassword('');
          setSelectedCustomer(null);
          setPasswordModalMode('set');
        }, 1500);
      } catch (err) {
        console.error('Error setting password:', err);
        setModalError('Failed to set password. Please try again.');
      } finally {
        setIsSavingPassword(false);
      }
    }
  };

  // Handle invite to portal
  const handleInviteToPortal = async (customer) => {
    if (supportMode) {
      toast.error("User invites are disabled in support mode.");
      return;
    }
    if (!customer.email) {
      toast.error('Customer email is required to send invite');
      return;
    }

    if (!customer.company_id && !companyId) {
      toast.error('Company ID is required to send invite');
      return;
    }

    const email = customer.email;

    try {
      // Use edge function for consistent 24-hour expiry and metadata handling
      const { data, error: inviteError } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email,
          full_name: customer.full_name || null,
          role: 'customer',
          customer_id: customer.id,
          company_id: customer.company_id || companyId,
          app_next: '/customer/dashboard',
        },
      });

      // Handle edge function errors (HTTP non-2xx)
      if (inviteError) {
        console.error('Error sending invite:', inviteError);
        toast.error(`Failed to send invite: ${inviteError.message || 'Unknown error'}`);
        return;
      }

      // Accept both old + new response shapes
      // New shape we currently return: { ok: true, user_id }
      // Some versions return: { ok: true, code, user_email, ... }
      if (!data || data.ok !== true) {
        console.error('[invite-user] unexpected response:', data);
        toast.error('Failed to send invite: Unexpected response from invite-user');
        return;
      }

      // Optional: if your UI needs the email, use the customer's email as fallback
      const invitedEmail = data.user_email || customer?.email || email;

      // Handle response data based on status
      if (data?.status === 'invited') {
        // New invite sent successfully
        toast.success(`Invite sent to ${invitedEmail}`);

        // Write audit log
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user && companyId) {
            await supabase.rpc('insert_audit_log', {
              p_company_id: companyId,
              p_entity_type: 'customer',
              p_entity_id: customer.id,
              p_action: 'customer_invited',
              p_metadata: {
                email: customer.email,
                customer_name: customer.full_name
              }
            });
          }
        } catch (auditError) {
          console.warn('Failed to write audit log for invite:', auditError);
          // Don't fail the invite if audit log fails
        }
      } else if (data?.status === 'already_registered') {
        // User already exists - show friendly info message
        toast.success(`This customer already has an account. No new invite was sent.`, {
          icon: 'ℹ️',
        });
      } else if (data?.error) {
        // Edge function returned an error in the response body
        console.error('Error from invite-user:', data.error);
        toast.error(`Failed to send invite: ${data.error}`);
      } else {
        // Success response with ok: true (new response shape like { ok: true, user_id })
        toast.success(`Invite sent to ${invitedEmail}`);
      }
    } catch (err) {
      console.error('Error inviting customer:', err);
      toast.error('Failed to send invite');
    }
  };

  const handleViewJobs = async (customerId) => {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('customer_id', customerId)
    .order('service_date', { ascending: false });

  if (!error) {
    setCustomerJobs(prev => ({
  ...prev,
  [customerId]: {
    ...prev[customerId],
    jobs: jobs
  }
}));
  }

  // ✅ Fetch recurring job info too
const { data: recurringData } = await supabase
  .from("recurring_jobs")
  .select("start_date, recurrence_type")
  .eq("customer_id", customerId);

if (recurringData?.length) {
  const getNextDates = (startDate, recurrenceType, count = 3) => {
    const output = [];
    let next = new Date(startDate);
    const today = new Date();

    // Advance to the first upcoming job date
    while (next <= today) {
      if (recurrenceType === "weekly") next.setDate(next.getDate() + 7);
      else if (recurrenceType === "biweekly") next.setDate(next.getDate() + 14);
      else if (recurrenceType === "monthly") next.setMonth(next.getMonth() + 1);
      else return [];
    }

    // Push next N dates
    for (let i = 0; i < count; i++) {
      output.push(new Date(next));
      if (recurrenceType === "weekly") next.setDate(next.getDate() + 7);
      else if (recurrenceType === "biweekly") next.setDate(next.getDate() + 14);
      else if (recurrenceType === "monthly") next.setMonth(next.getMonth() + 1);
    }

    return output.map(d => d.toISOString().split("T")[0]);
  };

  const upcoming = recurringData.flatMap(r =>
    getNextDates(r.start_date, r.recurrence_type)
  );

  setCustomerJobs(prev => ({
  ...prev,
  [customerId]: {
    ...prev[customerId],
    recurringPreview: upcoming
  }
}));
}
};

  const handleCreateJob = async (customerId) => {
  if (supportMode) {
    toast.error("Job creation is disabled in support mode.");
    return;
  }
  
  if (billingDisabled) {
    toast.error(billingReason || "Job creation is disabled due to billing status.");
    return;
  }

  // Proactive limit check for monthly job limit
  if (!limitsLoading && !canCreateJob) {
    setShowUpgradeModal(true);
    return;
  }

  const job = {
    customer_id: customerId,
    company_id: companyId, // RLS trigger also fills this if missing
    service_date: newJob.service_date || null,
    services_performed: newJob.services_performed?.trim() || null,
    job_cost: newJob.job_cost ? parseFloat(newJob.job_cost) : 0,
    assigned_team_id: newJob.assigned_team_id || null,
    status: 'Pending',
  };

  const { error } = await supabase.from('jobs').insert([job]);

  if (error) {
    console.error('Job insert failed:', error);
    // Check for plan limit errors first
    if (!handlePlanLimitError(error, navigate)) {
      // Fallback to existing error handling for non-limit errors
      toast.error(error.message || 'Job creation failed');
    }
    return;
  }

  toast.success('Job created!');
  setNewJob({ service_date: '', services_performed: '', job_cost: '', assigned_team_id: '' });
  setCreatingJobFor(null);
  // Refresh jobs if detail drawer is open for this customer
  if (detailCustomerId === customerId) {
    await handleViewJobs(customerId);
  }
  // Refresh customer list
  await fetchCustomers();
};


  const handleDownloadPDF = async (customerId) => {
  const customer = customers.find(c => c.id === customerId);
  if (!customer) {
    toast.error('Customer not found.');
    return;
  }

  // Ensure jobs are loaded
  if (!customerJobs[customerId]?.jobs) {
    await handleViewJobs(customerId);
  }

  const jobs = customerJobs[customerId]?.jobs || [];

  if (jobs.length === 0) {
  toast.error(`No jobs found for this ${customerLabel.toLowerCase()}.`);
  return;
}

  generateCustomerJobHistoryPDF(customer, jobs);
};

  // Timeline helper: Get event icon
  const getEventIcon = (event) => {
    const relatedType = event.related_type || '';
    const eventType = event.event_type || '';
    
    if (relatedType === 'job' || eventType.includes('job')) {
      return <Briefcase className="h-4 w-4" />;
    } else if (relatedType === 'quote' || eventType.includes('quote')) {
      return <FileText className="h-4 w-4" />;
    } else if (relatedType === 'payment' || eventType.includes('payment')) {
      return <DollarSign className="h-4 w-4" />;
    } else if (relatedType === 'expense' || eventType.includes('expense')) {
      return <Receipt className="h-4 w-4" />;
    } else if (relatedType === 'schedule_request' || eventType.includes('schedule')) {
      return <CalendarCheck className="h-4 w-4" />;
    } else if (eventType.includes('note')) {
      return <StickyNote className="h-4 w-4" />;
    } else if (eventType.includes('customer')) {
      return <User className="h-4 w-4" />;
    }
    return <Clock className="h-4 w-4" />;
  };

  // Timeline helper: Get badge colors
  const getBadgeColors = (event) => {
    const severity = event.severity || 'info';
    const category = event.event_category || '';
    const eventType = event.event_type || '';
    
    let categoryColor = 'bg-slate-100 text-slate-700';
    if (category === 'jobs') categoryColor = 'bg-blue-100 text-blue-700';
    else if (category === 'quotes') categoryColor = 'bg-purple-100 text-purple-700';
    else if (category === 'payments') categoryColor = 'bg-green-100 text-green-700';
    else if (category === 'expenses') categoryColor = 'bg-orange-100 text-orange-700';
    else if (category === 'schedule') categoryColor = 'bg-indigo-100 text-indigo-700';
    else if (category === 'customer') categoryColor = 'bg-cyan-100 text-cyan-700';
    
    let severityColor = 'bg-slate-100 text-slate-700';
    if (severity === 'success') severityColor = 'bg-green-100 text-green-700';
    else if (severity === 'warning') severityColor = 'bg-amber-100 text-amber-700';
    else if (severity === 'error') severityColor = 'bg-red-100 text-red-700';
    
    let typeColor = 'bg-slate-100 text-slate-700';
    if (eventType === 'customer.created') typeColor = 'bg-green-100 text-green-700';
    else if (eventType === 'customer.updated') typeColor = 'bg-blue-100 text-blue-700';
    else if (eventType === 'customer.note_added') typeColor = 'bg-purple-100 text-purple-700';
    else if (eventType.includes('job.created')) typeColor = 'bg-blue-100 text-blue-700';
    else if (eventType.includes('job.completed')) typeColor = 'bg-green-100 text-green-700';
    else if (eventType.includes('job.canceled')) typeColor = 'bg-red-100 text-red-700';
    else if (eventType.includes('quote')) typeColor = 'bg-purple-100 text-purple-700';
    else if (eventType.includes('payment')) typeColor = 'bg-green-100 text-green-700';
    
    return { categoryColor, severityColor, typeColor };
  };

  // Timeline helper: Navigate to related entity
  const handleOpenRelated = (event) => {
    if (!event.related_type || !event.related_id) return;
    
    const { related_type, related_id } = event;
    
    try {
      if (related_type === 'job') {
        // Try schedule first, fallback to jobs
        navigate(`/admin/operations?tab=schedule&jobId=${related_id}`);
      } else if (related_type === 'quote') {
        navigate(`/admin/quotes?quoteId=${related_id}`);
      } else if (related_type === 'payment') {
        navigate(`/admin/payments?paymentId=${related_id}`);
      } else if (related_type === 'expense') {
        navigate(`/admin/expenses?expenseId=${related_id}`);
      } else if (related_type === 'schedule_request') {
        navigate(`/admin/operations?tab=schedule&scheduleTab=requests&jobId=${related_id}`);
      }
    } catch (err) {
      console.warn('Failed to navigate to related entity:', err);
      // Fallback to base pages
      if (related_type === 'job') navigate('/admin/jobs');
      else if (related_type === 'quote') navigate('/admin/quotes');
      else if (related_type === 'payment') navigate('/admin/payments');
      else if (related_type === 'expense') navigate('/admin/expenses');
      else if (related_type === 'schedule_request') navigate('/admin/operations?tab=schedule&scheduleTab=requests');
    }
  };

  // Timeline helper: Group events by day
  const groupEventsByDay = useMemo(() => {
    return (events) => {
      if (!events || events.length === 0) return {};
      
      const grouped = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      events.forEach(event => {
        const eventDate = new Date(event.created_at);
        eventDate.setHours(0, 0, 0, 0);
        
        let dayKey;
        if (eventDate.getTime() === today.getTime()) {
          dayKey = 'Today';
        } else if (eventDate.getTime() === yesterday.getTime()) {
          dayKey = 'Yesterday';
        } else {
          dayKey = eventDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
        }
        
        if (!grouped[dayKey]) {
          grouped[dayKey] = [];
        }
        grouped[dayKey].push(event);
      });
      
      return grouped;
    };
  }, []);

  // Timeline helper: Filter events by search text (client-side)
  const filterEventsBySearch = useMemo(() => {
    return (events, searchText) => {
      if (!searchText || !searchText.trim()) return events;
      
      const search = searchText.toLowerCase().trim();
      return events.filter(event => {
        const title = (event.event_title || '').toLowerCase();
        const description = (event.event_description || '').toLowerCase();
        const type = (event.event_type || '').toLowerCase();
        const category = (event.event_category || '').toLowerCase();
        return title.includes(search) || description.includes(search) || 
               type.includes(search) || category.includes(search);
      });
    };
  }, []);

  // Helper: Resolve assignee for a job (team-based only)
  const resolveAssignee = useMemo(() => {
    // Build team display name helper
    const getTeamDisplayName = (teamId) => {
      if (!teamId) return 'Unassigned';
      const team = teams.find(t => t.id === teamId);
      if (!team) return 'Unassigned';
      
      // Check if team-of-one (single member)
      const members = teamMembers.filter(tm => tm.team_id === teamId);
      if (members.length === 1 && members[0].crew_members?.full_name) {
        return members[0].crew_members.full_name;
      }
      
      return team.name;
    };
    
    return (job) => {
      // If assigned_team_id exists, use it
      if (job.assigned_team_id) {
        return getTeamDisplayName(job.assigned_team_id);
      }
      
      // Unassigned
      return 'Unassigned';
    };
  }, [teams, teamMembers]);

  // Priority score function
  const getPriorityScore = (customer) => {
    const labelData = smartLabels[customer.id] || { labels: [], outstandingCents: 0, nextJobDate: null, lastActivityAt: null };
    const labels = labelData.labels || [];
    
    // Priority order: Overdue (highest) > Unpaid > Upcoming > Paid Up > No Jobs (lowest)
    let priority = 0;
    if (labels.includes('Overdue')) priority = 5;
    else if (labels.includes('Unpaid')) priority = 4;
    else if (labels.includes('Upcoming')) priority = 3;
    else if (labels.includes('Paid Up')) priority = 2;
    else if (labels.includes('No Jobs')) priority = 1;
    
    return priority;
  };

  // Sort customers based on sortBy
  const sortCustomers = (customersList, sortType) => {
    const sorted = [...customersList];
    
    sorted.sort((a, b) => {
      const aData = smartLabels[a.id] || { outstandingCents: 0, nextJobDate: null, lastActivityAt: null, labels: [] };
      const bData = smartLabels[b.id] || { outstandingCents: 0, nextJobDate: null, lastActivityAt: null, labels: [] };
      
      if (sortType === 'priority') {
        const aPriority = getPriorityScore(a);
        const bPriority = getPriorityScore(b);
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }
        
        // Tie-breakers
        // 1) outstanding amount desc
        if (aData.outstandingCents !== bData.outstandingCents) {
          return bData.outstandingCents - aData.outstandingCents;
        }
        
        // 2) nextJobDate asc (soonest first)
        if (aData.nextJobDate && bData.nextJobDate) {
          if (aData.nextJobDate !== bData.nextJobDate) {
            return aData.nextJobDate.localeCompare(bData.nextJobDate);
          }
        } else if (aData.nextJobDate) return -1;
        else if (bData.nextJobDate) return 1;
        
        // 3) lastActivityAt desc (most recent first)
        if (aData.lastActivityAt && bData.lastActivityAt) {
          if (aData.lastActivityAt !== bData.lastActivityAt) {
            return bData.lastActivityAt.localeCompare(aData.lastActivityAt);
          }
        } else if (aData.lastActivityAt) return -1;
        else if (bData.lastActivityAt) return 1;
        
        // 4) name asc
        return (a.full_name || '').localeCompare(b.full_name || '');
        
      } else if (sortType === 'outstanding') {
        // Outstanding (High → Low)
        if (aData.outstandingCents !== bData.outstandingCents) {
          return bData.outstandingCents - aData.outstandingCents;
        }
        return (a.full_name || '').localeCompare(b.full_name || '');
        
      } else if (sortType === 'nextJobDate') {
        // Next Job Date (Soonest)
        if (aData.nextJobDate && bData.nextJobDate) {
          if (aData.nextJobDate !== bData.nextJobDate) {
            return aData.nextJobDate.localeCompare(bData.nextJobDate);
          }
        } else if (aData.nextJobDate) return -1;
        else if (bData.nextJobDate) return 1;
        else if (!aData.nextJobDate && !bData.nextJobDate) {
          // Both null, sort by priority then name
          const aPriority = getPriorityScore(a);
          const bPriority = getPriorityScore(b);
          if (aPriority !== bPriority) return bPriority - aPriority;
          return (a.full_name || '').localeCompare(b.full_name || '');
        }
        return 0;
        
      } else if (sortType === 'lastActivity') {
        // Last Activity (Most Recent)
        if (aData.lastActivityAt && bData.lastActivityAt) {
          if (aData.lastActivityAt !== bData.lastActivityAt) {
            return bData.lastActivityAt.localeCompare(aData.lastActivityAt);
          }
        } else if (aData.lastActivityAt) return -1;
        else if (bData.lastActivityAt) return 1;
        return (a.full_name || '').localeCompare(b.full_name || '');
        
      } else if (sortType === 'name') {
        // Name (A → Z)
        return (a.full_name || '').localeCompare(b.full_name || '');
      }
      
      return 0;
    });
    
    return sorted;
  };

  // Filter customers based on saved view
  const filterCustomersByView = (customersList) => {
    if (savedView === 'all') {
      return customersList;
    } else if (savedView === 'collections') {
      // Unpaid OR Overdue
      return customersList.filter(c => {
        const labels = smartLabels[c.id]?.labels || [];
        return labels.includes('Unpaid') || labels.includes('Overdue');
      });
    } else if (savedView === 'scheduling') {
      // Upcoming
      return customersList.filter(c => {
        const labels = smartLabels[c.id]?.labels || [];
        return labels.includes('Upcoming');
      });
    } else if (savedView === 'paidUp') {
      // Paid Up
      return customersList.filter(c => {
        const labels = smartLabels[c.id]?.labels || [];
        return labels.includes('Paid Up');
      });
    } else if (savedView === 'noJobs') {
      // No Jobs
      return customersList.filter(c => {
        const labels = smartLabels[c.id]?.labels || [];
        return labels.includes('No Jobs');
      });
    }
    return customersList;
  };

  // Handle saved view change
  const handleSavedViewChange = (view) => {
    setSavedView(view);
    // Note: Not persisting to localStorage for v1 - always defaults to 'all' on page entry
    
    // Apply view-specific sort defaults
    const forcedSort = getForcedSort(view);
    if (forcedSort) {
      setSortBy(forcedSort);
      localStorage.setItem('customers_sort_by', forcedSort);
    } else if (view === 'paidUp' || view === 'noJobs') {
      setSortBy('name');
      localStorage.setItem('customers_sort_by', 'name');
    } else {
      setSortBy('priority');
      localStorage.setItem('customers_sort_by', 'priority');
    }
    
    // Reset smart filter when switching views
    setSmartFilter('all');
  };

  // Handle sort change
  const handleSortChange = (newSort) => {
    const forcedSort = getForcedSort(savedView);
    
    // If view forces a sort, don't allow change (or switch to All view)
    if (forcedSort && newSort !== forcedSort) {
      // Switch to All view when trying to change forced sort
      setSavedView('all');
      // Note: Not persisting to localStorage for v1
    }
    
    setSortBy(newSort);
    localStorage.setItem('customers_sort_by', newSort);
    
    // If manually changing sort and not in forced view, switch to "All" view
    if (!forcedSort && savedView !== 'all') {
      setSavedView('all');
      // Note: Not persisting to localStorage for v1
    }
  };

  // Handle smart filter change
  const handleSmartFilterChange = (filter) => {
    setSmartFilter(filter);
    
    // If manually changing filter, switch to "All" view
    if (savedView !== 'all') {
      setSavedView('all');
      // Note: Not persisting to localStorage for v1
    }
  };

  // Get filtered and sorted customers
  const displayedCustomers = useMemo(() => {
    let filtered = customers;
    
    // Apply smart filter (if not using saved view)
    if (smartFilter !== 'all') {
      filtered = filtered.filter(c => {
        const labels = smartLabels[c.id]?.labels || [];
        return labels.includes(smartFilter);
      });
    }
    
    // Apply saved view filter
    filtered = filterCustomersByView(filtered);
    
    // Apply sorting (use forced sort if view requires it)
    const effectiveSort = getForcedSort(savedView) || sortBy;
    const sorted = sortCustomers(filtered, effectiveSort);
    
    return sorted;
  }, [customers, smartLabels, smartFilter, savedView, sortBy]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customerLabel} Management`}
        subtitle="Manage customers, notes, job history, and quick actions."
        actions={
          <BillingGuard>
            <Button variant="primary" onClick={handleNewCustomer} disabled={supportMode || billingDisabled} title={supportMode ? "Customer creation is disabled in support mode" : billingDisabled ? billingReason : undefined}>
              + New {customerLabel}
            </Button>
          </BillingGuard>
        }
      />

      {/* Plan Usage */}
      <LimitCard
        label={`${customerLabel}s`}
        current={usage.current_customers}
        limit={limits.max_customers}
        isLoading={limitsLoading}
      />

      {/* Approaching Limit Warning */}
      <LimitWarningBanner
        label={`${customerLabel}s`}
        current={usage.current_customers}
        limit={limits.max_customers}
        isLoading={limitsLoading}
      />

      <Drawer
        open={isCustomerDrawerOpen}
        title={editingId ? `Edit ${customerLabel}` : `New ${customerLabel}`}
        onClose={() => setIsCustomerDrawerOpen(false)}
        disableClose={isSavingCustomer}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              type="button"
              onClick={() => setIsCustomerDrawerOpen(false)}
              disabled={isSavingCustomer}
            >
              Cancel
            </Button>
            <BillingGuard>
              <Button
                variant="primary"
                type="submit"
                form="customer-form"
                disabled={isSavingCustomer || billingDisabled}
                title={billingDisabled ? billingReason : undefined}
              >
                {isSavingCustomer ? "Saving..." : "Save"}
              </Button>
            </BillingGuard>
          </div>
        }
      >
        <form id="customer-form" onSubmit={handleSubmit}>
          {(() => {
            const inputClass = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300";
            const textareaClass = inputClass + " resize-y";
            const selectClass = inputClass;

            return (
              <div className="space-y-5">
                {/* Details Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Details</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="full_name"
                        type="text"
                        value={form.full_name}
                        onChange={handleChange}
                        className={inputClass}
                        required
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={handleChange}
                          className={inputClass}
                          required
                          disabled={billingDisabled}
                          readOnly={billingDisabled}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700">Phone</label>
                        <input
                          name="phone"
                          type="tel"
                          value={form.phone}
                          onChange={handleChange}
                          className={inputClass}
                          disabled={billingDisabled}
                          readOnly={billingDisabled}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Address Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Address</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Street</label>
                      <input
                        name="address"
                        type="text"
                        value={form.address}
                        onChange={handleChange}
                        className={inputClass}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-200" />

                {/* Account / Notes Section */}
                <section className="pt-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Account</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Tags</label>
                      <input
                        name="tags"
                        type="text"
                        placeholder="Tags (comma-separated)"
                        value={form.tags}
                        onChange={handleChange}
                        className={inputClass}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-700">Notes</label>
                      <textarea
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        className={textareaClass}
                        rows={4}
                        disabled={billingDisabled}
                        readOnly={billingDisabled}
                      />
                    </div>
                  </div>
                </section>
              </div>
            );
          })()}
        </form>
      </Drawer>

      {selectedCustomers.length > 0 && (
        <Card>
          <Button
            variant="primary"
            onClick={() => {
              const addresses = customers
                .filter(c => selectedCustomers.includes(c.id))
                .map(c => encodeURIComponent(c.address));
              const mapsUrl = `https://www.google.com/maps/dir/${addresses.join('/')}`;
              window.open(mapsUrl, '_blank');
            }}
          >
            Plan Route for Selected {customerLabelPlural}
          </Button>
        </Card>
      )}

      {/* Saved Views */}
      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-700">Views:</span>
          {['all', 'collections', 'scheduling', 'paidUp', 'noJobs'].map(view => {
            const viewLabels = {
              all: 'All',
              collections: 'Collections',
              scheduling: 'Scheduling',
              paidUp: 'Paid Up',
              noJobs: 'No Jobs'
            };
            const isSelected = savedView === view;
            return (
              <button
                key={view}
                onClick={() => handleSavedViewChange(view)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {viewLabels[view]}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Smart Filter & Sort */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-700">Smart Filter:</label>
          <select
            value={smartFilter}
            onChange={(e) => handleSmartFilterChange(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300"
          >
            <option value="all">All</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Overdue">Overdue</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Paid Up">Paid Up</option>
            <option value="No Jobs">No Jobs</option>
          </select>
          
          <label className="text-sm font-medium text-slate-700 ml-3">Sort By:</label>
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
            disabled={getForcedSort(savedView) !== null}
            className={`rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 ${
              getForcedSort(savedView) !== null ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title={getForcedSort(savedView) !== null ? 'Sort is fixed for this view' : ''}
          >
            <option value="priority">Priority</option>
            <option value="outstanding">Outstanding (High → Low)</option>
            <option value="nextJobDate">Next Job Date (Soonest)</option>
            <option value="lastActivity">Last Activity (Most Recent)</option>
            <option value="name">Name (A → Z)</option>
          </select>
        </div>
      </Card>

      {displayedCustomers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={`No ${customerLabelPlural.toLowerCase()} yet`}
            description={`Create your first ${customerLabel.toLowerCase()} to start managing jobs, quotes, and invoices.`}
            actionLabel={`Create Your First ${customerLabel}`}
            onAction={supportMode ? () => toast.error("Customer creation is disabled in support mode.") : handleNewCustomer}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedCustomers.map(c => (
            <CustomerCard
              key={c.id}
              customer={c}
              customerLabel={customerLabel}
              hasUnpaidJobs={c.hasUnpaidJobs}
              hasUpcomingJobs={c.hasUpcomingJobs}
                smartLabels={c.smartLabels || []}
              isSelected={selectedCustomers.includes(c.id)}
              onToggleSelection={toggleCustomerSelection}
                onViewJobsToggle={(id) => handleOpenDetail(id, 'jobs')}
                onCreateJob={(id) => {
                  setCreatingJobFor(id);
                  handleOpenDetail(id, 'jobs');
                }}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onOpenTimeline={handleOpenTimeline}
                onOpenDetail={(id) => handleOpenDetail(id, 'overview')}
              onInviteToPortal={handleInviteToPortal}
              onSetPassword={handleSetPassword}
              onCreateLogin={handleCreateLogin}
              supportMode={supportMode}
              />
            ))}
        </div>
      )}

      {/* Customer Detail Drawer */}
      {detailOpen && detailCustomerId && (() => {
        const customer = customers.find(c => c.id === detailCustomerId);
        if (!customer) return null;

        const tabs = ['overview', 'jobs', 'notes', 'timeline', 'files', 'invoices', 'actions'];
        const tabLabels = {
          overview: 'Overview',
          jobs: 'Jobs',
          notes: 'Notes',
          timeline: 'Timeline',
          files: 'Files',
          invoices: 'Invoices',
          actions: 'Actions'
        };

                    return (
          <Drawer
            open={detailOpen}
            title={customer.full_name}
            onClose={handleCloseDetail}
            widthClass="w-full sm:w-[640px]"
          >
            {/* Tabs */}
            <div className="border-b border-slate-200 mb-6">
              <nav className="flex gap-0.5 overflow-x-auto -mb-px" aria-label="Customer detail tabs">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      if (tab === 'overview') {
                        fetchCustomerKpis(detailCustomerId);
                      } else if (tab === 'jobs' && !customerJobs[detailCustomerId]?.jobs) {
                        handleViewJobs(detailCustomerId);
                      } else if (tab === 'notes' && !customerNotes[detailCustomerId]) {
                        fetchNotesForCustomer(detailCustomerId);
                      } else if (tab === 'timeline' && !timelineEvents[detailCustomerId]) {
                        if (!timelineFilters[detailCustomerId]) {
                          setTimelineFilters(prev => ({ ...prev, [detailCustomerId]: {} }));
                        }
                        fetchCustomerTimeline(detailCustomerId, timelineFilters[detailCustomerId] || {});
                      } else if (tab === 'files' && !customerFiles[detailCustomerId]) {
                        fetchCustomerFiles(detailCustomerId);
                      } else if (tab === 'invoices' && !invoiceRows[detailCustomerId]) {
                        fetchCustomerInvoices(detailCustomerId);
                      }
                    }}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      activeTab === tab
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                    }`}
                  >
                    {tabLabels[tab]}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Tiles */}
                  <FinancialKPICards
                    data={kpiData[detailCustomerId]}
                    loading={kpiLoading[detailCustomerId]}
                    error={kpiError[detailCustomerId]}
                    className="gap-4"
                  />

                  {/* Quick Actions */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      <BillingGuard>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setCreatingJobFor(detailCustomerId);
                            setActiveTab('jobs');
                          }}
                          className="flex items-center gap-2"
                          disabled={billingDisabled}
                          title={billingDisabled ? billingReason : undefined}
                        >
                          <Briefcase className="h-4 w-4" />
                          Create Job
                        </Button>
                      </BillingGuard>
                      <BillingGuard>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigate(`/admin/quotes/new?customer_id=${detailCustomerId}`);
                          }}
                          className="flex items-center gap-2"
                          disabled={billingDisabled}
                          title={billingDisabled ? billingReason : undefined}
                        >
                          <FileText className="h-4 w-4" />
                          Create Quote
                        </Button>
                      </BillingGuard>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact & details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      {customer.email && (
                        <div>
                          <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">Email</span>
                          <p className="text-slate-900 truncate" title={customer.email}>{customer.email}</p>
                        </div>
                      )}
                      {customer.phone && (
                        <div>
                          <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">Phone</span>
                          <p className="text-slate-900">{customer.phone}</p>
                        </div>
                      )}
                      {customer.address && (
                        <div className="sm:col-span-2">
                          <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">Address</span>
                          <p className="text-slate-900">{customer.address}</p>
                        </div>
                      )}
                    </div>
                    {customer.tags && customer.tags.length > 0 && (
                      <div>
                        <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Tags</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(customer.tags) ? customer.tags : []).map((tag, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {customer.notes && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Notes</span>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{customer.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Jobs Tab */}
              {activeTab === 'jobs' && (
                <div className="space-y-5">
                  {customerJobs[detailCustomerId]?.recurringPreview?.length > 0 && (
                    <div className="rounded-xl border border-green-200 bg-green-50/80 p-4">
                      <h3 className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2">Upcoming Recurring Jobs</h3>
                      <ul className="list-disc ml-4 space-y-0.5 text-sm text-green-800">
                        {customerJobs[detailCustomerId].recurringPreview.map((date, i) => (
                          <li key={i}>{date}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {customerJobs[detailCustomerId]?.jobs ? (
                    customerJobs[detailCustomerId].jobs.length > 0 ? (
                      <ul className="space-y-3">
                        {customerJobs[detailCustomerId].jobs.map(job => (
                          <li key={job.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-900">
                                  {job.service_date ? formatDate(job.service_date) : 'No date'}
                                </div>
                                <div className="text-sm text-slate-600 mt-0.5">
                                  {job.services_performed || 'No description'}
                                </div>
                                <div className="text-xs text-slate-500 mt-1.5">
                                  {formatCurrencyFixed(job.job_cost || 0)} · {resolveAssignee(job)} · {job.status}
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-10">No jobs found.</p>
                    )
                  ) : (
                    <div className="text-center py-10">
                      <LoadingSpinner size="md" text="Loading jobs..." />
                    </div>
                  )}
                </div>
              )}

              {/* Notes Tab */}
              {activeTab === 'notes' && (
                <div className="space-y-5">
                  {(customerNotes[detailCustomerId] || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-12 px-4 text-center">
                      <StickyNote className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                      <p className="text-sm font-medium text-slate-600">No notes yet</p>
                      <p className="text-xs text-slate-500 mt-1">Add a note below to keep track of conversations and follow-ups.</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {customerNotes[detailCustomerId].map(note => (
                        <li key={note.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm relative">
                          <p className="text-sm text-slate-900 pr-8">{note.note}</p>
                          <div className="text-xs text-slate-500 mt-2">
                            {formatDate(note.created_at)} — {note.author}
                          </div>
                          <BillingGuard>
                            <Button
                              onClick={() => handleDeleteNote(note.id, detailCustomerId)}
                              variant="tertiary"
                              size="sm"
                              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
                              title={billingDisabled ? billingReason : "Delete note"}
                              disabled={billingDisabled}
                            >
                              🗑
                            </Button>
                          </BillingGuard>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote(detailCustomerId);
                        }
                      }}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                      disabled={billingDisabled}
                      readOnly={billingDisabled}
                    />
                    <BillingGuard>
                      <Button
                        onClick={() => handleAddNote(detailCustomerId)}
                        variant="primary"
                        size="sm"
                        disabled={billingDisabled}
                        title={billingDisabled ? billingReason : undefined}
                      >
                        Add Note
                      </Button>
                    </BillingGuard>
                  </div>
                </div>
              )}

              {/* Timeline Tab */}
              {activeTab === 'timeline' && (() => {
                const filters = timelineFilters[detailCustomerId] || {};
                const searchText = timelineSearch[detailCustomerId] || '';
                const allEvents = timelineEvents[detailCustomerId] || [];
                const filteredEvents = filterEventsBySearch(allEvents, searchText);
                const groupedEvents = groupEventsByDay(filteredEvents);
                const eventTypes = [...new Set(allEvents.map(e => e.event_type).filter(Boolean))].sort();
                const categories = [...new Set(allEvents.map(e => e.event_category).filter(Boolean))].sort();
                
                return (
                  <div className="space-y-5">
                    {/* Controls */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search timeline..."
                          value={searchText}
                          onChange={(e) => setTimelineSearch(prev => ({ ...prev, [detailCustomerId]: e.target.value }))}
                          className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <select
                          value={filters.category || 'all'}
                          onChange={(e) => handleTimelineFilterChange(detailCustomerId, 'category', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                        >
                          <option value="all">All Categories</option>
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        
                        {/* Type Filter */}
                        <select
                          value={filters.type || 'all'}
                          onChange={(e) => handleTimelineFilterChange(detailCustomerId, 'type', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                        >
                          <option value="all">All Types</option>
                          {eventTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
            </select>
                        
                        <input
                          type="date"
                          value={filters.dateStart || ''}
                          onChange={(e) => handleTimelineFilterChange(detailCustomerId, 'dateStart', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                          placeholder="Start date"
                        />
                        <input
                          type="date"
                          value={filters.dateEnd || ''}
                          onChange={(e) => handleTimelineFilterChange(detailCustomerId, 'dateEnd', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                          placeholder="End date"
                        />
                      </div>
                      {(filters.category || filters.type || filters.dateStart || filters.dateEnd || searchText) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="tertiary"
                            onClick={() => {
                              setTimelineSearch(prev => ({ ...prev, [detailCustomerId]: '' }));
                              handleClearTimelineFilters(detailCustomerId);
                            }}
                            className="text-sm"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Clear Filters
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => fetchCustomerTimeline(detailCustomerId, filters)}
                            className="text-sm"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Refresh
                          </Button>
                        </div>
                      )}
          </div>

          {/* Loading State */}
          {timelineLoading && (
            <div className="text-center py-8">
              <LoadingSpinner size="md" text="Loading timeline..." />
            </div>
          )}

          {timelineError[detailCustomerId] && !timelineLoading && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-800 mb-3">{timelineError[detailCustomerId]}</p>
              <Button variant="primary" size="sm" onClick={() => fetchCustomerTimeline(detailCustomerId, filters)}>
                Retry
              </Button>
            </div>
          )}

          {!timelineLoading && !timelineError[detailCustomerId] && Object.keys(groupedEvents).length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-12 px-4">
              <TimelineEmptyState />
            </div>
          )}

                    {!timelineLoading && !timelineError[detailCustomerId] && Object.keys(groupedEvents).length > 0 && (
                      <div className="space-y-6 max-h-[60vh] overflow-y-auto">
                        {Object.entries(groupedEvents).map(([dayKey, dayEvents]) => (
                          <div key={dayKey} className="space-y-3">
                            <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 pb-2 pt-1 z-10">
                              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dayKey}</h3>
                            </div>
                            {dayEvents.map((event) => {
                              const eventDate = new Date(event.created_at);
                              const formattedTime = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              const { categoryColor, severityColor, typeColor } = getBadgeColors(event);
                              return (
                                <div
                                  key={event.id}
                                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    <div className="flex-shrink-0 mt-0.5 text-slate-500">
                                      {getEventIcon(event)}
                        </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2 mb-1">
                                        <h4 className="text-sm font-semibold text-slate-900">
                          {event.event_title}
                        </h4>
                                        {event.related_type && event.related_id && (
                                          <Button
                                            variant="tertiary"
                                            onClick={() => handleOpenRelated(event)}
                                            className="text-xs px-2 py-1 flex-shrink-0"
                                          >
                                            Open
                                          </Button>
                                        )}
                                      </div>
                                      
                        {event.event_description && (
                          <p className="text-sm text-slate-600 mb-2">
                            {event.event_description}
                          </p>
                        )}
                                      
                                      {/* Meta Line */}
                                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                                          <span>{formattedTime}</span>
                                        </div>
                                        
                                        {event.event_category && (
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor}`}>
                                            {event.event_category}
                                          </span>
                                        )}
                                        
                                        {event.severity && event.severity !== 'info' && (
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${severityColor}`}>
                                            {event.severity}
                                          </span>
                                        )}
                                        
                                        {event.event_type && (
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                                            {event.event_type}
                                          </span>
                                        )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
                          </div>
                        ))}
            </div>
          )}
        </div>
                );
              })()}

              {/* Files Tab */}
              {activeTab === 'files' && (
                <div className="space-y-5">
                  {/* Upload Section */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer transition-colors w-fit">
                      <Upload className="h-4 w-4 text-slate-600" />
                      <span className="text-sm font-medium text-slate-700">Upload files</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleUploadCustomerFiles(detailCustomerId, e.target.files);
                            e.target.value = '';
                          }
                        }}
                        disabled={uploadLoading[detailCustomerId] || billingDisabled}
                      />
                    </label>
                    {uploadLoading[detailCustomerId] && (
                      <span className="text-sm text-slate-500 ml-3">Uploading...</span>
                    )}
                  </div>

                  {/* Loading State */}
                  {filesLoading[detailCustomerId] && (
                    <div className="text-center py-10 text-slate-500 text-sm">Loading files...</div>
                  )}

                  {/* Error State */}
                  {filesError[detailCustomerId] && !filesLoading[detailCustomerId] && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                      <p className="text-sm text-red-800 mb-3">{filesError[detailCustomerId]}</p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => fetchCustomerFiles(detailCustomerId)}
                      >
                        Retry
                      </Button>
                    </div>
                  )}

                  {/* Files List */}
                  {!filesLoading[detailCustomerId] && !filesError[detailCustomerId] && (
                    <>
                      {(customerFiles[detailCustomerId] || []).length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-12 px-4 text-center">
                          <File className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                          <p className="text-sm font-medium text-slate-600">No files yet</p>
                          <p className="text-xs text-slate-500 mt-1">Upload documents, photos, or other files for this customer.</p>
                        </div>
                      ) : (
                        <ul className="space-y-3">
                          {customerFiles[detailCustomerId].map(file => (
                            <li
                              key={file.id}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <File className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-900 truncate">
                                      {file.file_name}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                      {formatDate(file.created_at)} •{' '}
                                      {file.size_bytes
                                        ? `${(file.size_bytes / 1024).toFixed(1)} KB`
                                        : 'Unknown size'}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    variant="tertiary"
                                    onClick={() => handleOpenCustomerFile(file)}
                                    className="text-xs p-1.5"
                                    title="Preview/Open"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="tertiary"
                                    onClick={() => handleDownloadCustomerFile(file)}
                                    className="text-xs p-1.5"
                                    title="Download"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <BillingGuard>
                                    <Button
                                      variant="tertiary"
                                      onClick={() => handleDeleteCustomerFile(file, detailCustomerId)}
                                      className="text-xs p-1.5 text-red-600 hover:text-red-700"
                                      title={billingDisabled ? billingReason : "Delete"}
                                      disabled={billingDisabled}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </BillingGuard>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Invoices Tab */}
              {activeTab === 'invoices' && (
                <div className="space-y-5">
                  {/* Loading State */}
                  {invoiceLoading[detailCustomerId] && (
                    <div className="text-center py-8">
                      <LoadingSpinner size="md" text="Loading invoices..." />
                    </div>
                  )}

                  {invoiceError[detailCustomerId] && !invoiceLoading[detailCustomerId] && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                      <p className="text-sm text-red-800 mb-3">{invoiceError[detailCustomerId]}</p>
                      <Button variant="primary" size="sm" onClick={() => fetchCustomerInvoices(detailCustomerId)}>
                        Retry
                      </Button>
                    </div>
                  )}

                  {/* Invoices List */}
                  <InvoiceList
                    invoices={invoiceRows[detailCustomerId] || []}
                    loading={invoiceLoading[detailCustomerId]}
                    error={invoiceError[detailCustomerId]}
                    onRetry={() => fetchCustomerInvoices(detailCustomerId)}
                  />
                </div>
              )}

              {/* Actions Tab */}
              {activeTab === 'actions' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Jobs & quotes</h3>
                    <div className="flex flex-wrap gap-3">
                      <BillingGuard>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setCreatingJobFor(detailCustomerId);
                            setActiveTab('jobs');
                          }}
                          className="flex items-center gap-2"
                          disabled={billingDisabled}
                          title={billingDisabled ? billingReason : undefined}
                        >
                          <Briefcase className="h-4 w-4" />
                          Create Job
                        </Button>
                      </BillingGuard>
                      <BillingGuard>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigate(`/admin/quotes/new?customer_id=${detailCustomerId}`);
                          }}
                          className="flex items-center gap-2"
                          disabled={billingDisabled}
                          title={billingDisabled ? billingReason : undefined}
                        >
                          <FileText className="h-4 w-4" />
                          Create Quote
                        </Button>
                      </BillingGuard>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Export</h3>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() => handleDownloadPDF(detailCustomerId)}
                      className="flex items-center gap-2 text-slate-700"
                    >
                      <Download className="h-4 w-4" />
                      Export Customer PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Create Job Form (shown in Jobs tab when creatingJobFor matches) */}
            {activeTab === 'jobs' && creatingJobFor === detailCustomerId && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-blue-900">Create Job for: {customer.full_name}</h3>
                  {customer.tags && customer.tags.length > 0 && (
                    <div>
                      <span className="font-semibold text-sm text-blue-900 mr-2">Tags:</span>
                      {customer.tags.map((tag, i) => (
                        <span key={i} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mr-2 mb-1">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {customer.notes && (
                    <div>
                      <span className="font-semibold text-sm text-blue-900">Notes:</span>
                      <p className="text-sm bg-blue-100 p-2 rounded mt-1 text-blue-900">{customer.notes}</p>
                    </div>
                  )}
                  <input
                    placeholder="Services Performed"
                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                    value={newJob.services_performed}
                    onChange={e => setNewJob({ ...newJob, services_performed: e.target.value })}
                    disabled={billingDisabled}
                    readOnly={billingDisabled}
                  />
                  <input
                    placeholder="Job Cost"
                    type="number"
                    step="0.01"
                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                    value={newJob.job_cost}
                    onChange={e => setNewJob({ ...newJob, job_cost: e.target.value })}
                    disabled={billingDisabled}
                    readOnly={billingDisabled}
                  />
                  <input
                    type="date"
                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                    value={newJob.service_date}
                    onChange={e => setNewJob({ ...newJob, service_date: e.target.value })}
                    disabled={billingDisabled}
                    readOnly={billingDisabled}
                  />
                  <label className="block text-sm font-medium text-blue-900 mb-1">
                    Assign Team
                  </label>
                  <select
                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                    value={newJob.assigned_team_id}
                    onChange={e => setNewJob({ ...newJob, assigned_team_id: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <BillingGuard>
                      <Button onClick={() => handleCreateJob(detailCustomerId)} variant="primary" className="flex-1" disabled={supportMode || billingDisabled} title={billingDisabled ? billingReason : undefined}>
                        Save Job
                      </Button>
                    </BillingGuard>
                    <Button onClick={() => setCreatingJobFor(null)} variant="secondary">Cancel</Button>
                  </div>
                </div>
              </div>
            )}
      </Drawer>
        );
      })()}

      {/* File Preview Modal */}
      {previewModal.open && previewModal.url && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setPreviewModal({ open: false, file: null, url: null })}>
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{previewModal.file?.file_name}</h3>
              <Button
                variant="tertiary"
                onClick={() => setPreviewModal({ open: false, file: null, url: null })}
                className="p-1"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="max-h-[80vh] overflow-auto">
              <img
                src={previewModal.url}
                alt={previewModal.file?.file_name}
                className="max-w-full h-auto rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {showPasswordModal && selectedCustomer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => !isSavingPassword && setShowPasswordModal(false)}>
          <div className="relative max-w-md w-full mx-4 bg-white rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {passwordModalMode === 'create' ? 'Create Customer Login' : 'Set Password'} for {selectedCustomer.full_name}
              </h3>
              <Button
                variant="tertiary"
                onClick={() => !isSavingPassword && setShowPasswordModal(false)}
                className="p-1"
                disabled={isSavingPassword}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4">
              {modalSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {modalSuccess}
                </div>
              )}

              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {modalError}
                </div>
              )}

              <div>
                <label htmlFor="tempPassword" className="block text-sm font-medium text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  id="tempPassword"
                  type="text"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Enter or generate password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSavingPassword || billingDisabled}
                  readOnly={billingDisabled}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Minimum 8 characters. Customer can log in at /customer/login with this password.
                </p>
              </div>

              <div className="flex gap-2">
                <BillingGuard>
                  <Button
                    variant="secondary"
                    onClick={() => setTempPassword(generatePassword())}
                    disabled={isSavingPassword || billingDisabled}
                    className="flex-1"
                    title={billingDisabled ? billingReason : undefined}
                  >
                    Generate Password
                  </Button>
                </BillingGuard>
                <BillingGuard>
                  <Button
                    variant="primary"
                    onClick={handleSavePassword}
                    disabled={!tempPassword.trim() || isSavingPassword || billingDisabled}
                    className="flex-1"
                    title={billingDisabled ? billingReason : undefined}
                  >
                    {isSavingPassword 
                      ? (passwordModalMode === 'create' ? 'Creating...' : 'Saving...')
                      : (passwordModalMode === 'create' ? 'Create Customer Login' : 'Save Password')
                    }
                  </Button>
                </BillingGuard>
              </div>

              <Button
                variant="tertiary"
                onClick={() => setShowPasswordModal(false)}
                disabled={isSavingPassword}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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
  );
}