// src/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "./context/UserContext";

export default function ProtectedRoute({ allowedRoles, children }) {
  const { session, role, loading, supportMode } = useUser();
  const location = useLocation();

  // Still loading user/profile - show spinner, don't redirect
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  // Not logged in at all
  if (!session?.user?.id) {
    // Redirect to appropriate login page based on route
    const loginPath = location.pathname.startsWith('/customer') 
      ? '/customer/login' 
      : '/login';
    return <Navigate to={loginPath} replace />;
  }

  // Logged in but wrong role
  if (allowedRoles && !allowedRoles.includes(role)) {
    // Special case: platform_admin in support mode can access admin routes
    if (role === 'platform_admin' && supportMode && allowedRoles.includes('admin')) {
      // Allow access - platform_admin in support mode can access admin routes
    } else {
      // Redirect to appropriate login page based on route
      const loginPath = location.pathname.startsWith('/customer') 
        ? '/customer/login' 
        : '/login';
      return <Navigate to={loginPath} replace />;
    }
  }

  // All good
  return children;
}
