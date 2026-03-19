import { Link, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";
import useCompanySettings from "../hooks/useCompanySettings";
import { useBrand } from "../context/BrandContext";
import Button from "../components/ui/Button";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import PWAInstallPrompt from "../components/PWAInstallPrompt";
import toast from 'react-hot-toast';

export default function CrewLayout({ children }) {
  const { session, role, fullName } = useUser();
  const { settings } = useCompanySettings();
  const { brand } = useBrand();
  const location = useLocation();
  const navigate = useNavigate();

  const brandName = brand?.companyDisplayName || "ServiceOps";
  const logoUrl = brand?.logoUrl || null;
  const crewLabel = settings?.crew_label || "Crew";
  const primaryColor = brand?.primaryColor || "#2563eb";

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully.");
      window.location.href = "/login";
    } catch (error) {
      console.error("Error signing out:", error);
      // Still redirect even if signOut fails
      window.location.href = "/login";
    }
  };

  const isActive = (path) => {
    if (path === "/crew") {
      return location.pathname === "/crew";
    }
    return location.pathname.startsWith(path);
  };

  const userDisplay = fullName || session?.user?.email || "Account";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/crew" className="flex items-center gap-2">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-7 w-auto object-contain"
                />
              )}
              <span
                className="text-xl font-bold"
                style={{ color: primaryColor }}
              >
                {brandName}
              </span>
            </Link>

            {/* Navigation */}
            <nav className="flex gap-4 ml-6">
              <Link
                to="/crew"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === "/crew"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                style={
                  location.pathname === "/crew" && primaryColor
                    ? {
                        backgroundColor: `${primaryColor}15`,
                        color: primaryColor,
                      }
                    : {}
                }
              >
                Dashboard
              </Link>
              <Link
                to="/crew/jobs"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname.startsWith("/crew/jobs")
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                style={
                  location.pathname.startsWith("/crew/jobs") && primaryColor
                    ? {
                        backgroundColor: `${primaryColor}15`,
                        color: primaryColor,
                      }
                    : {}
                }
              >
                Jobs
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Switch to Admin link (only for admin/manager role) */}
            {(role === "admin" || role === "manager") && (
              <Link
                to="/admin"
                className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1 rounded-md hover:bg-slate-50"
              >
                Switch to Admin
              </Link>
            )}

            <div className="text-sm text-slate-600">{userDisplay}</div>
            <Button
              onClick={logout}
              variant="danger"
              className="px-4 py-1"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      <PWAInstallPrompt />
    </div>
  );
}
