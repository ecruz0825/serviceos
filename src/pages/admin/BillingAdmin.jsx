import { useMemo, useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { useUser } from "../../context/UserContext";
import { supabase } from "../../supabaseClient";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { logProductEvent } from "../../lib/productEvents";

const STATUS_LABELS = {
  inactive: "Inactive",
  trialing: "Trialing",
  active: "Active",
  past_due: "Past Due",
  canceled: "Canceled",
  unpaid: "Unpaid",
};

export default function BillingAdmin() {
  const { profile, effectiveCompanyId, supportMode, role, refreshUserContext } = useUser();
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [actionError, setActionError] = useState("");
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [companyDetails, setCompanyDetails] = useState(null);

  const status = profile?.subscription_status || "inactive";
  const plan = profile?.plan || "starter";
  const trialEndsAt = profile?.trial_ends_at || null;
  const billingGraceUntil = profile?.billing_grace_until || null;
  const billingUpdatedAt = profile?.billing_updated_at || null;
  const canOpenPortalByStatus = ["active", "trialing", "past_due", "unpaid", "canceled"].includes(status);

  // Plan selection state: default to current plan if valid, otherwise "starter"
  const [selectedPlan, setSelectedPlan] = useState(() => {
    const currentPlan = plan?.toLowerCase();
    return currentPlan === "starter" || currentPlan === "pro" ? currentPlan : "starter";
  });

  const statusTone = useMemo(() => {
    if (status === "active" || status === "trialing") return "text-green-700 bg-green-100";
    if (status === "past_due" || status === "unpaid") return "text-amber-700 bg-amber-100";
    if (status === "canceled") return "text-red-700 bg-red-100";
    return "text-slate-700 bg-slate-100";
  }, [status]);

  // Extract fetch functions for reuse (memoized to avoid dependency issues)
  const fetchUsage = useCallback(async () => {
    if (!effectiveCompanyId) return;
    setUsageLoading(true);
    const { data, error } = await supabase.rpc('get_company_plan_usage', {
      p_company_id: effectiveCompanyId
    });

    if (error) {
      console.error('Error fetching plan usage:', error);
      setUsage(null);
    } else {
      setUsage(data?.[0] || null);
    }
    setUsageLoading(false);
  }, [effectiveCompanyId]);

  const fetchCompanyDetails = useCallback(async () => {
    if (!effectiveCompanyId) return;
    const { data, error } = await supabase
      .from('companies')
      .select('stripe_customer_id, stripe_subscription_id, billing_updated_at')
      .eq('id', effectiveCompanyId)
      .maybeSingle();
    
    if (!error && data) {
      setCompanyDetails(data);
    }
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!effectiveCompanyId) return;
    fetchUsage();
    fetchCompanyDetails();
  }, [effectiveCompanyId, fetchUsage, fetchCompanyDetails]);

  const formatDateTime = (value) => {
    if (!value) return "—";
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
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

  const getInvokeErrorMessage = (data, error, fallback) => {
    if (error?.message) return error.message;
    if (data?.message) return data.message;
    return fallback;
  };

  const startCheckout = async () => {
    if (supportMode) {
      toast.error("Billing actions are disabled in support mode.");
      return;
    }
    setActionError("");
    setStartingCheckout(true);
    
    // Log product event: checkout_started
    logProductEvent('checkout_started', {
      plan: selectedPlan
    });
    
    try {
      const { data, error } = await supabase.functions.invoke("create-billing-checkout-session", {
        body: { plan: selectedPlan },
      });

      if (error || !data?.ok || !data?.url) {
        const message = getInvokeErrorMessage(
          data,
          error,
          "Unable to start checkout. Please try again.",
        );
        setActionError(message);
        toast.error(message);
        return;
      }

      window.location.assign(data.url);
    } catch (err) {
      const message = err?.message || "Unable to start checkout. Please try again.";
      setActionError(message);
      toast.error(message);
    } finally {
      setStartingCheckout(false);
    }
  };

  const openPortal = async () => {
    if (supportMode) {
      toast.error("Billing actions are disabled in support mode.");
      return;
    }
    setActionError("");
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
        body: {},
      });

      if (error || !data?.ok || !data?.url) {
        const message =
          data?.code === "STRIPE_CUSTOMER_MISSING"
            ? "Billing portal is not available yet. Start checkout first to create your billing account."
            : getInvokeErrorMessage(
                data,
                error,
                "Unable to open billing portal. Please try again.",
              );
        setActionError(message);
        toast.error(message);
        return;
      }

      window.location.assign(data.url);
    } catch (err) {
      const message = err?.message || "Unable to open billing portal. Please try again.";
      setActionError(message);
      toast.error(message);
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleReconcile = async () => {
    if (!effectiveCompanyId) return;
    
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-billing', {
        body: { company_id: effectiveCompanyId },
      });

      if (error || !data?.ok) {
        const message = data?.message || error?.message || 'Reconciliation failed';
        toast.error(message);
        return;
      }

      if (data?.changed_fields && Array.isArray(data.changed_fields) && data.changed_fields.length > 0) {
        toast.success(`Reconciliation complete. ${data.changed_fields.length} field(s) updated.`);
      } else {
        const warningMsg = data?.warnings && data.warnings.length > 0
          ? `Reconciliation complete. ${data.warnings.length} warning(s).`
          : 'Reconciliation complete. No changes needed.';
        toast.success(warningMsg);
      }

      // Refresh all billing-related data to reflect updated state
      // 1. Refresh UserContext profile (contains plan, subscription_status, trial_ends_at, billing_grace_until, billing_updated_at)
      await refreshUserContext();
      
      // 2. Refresh usage data (plan changes affect limits)
      await fetchUsage();
      
      // 3. Refresh company details (diagnostic fields)
      await fetchCompanyDetails();
    } catch (err) {
      toast.error(err?.message || 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  // Check if user can reconcile (admin of own company OR platform_admin in support mode)
  const canReconcile = role === 'admin' || (role === 'platform_admin' && supportMode);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        subtitle="Current subscription state for your company workspace."
      />

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-600 mb-1">Current Plan</p>
            <p className="text-xl font-semibold text-slate-900 capitalize">{plan}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Subscription Status</p>
            <span className={`inline-block px-2 py-1 text-sm font-medium rounded ${statusTone}`}>
              {STATUS_LABELS[status] || status}
            </span>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Trial Ends</p>
            <p className="text-slate-900">{formatDateTime(trialEndsAt)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Billing Grace Until</p>
            <p className="text-slate-900">{formatDateTime(billingGraceUntil)}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-slate-600 mb-1">Last Billing Sync</p>
            <p className="text-slate-900">{formatDateTime(billingUpdatedAt)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Usage & Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-slate-600 mb-1">Crew Members</p>
            <p className="text-slate-900">
              {usageLoading ? "Loading..." : usage?.current_crew ?? "—"} / {usage?.max_crew ?? "Unlimited"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Customers</p>
            <p className="text-slate-900">
              {usageLoading ? "Loading..." : usage?.current_customers ?? "—"} / {usage?.max_customers ?? "Unlimited"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Jobs This Month</p>
            <p className="text-slate-900">
              {usageLoading ? "Loading..." : usage?.current_jobs_this_month ?? "—"} / {usage?.max_jobs_per_month ?? "Unlimited"}
            </p>
          </div>
        </div>
      </Card>

      {canReconcile && (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Billing Diagnostics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-slate-600 mb-1">Stripe Customer ID</p>
              <p className="text-slate-900 font-mono text-xs">
                {companyDetails?.stripe_customer_id || "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Stripe Subscription ID</p>
              <p className="text-slate-900 font-mono text-xs">
                {companyDetails?.stripe_subscription_id || "—"}
              </p>
            </div>
          </div>
          <Button
            variant="tertiary"
            onClick={handleReconcile}
            disabled={reconciling || !canReconcile}
          >
            {reconciling ? "Reconciling..." : "Reconcile Billing"}
          </Button>
          {supportMode && (
            <p className="text-xs text-amber-600 mt-2">
              Support Mode: Read-only access. Reconciliation is allowed for diagnostic purposes.
            </p>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Stripe Actions</h2>
        <p className="text-sm text-slate-600 mb-4">
          Manage your subscription and billing details.
        </p>
        {actionError ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}
        <div className="mb-4">
          <p className="text-sm text-slate-600 mb-2">Choose Plan</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedPlan("starter")}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                selectedPlan === "starter"
                  ? "bg-slate-200 text-slate-900 border border-slate-400"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
              }`}
            >
              Starter
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlan("pro")}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                selectedPlan === "pro"
                  ? "bg-slate-200 text-slate-900 border border-slate-400"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
              }`}
            >
              Pro
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={startCheckout}
            disabled={supportMode || startingCheckout || openingPortal}
          >
            {startingCheckout ? "Starting Checkout..." : "Start Checkout"}
          </Button>
          <Button
            variant="tertiary"
            onClick={openPortal}
            disabled={supportMode || startingCheckout || openingPortal || !canOpenPortalByStatus}
          >
            {openingPortal ? "Opening Portal..." : "Open Billing Portal"}
          </Button>
        </div>
        {supportMode ? (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
            <p className="text-sm font-medium text-amber-900 mb-1">
              Support Mode — Read Only
            </p>
            <p className="text-xs text-amber-800">
              You are viewing billing information in support mode. Checkout and billing portal actions are disabled. 
              Reconciliation is available for diagnostic purposes only.
            </p>
          </div>
        ) : null}
        {!canOpenPortalByStatus ? (
          <p className="text-xs text-slate-500 mt-3">
            Billing portal becomes available after subscription setup.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
