import { useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import useCompanySettings from "../../hooks/useCompanySettings";
import { supabase } from "../../supabaseClient";
import Button from "../ui/Button";
import toast from "react-hot-toast";
import { Menu } from "lucide-react";

// Route label mapping
const routeLabels = {
  "/admin": "Admin Dashboard",
  "/admin/jobs": "Jobs",
  "/admin/customers": "Customers",
  "/admin/crew": "Workers",
  "/admin/payments": "Payments",
  "/admin/expenses": "Expenses",
  "/admin/recurring-jobs": "Recurring Jobs",
  "/admin/settings": "Settings",
  "/platform": "Platform Dashboard",
  "/crew": "Worker Portal",
  "/customer": "Customer Portal",
  "/": "Dashboard",
};

function getRouteLabel(pathname) {
  // Check exact match first
  if (routeLabels[pathname]) {
    return routeLabels[pathname];
  }
  // Check if path starts with any route
  for (const [path, label] of Object.entries(routeLabels)) {
    if (pathname.startsWith(path) && path !== "/") {
      return label;
    }
  }
  return "Dashboard";
}

export default function Topbar({ title, onMobileMenuClick }) {
  const location = useLocation();
  const { session, fullName } = useUser();
  const { settings } = useCompanySettings();

  const baseTitle = title || getRouteLabel(location.pathname);
  const crewLabel = settings?.crew_label || "Crew";
  const customerLabel = settings?.customer_label || "Customer";
  const customerLabelPlural = customerLabel.endsWith("s") ? customerLabel : `${customerLabel}s`;

  // Align topbar titles with tenant-configured labels where practical
  const displayTitle =
    baseTitle === "Customers"
      ? customerLabelPlural
      : baseTitle === "Workers"
        ? crewLabel
        : baseTitle;
  const userDisplay = fullName || session?.user?.email || "Account";

  const handleLogout = async () => {
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

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 h-14 sm:h-16 flex items-center shadow-sm shadow-slate-900/5">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onMobileMenuClick}
            className="md:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 truncate">
            {displayTitle}
          </h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:block text-sm text-slate-600 truncate max-w-[18rem]">
            {userDisplay}
          </div>
          {session && (
            <Button
              onClick={handleLogout}
              variant="tertiary"
              className="text-sm"
            >
              Logout
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

