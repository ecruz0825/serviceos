// src/pages/platform/PlatformDashboard.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";

export default function PlatformDashboard() {
  const [summary, setSummary] = useState(null);
  const [recentCompanies, setRecentCompanies] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metricsError, setMetricsError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch summary statistics
        const { data: summaryData, error: summaryError } = await supabase.rpc(
          "get_platform_companies_summary"
        );

        if (summaryError) {
          throw summaryError;
        }

        // Fetch recent companies
        const { data: companiesData, error: companiesError } = await supabase.rpc(
          "get_platform_recent_companies",
          { p_limit: 20 }
        );

        if (companiesError) {
          throw companiesError;
        }

        // Fetch platform metrics (non-blocking - show error if fails but continue)
        const { data: metricsData, error: metricsError } = await supabase.rpc(
          "get_platform_metrics"
        );

        if (metricsError) {
          console.error("Error fetching platform metrics:", metricsError);
          setMetricsError(metricsError.message || "Failed to load platform metrics");
        } else {
          setMetrics(metricsData?.[0] || null);
          setMetricsError(null);
        }

        setSummary(summaryData?.[0] || null);
        setRecentCompanies(companiesData || []);
      } catch (err) {
        console.error("Error fetching platform dashboard data:", err);
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const formatStatus = (status) => {
    if (!status) return "—";
    // Capitalize first letter and replace underscores
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatPlan = (plan) => {
    if (!plan) return "—";
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return "—";
    try {
      const num = typeof amount === "string" ? parseFloat(amount) : amount;
      if (isNaN(num)) return "—";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Dashboard"
        subtitle="Monitor companies, subscriptions, and platform billing health."
      />

      {error && (
        <Card>
          <div className="p-6">
            <p className="text-red-600">Error: {error}</p>
          </div>
        </Card>
      )}

      {loading ? (
        <Card>
          <div className="p-6">
            <p className="text-slate-600">Loading dashboard data...</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Platform Usage / Revenue Metrics */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Platform Usage & Revenue
            </h2>
            {metricsError ? (
              <Card>
                <div className="p-4">
                  <p className="text-sm text-amber-600">
                    Unable to load platform metrics: {metricsError}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Total Jobs</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {metrics?.total_jobs ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Total Customers</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {metrics?.total_customers ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Total Users</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {metrics?.total_users ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Total Payments</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {metrics?.total_payments ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Revenue Processed</p>
                    <p className="text-2xl font-semibold text-green-600">
                      {formatCurrency(metrics?.revenue_processed)}
                    </p>
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Subscription / Company Health Metrics */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Subscription & Company Health
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-1">Total Companies</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {summary?.total_companies ?? "—"}
                </p>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-1">Active Subscriptions</p>
                <p className="text-2xl font-semibold text-green-600">
                  {summary?.active_subscriptions ?? "—"}
                </p>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-1">MRR</p>
                <p className="text-2xl font-semibold text-green-600">
                  {formatCurrency(metrics?.mrr)}
                </p>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-1">Trialing</p>
                <p className="text-2xl font-semibold text-blue-600">
                  {summary?.trialing_subscriptions ?? "—"}
                </p>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-1">Past Due / Unpaid</p>
                <p className="text-2xl font-semibold text-amber-600">
                  {summary?.past_due_unpaid ?? "—"}
                </p>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <p className="text-sm text-slate-600 mb-1">Inactive / Canceled</p>
                <p className="text-2xl font-semibold text-slate-500">
                  {summary?.inactive_canceled ?? "—"}
                </p>
              </div>
            </Card>
          </div>
          </div>

          {/* Billing Risk & Growth Metrics */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Billing Risk & Growth
            </h2>
            {metricsError ? (
              <Card>
                <div className="p-4">
                  <p className="text-sm text-amber-600">
                    Unable to load billing risk & growth metrics: {metricsError}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">In Grace Period</p>
                    <p className="text-2xl font-semibold text-amber-600">
                      {metrics?.in_grace_period ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">New Companies (30d)</p>
                    <p className="text-2xl font-semibold text-green-600">
                      {metrics?.new_companies_30d ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Canceled / Inactive (30d)</p>
                    <p className="text-2xl font-semibold text-red-600">
                      {metrics?.canceled_inactive_30d ?? "—"}
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="p-4">
                    <p className="text-sm text-slate-600 mb-1">Webhook Errors</p>
                    <p className="text-2xl font-semibold text-red-600">
                      {metrics?.webhook_errors ?? "—"}
                    </p>
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Recent Companies Table */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Recent Companies
              </h2>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Company</th>
                      <th className="p-2 text-left">Plan</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Trial Ends</th>
                      <th className="p-2 text-left">Billing Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCompanies.length === 0 ? (
                      <tr>
                        <td className="p-4 text-gray-500" colSpan="5">
                          No companies found.
                        </td>
                      </tr>
                    ) : (
                      recentCompanies.map((company) => (
                        <tr key={company.id} className="border-t">
                          <td className="p-2 font-medium text-slate-900">
                            {company.name || "—"}
                          </td>
                          <td className="p-2 text-slate-600">
                            {formatPlan(company.plan)}
                          </td>
                          <td className="p-2 text-slate-600">
                            {formatStatus(company.subscription_status)}
                          </td>
                          <td className="p-2 text-slate-600">
                            {formatDate(company.trial_ends_at)}
                          </td>
                          <td className="p-2 text-slate-600">
                            {formatDateTime(company.billing_updated_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
