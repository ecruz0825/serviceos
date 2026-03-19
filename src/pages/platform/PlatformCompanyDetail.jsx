// src/pages/platform/PlatformCompanyDetail.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";

export default function PlatformCompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshUserContext } = useUser();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(false);
  const [billingEvents, setBillingEvents] = useState([]);
  const [billingEventsLoading, setBillingEventsLoading] = useState(false);
  const [enteringSupportMode, setEnteringSupportMode] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Company ID is required");
      setLoading(false);
      return;
    }

    const fetchCompany = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase.rpc(
          "get_platform_company",
          {
            p_company_id: id,
          }
        );

        if (fetchError) {
          throw fetchError;
        }

        if (!data || data.length === 0) {
          setError("Company not found");
          setCompany(null);
        } else {
          setCompany(data[0]);
        }
      } catch (err) {
        console.error("Error fetching company:", err);
        setError(err.message || "Failed to load company details");
        setCompany(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [id]);

  // Fetch billing diagnostics when company is loaded
  useEffect(() => {
    if (!id || !company) return;

    const fetchBillingDiagnostics = async () => {
      // Fetch billing history
      setBillingHistoryLoading(true);
      try {
        const { data: historyData, error: historyError } = await supabase.rpc(
          "get_platform_company_billing_history",
          {
            p_company_id: id,
            p_limit: 25,
          }
        );

        if (historyError) {
          console.error("Error fetching billing history:", historyError);
          setBillingHistory([]);
        } else {
          setBillingHistory(historyData || []);
        }
      } catch (err) {
        console.error("Unexpected error fetching billing history:", err);
        setBillingHistory([]);
      } finally {
        setBillingHistoryLoading(false);
      }

      // Fetch billing events
      setBillingEventsLoading(true);
      try {
        const { data: eventsData, error: eventsError } = await supabase.rpc(
          "get_platform_company_billing_events",
          {
            p_company_id: id,
            p_limit: 25,
          }
        );

        if (eventsError) {
          console.error("Error fetching billing events:", eventsError);
          setBillingEvents([]);
        } else {
          setBillingEvents(eventsData || []);
        }
      } catch (err) {
        console.error("Unexpected error fetching billing events:", err);
        setBillingEvents([]);
      } finally {
        setBillingEventsLoading(false);
      }
    };

    fetchBillingDiagnostics();
  }, [id, company]);

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

  const formatId = (id) => {
    if (!id) return "—";
    return id;
  };

  const handleEnterSupportMode = async () => {
    if (!id) return;

    setEnteringSupportMode(true);
    try {
      const { error } = await supabase.rpc("start_support_session", {
        p_target_company_id: id,
        p_reason: "Platform support session",
      });

      if (error) {
        console.error("Error starting support session:", error);
        alert("Failed to enter support mode. Please try again.");
        setEnteringSupportMode(false);
        return;
      }

      // Refresh user context to load support mode state before navigation
      await refreshUserContext();

      // Navigate to admin dashboard
      navigate("/admin");
    } catch (err) {
      console.error("Unexpected error starting support session:", err);
      alert("Failed to enter support mode. Please try again.");
      setEnteringSupportMode(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Company" />
        <Card>
          <div className="p-6">
            <p className="text-slate-600">Loading company details...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Company" />
        <Card>
          <div className="p-6">
            <p className="text-red-600 mb-4">Error: {error || "Company not found"}</p>
            <Button variant="secondary" onClick={() => navigate("/platform/companies")}>
              Back to Companies
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Company" />
      
      {/* Card 1: Company Info */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Company Info</h2>
            <Button
              onClick={handleEnterSupportMode}
              disabled={enteringSupportMode}
              variant="primary"
            >
              {enteringSupportMode ? "Entering..." : "Enter Support Mode"}
            </Button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-600 mb-1">Company Name</p>
              <p className="text-base font-medium text-slate-900">
                {company.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Company ID</p>
              <p className="text-base font-mono text-slate-700">
                {formatId(company.id)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Created</p>
              <p className="text-base text-slate-700">
                {formatDate(company.created_at)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Card 2: Billing */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Billing</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-600 mb-1">Plan</p>
              <p className="text-base text-slate-700">
                {formatPlan(company.plan)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Subscription Status</p>
              <p className="text-base text-slate-700">
                {formatStatus(company.subscription_status)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Trial Ends</p>
              <p className="text-base text-slate-700">
                {formatDate(company.trial_ends_at)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Billing Grace Until</p>
              <p className="text-base text-slate-700">
                {formatDate(company.billing_grace_until)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Billing Updated</p>
              <p className="text-base text-slate-700">
                {formatDateTime(company.billing_updated_at)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Card 3: Stripe */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Stripe</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-600 mb-1">Stripe Customer ID</p>
              <p className="text-base font-mono text-slate-700">
                {formatId(company.stripe_customer_id)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Stripe Subscription ID</p>
              <p className="text-base font-mono text-slate-700">
                {formatId(company.stripe_subscription_id)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Card 4: Billing Diagnostics */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Billing Diagnostics</h2>
          
          {/* Table 1: Billing History */}
          <div className="mb-6">
            <h3 className="text-base font-medium text-slate-800 mb-3">Billing History</h3>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Field</th>
                    <th className="p-2 text-left">Old Value</th>
                    <th className="p-2 text-left">New Value</th>
                    <th className="p-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistoryLoading ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan="5">
                        Loading billing history...
                      </td>
                    </tr>
                  ) : billingHistory.length === 0 ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan="5">
                        No billing history found.
                      </td>
                    </tr>
                  ) : (
                    billingHistory.map((history, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2 text-slate-600">
                          {formatDateTime(history.changed_at)}
                        </td>
                        <td className="p-2 text-slate-700 font-medium">
                          {history.field_name || "—"}
                        </td>
                        <td className="p-2 text-slate-600">
                          {history.old_value || "—"}
                        </td>
                        <td className="p-2 text-slate-600">
                          {history.new_value || "—"}
                        </td>
                        <td className="p-2 text-slate-600">
                          {history.source || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Stripe Events */}
          <div>
            <h3 className="text-base font-medium text-slate-800 mb-3">Stripe Events</h3>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Event</th>
                    <th className="p-2 text-left">State</th>
                    <th className="p-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {billingEventsLoading ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan="4">
                        Loading Stripe events...
                      </td>
                    </tr>
                  ) : billingEvents.length === 0 ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan="4">
                        No Stripe events found.
                      </td>
                    </tr>
                  ) : (
                    billingEvents.map((event, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2 text-slate-600">
                          {formatDateTime(event.created_at)}
                        </td>
                        <td className="p-2 text-slate-700 font-medium">
                          {event.event_type || "—"}
                        </td>
                        <td className="p-2 text-slate-600">
                          {formatStatus(event.processing_state)}
                        </td>
                        <td className="p-2 text-slate-600">
                          {event.processing_error || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      {/* Back Button */}
      <div>
        <Button variant="secondary" onClick={() => navigate("/platform/companies")}>
          Back to Companies
        </Button>
      </div>
    </div>
  );
}
