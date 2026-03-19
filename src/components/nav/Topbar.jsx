import { useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { supabase } from "../../supabaseClient";
import Button from "../ui/Button";
import toast from "react-hot-toast";

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

export default function Topbar({ title }) {
  const location = useLocation();
  const { session, fullName } = useUser();

  const displayTitle = title || getRouteLabel(location.pathname);
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
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{displayTitle}</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600">{userDisplay}</div>
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

