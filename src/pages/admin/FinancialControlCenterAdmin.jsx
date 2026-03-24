import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Button from "../../components/ui/Button";
import { DollarSign, AlertCircle, TrendingUp, FileText, CreditCard, AlertTriangle, ExternalLink, Users } from "lucide-react";
import { computePaidTotalForJob } from "../../utils/revenuePipeline";

// Date helper: Get today's date in YYYY-MM-DD format (timezone-safe using local date components)
const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Date helper: Get first day of current month
const getFirstDayOfMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

// Helper: Check if a job is completed (case-insensitive, handles various status formats)
const isJobCompleted = (job) => {
  if (!job) return false;
  
  // If completed_at exists, job is completed regardless of status
  if (job.completed_at) return true;
  
  // Normalize status: safe string conversion, trim, lowercase
  const status = String(job.status || '').trim().toLowerCase();
  
  // Check against known completion statuses
  const completedStatuses = ['completed', 'done', 'complete'];
  return completedStatuses.includes(status);
};

export default function FinancialControlCenterAdmin() {
  const { effectiveCompanyId } = useUser();
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Data state
  const [jobs, setJobs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  // Initialize company ID from UserContext (supports support mode)
  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId);
    }
  }, [effectiveCompanyId]);

  // Fetch all data
  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      setLoading(true);

      try {
        // 1. Fetch all jobs with customer relationship
        const { data: jobsData, error: jobsError } = await supabase
          .from("jobs")
          .select("id, job_cost, status, service_date, completed_at, customer_id, customer:customers(id, full_name)")
          .eq("company_id", companyId);

        if (jobsError) {
          console.error("Error fetching jobs:", jobsError);
        }

        // 2. Fetch all payments (posted status only)
        const { data: paymentsData, error: paymentsError } = await supabase
          .from("payments")
          .select("id, job_id, amount, status, date_paid, paid_at")
          .eq("company_id", companyId)
          .eq("status", "posted");

        if (paymentsError) {
          console.error("Error fetching payments:", paymentsError);
        }

        // 3. Fetch customers (for display)
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name")
          .eq("company_id", companyId);

        if (customersError) {
          console.error("Error fetching customers:", customersError);
        }

        // Set state
        setJobs(jobsData || []);
        setPayments(paymentsData || []);
        setCustomers(customersData || []);
      } catch (err) {
        console.error("Unexpected error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  // Calculate payment totals per job
  const paymentsByJob = useMemo(() => {
    const map = {};
    jobs.forEach(job => {
      const paidTotal = computePaidTotalForJob(payments, job.id);
      map[job.id] = paidTotal;
    });
    return map;
  }, [jobs, payments]);

  // Calculate revenue collected this month
  const revenueThisMonth = useMemo(() => {
    const firstDayOfMonth = getFirstDayOfMonth();
    return payments
      .filter(p => {
        const paymentDate = p.date_paid || p.paid_at;
        if (!paymentDate) return false;
        const dateStr = typeof paymentDate === 'string' 
          ? paymentDate.split('T')[0] 
          : paymentDate;
        return dateStr >= firstDayOfMonth;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments]);

  // Insight 1: Unpaid Jobs (collected = 0 and job_cost > 0)
  const unpaidJobs = useMemo(() => {
    return jobs.filter(job => {
      const jobCost = Number(job.job_cost || 0);
      const paidTotal = paymentsByJob[job.id] || 0;
      return jobCost > 0 && paidTotal === 0;
    });
  }, [jobs, paymentsByJob]);

  // Insight 2: Partially Paid Jobs (0 < collected < job_cost)
  const partiallyPaidJobs = useMemo(() => {
    return jobs.filter(job => {
      const jobCost = Number(job.job_cost || 0);
      const paidTotal = paymentsByJob[job.id] || 0;
      return jobCost > 0 && paidTotal > 0 && paidTotal < jobCost;
    });
  }, [jobs, paymentsByJob]);

  // Insight 3: Completed But Unpaid
  const completedButUnpaid = useMemo(() => {
    return jobs.filter(job => {
      if (!isJobCompleted(job)) return false;
      
      const jobCost = Number(job.job_cost || 0);
      const paidTotal = paymentsByJob[job.id] || 0;
      return jobCost > 0 && paidTotal < jobCost;
    });
  }, [jobs, paymentsByJob]);

  // Insight 4: Payment Risk / Attention
  const paymentRiskItems = useMemo(() => {
    const risks = [];
    
    // High-balance unpaid jobs (> $500)
    const highBalanceUnpaid = jobs.filter(job => {
      const jobCost = Number(job.job_cost || 0);
      const paidTotal = paymentsByJob[job.id] || 0;
      const balance = jobCost - paidTotal;
      return jobCost > 0 && paidTotal === 0 && balance > 500;
    });
    
    if (highBalanceUnpaid.length > 0) {
      risks.push({
        type: 'high_balance_unpaid',
        message: `${highBalanceUnpaid.length} ${highBalanceUnpaid.length === 1 ? 'job' : 'jobs'} with balance over $500 have no payments.`,
        jobs: highBalanceUnpaid
      });
    }
    
    // Completed jobs with no payment
    const completedNoPayment = jobs.filter(job => {
      if (!isJobCompleted(job)) return false;
      
      const jobCost = Number(job.job_cost || 0);
      const paidTotal = paymentsByJob[job.id] || 0;
      return jobCost > 0 && paidTotal === 0;
    });
    
    if (completedNoPayment.length > 0) {
      risks.push({
        type: 'completed_no_payment',
        message: `${completedNoPayment.length} completed ${completedNoPayment.length === 1 ? 'job' : 'jobs'} have no payments recorded.`,
        jobs: completedNoPayment
      });
    }
    
    // Customers with multiple unpaid jobs (3+)
    const customerUnpaidCounts = {};
    unpaidJobs.forEach(job => {
      if (job.customer_id) {
        customerUnpaidCounts[job.customer_id] = (customerUnpaidCounts[job.customer_id] || 0) + 1;
      }
    });
    
    const customersWithMultipleUnpaid = Object.entries(customerUnpaidCounts)
      .filter(([_, count]) => count >= 3)
      .map(([customerId, count]) => {
        const customer = customers.find(c => c.id === customerId);
        const customerJobs = unpaidJobs.filter(j => j.customer_id === customerId);
        return {
          customerId,
          customerName: customer?.full_name || 'Unknown Customer',
          unpaidCount: count,
          jobs: customerJobs
        };
      });
    
    if (customersWithMultipleUnpaid.length > 0) {
      risks.push({
        type: 'multiple_unpaid_per_customer',
        message: `${customersWithMultipleUnpaid.length} ${customersWithMultipleUnpaid.length === 1 ? 'customer' : 'customers'} have 3 or more unpaid jobs.`,
        customers: customersWithMultipleUnpaid
      });
    }
    
    return risks;
  }, [jobs, paymentsByJob, unpaidJobs, customers]);

  // Calculate KPI summary
  const kpiSummary = useMemo(() => {
    return {
      revenueThisMonth,
      unpaidJobsCount: unpaidJobs.length,
      partiallyPaidCount: partiallyPaidJobs.length,
      completedButUnpaidCount: completedButUnpaid.length
    };
  }, [revenueThisMonth, unpaidJobs, partiallyPaidJobs, completedButUnpaid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  const hasAnyInsights = 
    unpaidJobs.length > 0 ||
    partiallyPaidJobs.length > 0 ||
    completedButUnpaid.length > 0 ||
    paymentRiskItems.length > 0;

  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50/60 to-white p-5 md:p-6">
        <PageHeader
          title="Financial Control Center"
          subtitle="Prioritize financial risk and payment attention items. Use Payments to record payments and Revenue Hub for broader reporting."
        />
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-green-100 bg-green-50/40">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Revenue This Month</div>
            </div>
            <div className="text-3xl font-semibold leading-tight text-slate-900">
              ${kpiSummary.revenueThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-xs text-slate-400">Cash received this month</div>
          </div>
        </Card>
        <Card className="border border-amber-200 bg-amber-50/40">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unpaid Jobs</div>
            </div>
            <div className="text-3xl font-semibold leading-tight text-amber-900">{kpiSummary.unpaidJobsCount}</div>
            <div className="mt-1 text-xs text-slate-400">No payments recorded</div>
          </div>
        </Card>
        <Card className="border border-amber-200 bg-amber-50/40">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-5 w-5 text-amber-600" />
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Partially Paid</div>
            </div>
            <div className="text-3xl font-semibold leading-tight text-amber-900">{kpiSummary.partiallyPaidCount}</div>
            <div className="mt-1 text-xs text-slate-400">Balances still outstanding</div>
          </div>
        </Card>
        <Card className="border border-amber-200 bg-amber-50/40">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-amber-600" />
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Completed But Unpaid</div>
            </div>
            <div className="text-3xl font-semibold leading-tight text-amber-900">{kpiSummary.completedButUnpaidCount}</div>
            <div className="mt-1 text-xs text-slate-400">Completed work awaiting payment</div>
          </div>
        </Card>
      </div>

      {!hasAnyInsights ? (
        <Card className="border border-green-200 bg-green-50/40">
          <div className="p-6">
            <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3 text-center">
              No payment issues detected. All jobs are paid or have no balance.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Insight 1: Unpaid Jobs */}
          {unpaidJobs.length > 0 && (
            <Card className="border border-red-200 bg-red-50/30">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Unpaid Jobs
                </h2>
                <div className="mb-4 text-sm text-slate-600">
                  {unpaidJobs.length} {unpaidJobs.length === 1 ? 'job' : 'jobs'} with no payments recorded.
                </div>
                <div className="rounded-lg border border-slate-200 bg-white divide-y">
                  {unpaidJobs.slice(0, 10).map(job => (
                    <div key={job.id} className="border-l-4 border-red-500 bg-white px-4 py-3 hover:bg-slate-50">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">
                            {job.customer?.full_name || 'Unknown Customer'}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {job.service_date || 'No date'} • ${Number(job.job_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <Link to={`/admin/payments?jobId=${job.id}`}>
                            <Button className="text-sm">
                              <CreditCard className="h-4 w-4 mr-1" />
                              Record Payment
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                  {unpaidJobs.length > 10 && (
                    <div className="text-sm text-slate-500 text-center pt-2">
                      ... and {unpaidJobs.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 2: Partially Paid Jobs */}
          {partiallyPaidJobs.length > 0 && (
            <Card className="border border-amber-200 bg-amber-50/30">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                  Partially Paid Jobs
                </h2>
                <div className="mb-4 text-sm text-slate-600">
                  {partiallyPaidJobs.length} {partiallyPaidJobs.length === 1 ? 'job' : 'jobs'} with partial payments.
                </div>
                <div className="rounded-lg border border-slate-200 bg-white divide-y">
                  {partiallyPaidJobs.slice(0, 10).map(job => {
                    const jobCost = Number(job.job_cost || 0);
                    const paidTotal = paymentsByJob[job.id] || 0;
                    const balance = jobCost - paidTotal;
                    return (
                      <div key={job.id} className="border-l-4 border-amber-500 bg-white px-4 py-3 hover:bg-slate-50">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">
                              {job.customer?.full_name || 'Unknown Customer'}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {job.service_date || 'No date'} • Paid: ${paidTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${jobCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • Balance: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <Link to={`/admin/payments?jobId=${job.id}`}>
                              <Button className="text-sm">
                                <CreditCard className="h-4 w-4 mr-1" />
                                Record Payment
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {partiallyPaidJobs.length > 10 && (
                    <div className="text-sm text-slate-500 text-center pt-2">
                      ... and {partiallyPaidJobs.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 3: Completed But Unpaid */}
          {completedButUnpaid.length > 0 && (
            <Card className="border border-amber-200 bg-amber-50/30">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-600" />
                  Completed But Unpaid
                </h2>
                <div className="mb-4 text-sm text-slate-600">
                  {completedButUnpaid.length} completed {completedButUnpaid.length === 1 ? 'job' : 'jobs'} with remaining balance.
                </div>
                <div className="rounded-lg border border-slate-200 bg-white divide-y">
                  {completedButUnpaid.slice(0, 10).map(job => {
                    const jobCost = Number(job.job_cost || 0);
                    const paidTotal = paymentsByJob[job.id] || 0;
                    const balance = jobCost - paidTotal;
                    return (
                      <div key={job.id} className="border-l-4 border-amber-500 bg-white px-4 py-3 hover:bg-slate-50">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">
                              {job.customer?.full_name || 'Unknown Customer'}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {job.service_date || 'No date'} • Balance: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <Link to={`/admin/payments?jobId=${job.id}`}>
                              <Button className="text-sm">
                                <CreditCard className="h-4 w-4 mr-1" />
                                Record Payment
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {completedButUnpaid.length > 10 && (
                    <div className="text-sm text-slate-500 text-center pt-2">
                      ... and {completedButUnpaid.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Insight 4: Payment Risk / Attention */}
          {paymentRiskItems.length > 0 && (
            <Card className="border border-red-200 bg-red-50/30">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Payment Risk / Attention
                </h2>
                <div className="mb-4 text-sm text-slate-600">
                  Escalation-oriented risk signals requiring review and follow-up.
                </div>
                <div className="space-y-3">
                  {paymentRiskItems.map((risk, index) => (
                    <div key={index} className="rounded-lg border border-red-200 bg-white p-4">
                      <div className="font-medium text-slate-900 mb-2">{risk.message}</div>
                      {risk.jobs && risk.jobs.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {risk.jobs.slice(0, 5).map(job => (
                            <div key={job.id} className="text-sm text-slate-600">
                              • {job.customer?.full_name || 'Unknown Customer'} - ${Number(job.job_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          ))}
                          {risk.jobs.length > 5 && (
                            <div className="text-xs text-slate-500">
                              ... and {risk.jobs.length - 5} more
                            </div>
                          )}
                        </div>
                      )}
                      {risk.customers && risk.customers.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {risk.customers.slice(0, 5).map(customer => (
                            <div key={customer.customerId} className="text-sm text-slate-600">
                              • {customer.customerName} - {customer.unpaidCount} unpaid {customer.unpaidCount === 1 ? 'job' : 'jobs'}
                            </div>
                          ))}
                          {risk.customers.length > 5 && (
                            <div className="text-xs text-slate-500">
                              ... and {risk.customers.length - 5} more
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {risk.type === 'completed_no_payment' && (
                          <Link to="/admin/revenue-hub">
                            <Button className="text-sm">
                              <TrendingUp className="h-4 w-4 mr-1" />
                              Open Revenue Hub
                            </Button>
                          </Link>
                        )}
                        {risk.type === 'high_balance_unpaid' && (
                          <Link to="/admin/revenue-hub">
                            <Button className="text-sm">
                              <TrendingUp className="h-4 w-4 mr-1" />
                              Open Revenue Hub
                            </Button>
                          </Link>
                        )}
                        {risk.type === 'multiple_unpaid_per_customer' && (
                          <>
                            <Link to="/admin/customers">
                              <Button className="text-sm">
                                <Users className="h-4 w-4 mr-1" />
                                Open Customers
                              </Button>
                            </Link>
                            <Link to="/admin/revenue-hub">
                              <Button className="text-sm">
                                <TrendingUp className="h-4 w-4 mr-1" />
                                Open Revenue Hub
                              </Button>
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
