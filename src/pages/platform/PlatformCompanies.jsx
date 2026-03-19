// src/pages/platform/PlatformCompanies.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";

export default function PlatformCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompanies = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase.rpc(
          "get_platform_companies",
          {
            p_limit: 50,
            p_offset: 0,
          }
        );

        if (fetchError) {
          throw fetchError;
        }

        setCompanies(data || []);
      } catch (err) {
        console.error("Error fetching companies:", err);
        setError(err.message || "Failed to load companies");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
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

  const handleViewCompany = (companyId) => {
    navigate(`/platform/company/${companyId}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        subtitle="Manage companies using the ServiceOps platform."
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
            <p className="text-slate-600">Loading companies...</p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-6">
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Company</th>
                    <th className="p-2 text-left">Plan</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Trial Ends</th>
                    <th className="p-2 text-left">Billing Updated</th>
                    <th className="p-2 text-left">Created</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan="7">
                        No companies found.
                      </td>
                    </tr>
                  ) : (
                    companies.map((company) => (
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
                        <td className="p-2 text-slate-600">
                          {formatDate(company.created_at)}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="primary"
                            onClick={() => handleViewCompany(company.id)}
                            className="px-3 py-1 text-sm"
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
