import React from "react";
import { useUser } from "../context/UserContext";
import { useLocation, Navigate, Link } from "react-router-dom";
import FullPageLoader from "./FullPageLoader";

const BILLING_STATUS_LABELS = {
  inactive: "Inactive",
  trialing: "Trialing",
  active: "Active",
  past_due: "Past Due",
  canceled: "Canceled",
  unpaid: "Unpaid",
};

export default function OnboardingGuard({ children }) {
  // All hooks MUST run at the top with NO early returns before hooks
  const { profile, loading: userLoading } = useUser();
  const location = useLocation();

  // If loading → return <FullPageLoader />
  if (userLoading) {
    return <FullPageLoader />;
  }

  // If no profile → return children
  if (!profile) {
    return children;
  }

  // Platform admin routes are excluded from tenant onboarding logic
  if (profile.role === "platform_admin") {
    return children;
  }

  // If not admin path → return children
  const isAdminRoute = location.pathname.startsWith("/admin");
  if (!isAdminRoute) {
    return children;
  }

  // Any internal user on admin routes without company context should see a clear state.
  // Admin gets bootstrap redirect below; non-admin internal roles get a safe blocking message.
  const isInternalRole = ["admin", "manager", "dispatcher"].includes(profile.role);
  if (isInternalRole && !profile.company_id && profile.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Account Setup Required</h1>
          <p className="text-sm text-slate-600">
            Your account is not linked to a company yet. Contact your company admin to finish setup before accessing admin tools.
          </p>
        </div>
      </div>
    );
  }

  // Source of truth: onboarding is complete if setup_completed_at is NOT null
  // Note: onboarding_step === 'finish' is legacy and should not be relied upon
  const companyOnboardingComplete = profile.setup_completed_at !== null;
  
  if (
    isInternalRole &&
    profile.role !== "admin" &&
    profile.company_id &&
    !companyOnboardingComplete
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Company Onboarding In Progress</h1>
          <p className="text-sm text-slate-600">
            Admin onboarding is not complete yet. Please ask your company admin to finish onboarding before using admin tools.
          </p>
        </div>
      </div>
    );
  }

  // Only apply onboarding/bootstrap redirects for admin-role users.
  // Non-admin users keep existing role-based protection in ProtectedRoute.
  const isAdminUser = profile.role === "admin";
  if (!isAdminUser) {
    return children;
  }

  // Admin profile without company must bootstrap first
  if (!profile.company_id) {
    return <Navigate to="/bootstrap/company" replace />;
  }

  // Company exists: onboarding is complete if setup_completed_at is set
  // This is the single source of truth for completion status
  if (companyOnboardingComplete) {
    // Onboarding complete: allow access to all admin routes
    return children;
  }

  // Company exists but onboarding incomplete: allow onboarding route, otherwise force it
  if (location.pathname === "/admin/onboarding") {
    return children;
  }

  // Force redirect to onboarding if incomplete
  return <Navigate to="/admin/onboarding" replace />;

  // Billing enforcement (admin-only):
  // allow app access when status is trialing/active OR grace window is still valid.
  const billingStatus = profile.subscription_status || "inactive";

  const trialEndsAtRaw = profile.trial_ends_at || null;
  const trialEndsAtDate = trialEndsAtRaw ? new Date(trialEndsAtRaw) : null;

  const isTrialValid =
    billingStatus === "trialing" &&
    trialEndsAtDate &&
    !Number.isNaN(trialEndsAtDate.getTime()) &&
    trialEndsAtDate.getTime() > Date.now();

  const graceUntilRaw = profile.billing_grace_until || null;
  const graceUntilDate = graceUntilRaw ? new Date(graceUntilRaw) : null;

  const hasValidGrace =
    graceUntilDate && !Number.isNaN(graceUntilDate.getTime())
      ? graceUntilDate.getTime() > Date.now()
      : false;

  const hasActiveBilling =
    isTrialValid || billingStatus === "active" || hasValidGrace;

  const billingAllowedRoutes = [
    "/admin/billing",
    "/admin/settings",
    "/admin/onboarding",
    "/bootstrap/company",
  ];
  const isBillingAllowedRoute = billingAllowedRoutes.some((route) =>
    location.pathname === route || location.pathname.startsWith(`${route}/`)
  );

  if (!hasActiveBilling && !isBillingAllowedRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-lg w-full bg-white rounded-lg shadow border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Billing Access Required</h1>
          <p className="text-sm text-slate-600 mb-3">
            Admin tools are temporarily limited because billing is not active for this workspace.
          </p>
          <p className="text-sm text-slate-700 mb-4">
            Current billing status:{" "}
            <span className="font-medium">
              {BILLING_STATUS_LABELS[billingStatus] || billingStatus}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/billing"
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
            >
              Open Billing
            </Link>
            <Link
              to="/admin/settings"
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
