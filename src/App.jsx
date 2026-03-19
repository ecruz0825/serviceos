import CustomerAppShell from './layouts/customer/CustomerAppShell'
import DashboardPage from './pages/customer/DashboardPage'
import JobsListPage from './pages/customer/JobsListPage'
import JobDetailPage from './pages/customer/JobDetailPage'
import QuotesListPage from './pages/customer/QuotesListPage'
import QuoteDetailPage from './pages/customer/QuoteDetailPage'
import InvoicesListPage from './pages/customer/InvoicesListPage'
import InvoiceDetailPage from './pages/customer/InvoiceDetailPage'
import SchedulePage from './pages/customer/SchedulePage'
import ProfilePage from './pages/customer/ProfilePage'
import CustomerLogin from './pages/customer/CustomerLogin'
import CustomerAcceptInvite from './pages/customer/CustomerAcceptInvite'
import JobsAdmin from './pages/admin/JobsAdmin'
import JobsNeedsScheduling from './pages/admin/JobsNeedsScheduling'
import CustomersAdmin from './pages/admin/CustomersAdmin'
import CrewAdmin from './pages/admin/CrewAdmin'
import { Routes, Route, Navigate } from 'react-router-dom'
import CustomerDashboard from './CustomerDashboard'
import CrewPortal from './CrewPortal'
import CrewPortalMobile from './pages/crew/CrewPortalMobile'
import CrewDashboard from './pages/crew/CrewDashboard'
import CrewJobDetail from './pages/crew/CrewJobDetail'
import CrewHelp from './pages/crew/CrewHelp'
import AdminDashboard from './pages/admin/AdminDashboard'
import ProtectedRoute from './ProtectedRoute'
import Login from './Login'
import Settings from "./pages/admin/Settings";
import Navbar from './Navbar'
import PaymentsAdmin from "./pages/admin/PaymentsAdmin";
import ExpensesAdmin from "./pages/admin/ExpensesAdmin";
import RecurringJobsAdmin from './pages/admin/RecurringJobsAdmin';
import ScheduleAdmin from './pages/admin/ScheduleAdmin';
import ScheduleRequestsAdmin from './pages/admin/ScheduleRequestsAdmin';
import TeamsAdmin from './pages/admin/TeamsAdmin';
import QuotesAdmin from './pages/admin/QuotesAdmin';
import QuoteBuilder from './pages/admin/QuoteBuilder';
import RevenueHub from './pages/admin/RevenueHub';
import BillingAdmin from './pages/admin/BillingAdmin';
import RoutePlanningAdmin from './pages/admin/RoutePlanningAdmin';
import DispatchCenterAdmin from './pages/admin/DispatchCenterAdmin';
import SchedulingCenterAdmin from './pages/admin/SchedulingCenterAdmin';
import JobIntelligenceAdmin from './pages/admin/JobIntelligenceAdmin';
import FinancialControlCenterAdmin from './pages/admin/FinancialControlCenterAdmin';
import OperationsCenterAdmin from './pages/admin/OperationsCenterAdmin';
import FinanceHubAdmin from './pages/admin/FinanceHubAdmin';
import PublicQuote from './pages/public/PublicQuote';
import PublicQuoteReceipt from './pages/public/PublicQuoteReceipt';
import PublicJobScheduleRequest from './pages/public/PublicJobScheduleRequest';
import OnboardingWizard from './pages/admin/OnboardingWizard';
import AuthCallback from './pages/AuthCallback';
import CompanyBootstrap from './pages/auth/CompanyBootstrap';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import AppShell from './layouts/AppShell';
import CrewLayout from './layouts/CrewLayout';
import CrewLayoutV2 from './layouts/CrewLayoutV2';
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import OnboardingGuard from "./components/OnboardingGuard";
import RootRedirect from "./components/RootRedirect";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import PlatformCompanies from "./pages/platform/PlatformCompanies";
import PlatformCompanyDetail from "./pages/platform/PlatformCompanyDetail";

function AdminShell({ title, children }) {
  return <AppShell title={title}>{children}</AppShell>;
}

// Redirect components for Phase 3 schedule centralization (updated for Phase B.1)
// ScheduleAdmin now uses 'scheduleTab' for its internal tabs to avoid conflict with Operations Center's 'tab' param
function ScheduleRequestsRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'schedule');
  params.set('scheduleTab', 'requests');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

function JobsNeedsSchedulingRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'schedule');
  params.set('scheduleTab', 'needs-scheduling');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

// Redirect components for Phase B.1 consolidation
function DispatchCenterRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'today');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

function ScheduleRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'schedule');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

function RoutePlanningRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'routes');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

function SchedulingCenterRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'automation');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

function JobIntelligenceRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'intelligence');
  return <Navigate to={`/admin/operations?${params.toString()}`} replace />;
}

function RevenueHubRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'pipeline');
  return <Navigate to={`/admin/finance?${params.toString()}`} replace />;
}

function FinancialControlCenterRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'intelligence');
  return <Navigate to={`/admin/finance?${params.toString()}`} replace />;
}

// Error fallback component
function ErrorFallback({ error, resetError }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Something went wrong</h1>
        <p className="text-slate-600 mb-6">
          We're sorry, but something unexpected happened. Please refresh the page to try again.
        </p>
        <button
          onClick={resetError}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh Page
        </button>
        {import.meta.env.DEV && (
          <details className="mt-4">
            <summary className="text-sm text-slate-500 cursor-pointer">Error details (dev only)</summary>
            <pre className="mt-2 text-xs text-red-600 overflow-auto max-h-40">
              {error?.toString()}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith("/admin") || location.pathname.startsWith("/crew") || location.pathname.startsWith("/customer") || location.pathname.startsWith("/platform");

  // Update Sentry role tag based on current route
  useEffect(() => {
    if (location.pathname.startsWith("/platform")) {
      Sentry.setTag("role", "platform_admin");
    } else if (location.pathname.startsWith("/admin")) {
      Sentry.setTag("role", "admin");
    } else if (location.pathname.startsWith("/crew")) {
      Sentry.setTag("role", "crew");
    } else if (location.pathname.startsWith("/customer")) {
      Sentry.setTag("role", "customer");
    } else if (location.pathname.startsWith("/quote") || location.pathname.startsWith("/schedule")) {
      Sentry.setTag("role", "public");
    }
  }, [location.pathname]);

  return (
    <Sentry.ErrorBoundary fallback={ErrorFallback}>
      <OnboardingGuard>
        {!hideNavbar && <Navbar />}
        <Routes>
        <Route
          path="/admin/jobs"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Jobs">
                <JobsAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/jobs/needs-scheduling"
          element={<JobsNeedsSchedulingRedirect />}
        />
        <Route
          path="/admin/payments"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Payments">
                <PaymentsAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/expenses"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Expenses">
                <ExpensesAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Settings">
                <Settings />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/billing"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Billing">
                <BillingAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/recurring-jobs"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Recurring Jobs">
                <RecurringJobsAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/customers"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Customers">
                <CustomersAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/crew"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Workers">
                <CrewAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/teams"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Teams">
                <TeamsAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        {/* Phase B.1: Consolidated Operations and Finance hubs */}
        <Route
          path="/admin/operations"
          element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'dispatcher']}>
              <AdminShell title="Operations">
                <OperationsCenterAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/finance"
          element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'dispatcher']}>
              <AdminShell title="Finance">
                <FinanceHubAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        {/* Phase B.1: Redirect old routes to new consolidated hubs */}
        <Route
          path="/admin/schedule"
          element={<ScheduleRedirect />}
        />
        <Route
          path="/admin/schedule/requests"
          element={<ScheduleRequestsRedirect />}
        />
        <Route
          path="/admin/dispatch-center"
          element={<DispatchCenterRedirect />}
        />
        <Route
          path="/admin/route-planning"
          element={<RoutePlanningRedirect />}
        />
        <Route
          path="/admin/scheduling-center"
          element={<SchedulingCenterRedirect />}
        />
        <Route
          path="/admin/job-intelligence"
          element={<JobIntelligenceRedirect />}
        />
        <Route
          path="/admin/revenue-hub"
          element={<RevenueHubRedirect />}
        />
        <Route
          path="/admin/financial-control-center"
          element={<FinancialControlCenterRedirect />}
        />
        <Route
          path="/admin/quotes"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Quotes">
                <QuotesAdmin />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/quotes/new"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="New Quote">
                <QuoteBuilder />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/quotes/:id"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Quote">
                <QuoteBuilder />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route path="/admin/reports" element={<Navigate to="/admin" replace />} />
        <Route
          path="/admin/onboarding"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <OnboardingWizard />
            </ProtectedRoute>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/bootstrap/company" element={<CompanyBootstrap />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/customer/accept-invite" element={<CustomerAcceptInvite />} />
        <Route path="/quote/:token" element={<PublicQuote />} />
        <Route path="/quote/:token/receipt" element={<PublicQuoteReceipt />} />
        <Route path="/schedule/:token" element={<PublicJobScheduleRequest />} />

        {/* Platform Admin Routes */}
        <Route
          path="/platform"
          element={
            <ProtectedRoute allowedRoles={['platform_admin']}>
              <AdminShell title="Platform Dashboard">
                <PlatformDashboard />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform/companies"
          element={
            <ProtectedRoute allowedRoles={['platform_admin']}>
              <AdminShell title="Companies">
                <PlatformCompanies />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform/company/:id"
          element={
            <ProtectedRoute allowedRoles={['platform_admin']}>
              <AdminShell title="Company">
                <PlatformCompanyDetail />
              </AdminShell>
            </ProtectedRoute>
          }
        />

        {/* Root route - role-aware redirect */}
        <Route path="/" element={<RootRedirect />} />
        {/* Customer Portal Routes */}
        <Route
          path="/customer"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/dashboard"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/jobs"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <JobsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/jobs/:id"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <JobDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/quotes"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <QuotesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/quotes/:id"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <QuoteDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/invoices"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <InvoicesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/invoices/:id"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <InvoiceDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/schedule"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <SchedulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/profile"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        {/* Crew portal routes - admin access is intentional for testing/support */}
        <Route
          path="/crew"
          element={
            <ProtectedRoute allowedRoles={['crew', 'admin']}>
              <CrewLayoutV2>
                <CrewDashboard />
              </CrewLayoutV2>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crew/jobs"
          element={
            <ProtectedRoute allowedRoles={['crew', 'admin']}>
              <CrewLayoutV2>
                <CrewPortalMobile />
              </CrewLayoutV2>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crew/job/:id"
          element={
            <ProtectedRoute allowedRoles={['crew', 'admin']}>
              <CrewLayoutV2>
                <CrewJobDetail />
              </CrewLayoutV2>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crew/help"
          element={
            <ProtectedRoute allowedRoles={['crew', 'admin']}>
              <CrewLayoutV2>
                <CrewHelp />
              </CrewLayoutV2>
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminShell title="Admin Dashboard">
                <AdminDashboard />
              </AdminShell>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </OnboardingGuard>
    </Sentry.ErrorBoundary>
  )
}