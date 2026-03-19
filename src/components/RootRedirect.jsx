// src/components/RootRedirect.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

/**
 * RootRedirect - Role-aware redirect for root route (/)
 * Redirects authenticated users to their role-appropriate dashboard
 * Unauthenticated users are redirected to login
 */
export default function RootRedirect() {
  const { session, role, loading } = useUser();

  // Still loading - show nothing (parent will handle loading state)
  if (loading) {
    return null;
  }

  // Not authenticated - redirect to login
  if (!session?.user?.id) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated - redirect based on role
  if (role === 'platform_admin') {
    return <Navigate to="/platform" replace />;
  } else if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  } else if (role === 'manager' || role === 'dispatcher') {
    return <Navigate to="/admin/revenue-hub" replace />;
  } else if (role === 'crew') {
    return <Navigate to="/crew" replace />;
  } else if (role === 'customer') {
    return <Navigate to="/customer/dashboard" replace />;
  }

  // Unknown role or no role - redirect to login
  return <Navigate to="/login" replace />;
}
